import { randomUUID } from "node:crypto";
import type { GameRuntime, RoomRecord } from "./service.js";
import { initializePresentation, enqueuePublication, publishDue, syncImmediate, attachBallotTiming } from "./presentation.js";

export function validateLegacyRoom(room: RoomRecord): void {
  const fail=(category:string):never=>{throw new Error(`Room ${room.code}: cannot migrate ${category}`);};
  if(!Array.isArray(room.participants)||new Set(room.participants.map(p=>p.id)).size!==room.participants.length)fail("participant identifiers");
  const players=room.participants.filter(p=>p.mode==="PLAYER");
  if(new Set(players.map(p=>p.seat)).size!==players.length||players.some(p=>!Number.isInteger(p.seat)||p.seat!<1||p.seat!>room.playerCount))fail("seat layout");
  const game=room.game;if(!game)return;
  if(!Array.isArray(game.events)||!Array.isArray(game.aliveSeats)||!Array.isArray(game.ghostVoteSeats)||!Array.isArray(game.readySeats))fail("game collections");
  if(!["ROLE_REVEAL","FIRST_NIGHT","OTHER_NIGHT","DAY_DISCUSSION","NOMINATION","VOTING","GAME_OVER","ABORTED"].includes(game.phase))fail("phase");
  if(room.assignments.length!==room.playerCount||game.aliveSeats.some(s=>!players.some(p=>p.seat===s)))fail("role/seat references");
  if(game.phase==="VOTING"&&!game.nomination)fail("active ballot");
  const ballot=game.nomination;
  if(ballot?.mode==='SIMULTANEOUS'){
    if(!Array.isArray(ballot.voterOrder)||![ballot.defenseUntil,ballot.preparationEndsAt,ballot.voteStartsAt,ballot.voteEndsAt].every(Number.isFinite)||typeof ballot.defenseFinished!=='boolean'||typeof ballot.countdownStarted!=='boolean'||ballot.voteEndsAt! - ballot.voteStartsAt! !== 8000)fail("simultaneous ballot clock");
  }else if(ballot?.voterOrder && (!Array.isArray(ballot.countedSeats)||!ballot.countedVotes||![ballot.defenseUntil,ballot.voteStartsAt,ballot.voteEndsAt,ballot.nextCountAt].every(Number.isFinite)))fail("ballot clock or frozen votes");
}

/** v1 receipts often contain a complete private room. Keep only the operation's small result. */
export function migrateReceipts(room: RoomRecord): void {
  const receipts = room.metadata?.commandReceipts as Record<string, { fingerprint: string; kind?: string; result?: unknown }> | undefined;
  if (!receipts) return;
  for (const [key, receipt] of Object.entries(receipts)) {
    if (receipt.kind) continue;
    const result = receipt.result;
    const value = result && typeof result === "object" ? result as Record<string, unknown> : undefined;
    if (value && ("participants" in value || "participant" in value || ("game" in value && "state" in value))) {
      receipts[key] = { fingerprint: receipt.fingerprint, kind: "view" };
    } else {
      if (Buffer.byteLength(JSON.stringify(result) ?? "", "utf8") > 16_384) throw new Error(`Cannot migrate receipt in room ${room.code}: unknown oversized result`);
      receipts[key] = { ...receipt, kind: "result" };
    }
  }
}

/** Rebuild only what was public at the upgrade instant, retaining absolute ballot deadlines. */
export function migratePresentation(game: GameRuntime, playerCount: number, now: number, immediate = false): void {
  if (game.publicProjection && !immediate) return;
  if (immediate) {
    delete game.publicProjection;
    initializePresentation(game);
    game.publicProjection!.events = structuredClone(game.events);
    game.publicProjection!.presentationUntil = Math.max(game.presentationUntil, ...game.events.map(event => event.startsAt + event.durationMs));
    game.publicProjection!.revealComplete = game.phase === "GAME_OVER";
    if (game.winner) game.publicProjection!.winner = game.winner;
    if (game.winReason) game.publicProjection!.winReason = game.winReason;
    game.pendingPublications = [];
    return;
  }
  const source: GameRuntime = {
    ...structuredClone(game), phase: "ROLE_REVEAL", day: 0, contextId: randomUUID(),
    aliveSeats: Array.from({ length: playerCount }, (_, i) => i + 1),
    readySeats: [], voteSubmissions: {}, presentationUntil: 0, phaseDeadlineAt: 0, events: [],
  };
  delete source.publicProjection; delete source.pendingPublications; delete source.nomination;
  delete source.onBlock; delete source.winner; delete source.winReason; delete source.nightStartAliveSeats;
  initializePresentation(source);
  for (const event of game.events) {
    if (!Number.isFinite(event.startsAt) || !Number.isFinite(event.durationMs)) throw new Error("Invalid legacy event timing");
    source.contextId = randomUUID();
    if (event.kind === "NIGHT_FALLS") {
      source.phase = event.day === 0 ? "FIRST_NIGHT" : "OTHER_NIGHT";
      source.day = event.day ?? source.day;
      delete source.onBlock; delete source.nomination; source.executionTied = false;
    } else if (event.kind === "NOMINATION") {
      if (event.actorSeat === undefined || event.targetSeat === undefined) throw new Error("Legacy nomination has no public seats");
      source.nomination = { ballotId: randomUUID(), nominatorSeat: event.actorSeat, nomineeSeat: event.targetSeat };
      source.phase = "VOTING";
      if (game.nomination?.nominatorSeat === event.actorSeat && game.nomination.nomineeSeat === event.targetSeat) source.nomination = structuredClone(game.nomination);
    } else if (event.kind === "VOTE_RESULT") {
      source.phase = "NOMINATION";
      if (event.votes === undefined || event.targetSeat === undefined || event.threshold === undefined) throw new Error("Legacy vote result is incomplete");
      if (event.votes >= event.threshold) {
        if (!source.onBlock || event.votes > source.onBlock.votes) { source.onBlock = { seat: event.targetSeat, votes: event.votes }; source.executionTied = false; }
        else if (event.votes === source.onBlock.votes) source.executionTied = true;
      }
    } else if (event.kind === "DAWN") {
      source.phase = "DAY_DISCUSSION"; source.day = event.day ?? source.day + 1;
    } else if (event.kind === "GAME_OVER") {
      source.phase = "GAME_OVER";
      if (event.outcome !== "GOOD" && event.outcome !== "EVIL") throw new Error("Legacy finale has no winner");
      source.winner = event.outcome;
      if (game.winReason) source.winReason = game.winReason;
    }
    if (["SHOT", "EXECUTION", "DAWN"].includes(event.kind)) source.aliveSeats = source.aliveSeats.filter(seat => !(event.seats ?? []).includes(seat));
    enqueuePublication(source, event);
    if (event.kind === "NOMINATION") attachBallotTiming(source, event.id);
  }
  game.publicProjection = source.publicProjection!;
  game.pendingPublications = source.pendingPublications!;
  publishDue(game, now);
  const projection = game.publicProjection;
  if (["FIRST_NIGHT", "OTHER_NIGHT"].includes(projection.phase) && game.nightStartAliveSeats) projection.aliveSeats = [...game.nightStartAliveSeats];
  // Legacy zero-duration records have already been disclosed, including older untyped notices.
  if (game.events.every(event => event.durationMs === 0 && event.startsAt <= now)) {
    projection.aliveSeats = [...(game.nightStartAliveSeats ?? game.aliveSeats)];
    projection.events = structuredClone(game.events);
    projection.revealComplete = game.phase === "GAME_OVER";
    if (game.winner) projection.winner = game.winner;
    if (game.winReason) projection.winReason = game.winReason;
  }
  projection.ghostVoteSeats = [...game.ghostVoteSeats];
  if (game.nomination && projection.phase === "VOTING") {
    projection.nomination = structuredClone(game.nomination);
    projection.voteSubmissions = { ...game.voteSubmissions };
  }
  // A cancelled nomination has no VOTE_RESULT and must not be resurrected from the last NOMINATION.
  if (!game.nomination && game.phase === "NOMINATION" && !game.pendingPublications.some(node => node.patch.phase)) projection.nomination = null;
  syncImmediate(game, now);
}
