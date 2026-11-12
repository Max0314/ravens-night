import {experienceTiming,isNonBlockingExperience} from '@ravens/contracts';
import type { ExperienceEvent } from "@ravens/contracts";
import type { GameRuntime } from "./service.js";

export interface PublicProjection {
  publishedPhaseStartedAt:number;
  phase: GameRuntime["phase"];
  contextId: string;
  day: number;
  aliveSeats: number[];
  ghostVoteSeats: number[];
  readySeats: number[];
  voteSubmissions: Record<number, boolean>;
  nomination: GameRuntime["nomination"] | null;
  onBlock: GameRuntime["onBlock"] | null;
  executionTied: boolean;
  presentationUntil: number;
  phaseDeadlineAt: number;
  pauseReason?: string;
  winner?: "GOOD" | "EVIL";
  winReason?: string;
  revealComplete: boolean;
  events: ExperienceEvent[];
}
export interface Publication {
  id: string;
  eventId: string;
  at: number;
  order: number;
  patch: Partial<Omit<PublicProjection, "events">>;
  eventPatch?: ExperienceEvent;
  deaths?: number[];
}

export function initializePresentation(game: GameRuntime, now?:number): void {
  game.publicProjection ??= {
    publishedPhaseStartedAt:now??game.events[0]?.occurredAt??0,
    phase: game.phase, contextId: game.contextId, day: game.day,
    aliveSeats: [...(game.nightStartAliveSeats ?? game.aliveSeats)], ghostVoteSeats: [...game.ghostVoteSeats],
    readySeats: [...game.readySeats], voteSubmissions: { ...game.voteSubmissions },
    nomination: game.nomination ? structuredClone(game.nomination) : null, onBlock: game.onBlock ? { ...game.onBlock } : null,
    executionTied: game.executionTied, presentationUntil: 0, phaseDeadlineAt: game.phaseDeadlineAt,
    revealComplete: false, events: [],
  };
  game.pendingPublications ??= [];
}

const neutral: Record<ExperienceEvent["kind"], string> = {
  NOTICE: "村庄记录", NIGHT_FALLS: "夜幕降临。", SHOT: "猎魔人射击。", NOMINATION: "公开提名。",
  VOTE_RESULT: "表决结果。", EXECUTION: "正在宣布处决结果。", DAWN: "黎明将至。", GAME_OVER: "本局即将结束。",
};
function safeStart(event: ExperienceEvent): ExperienceEvent {
  return {
    id: event.id, gameId: event.gameId, seq: event.seq, kind: event.kind,
    occurredAt: event.occurredAt, startsAt: event.startsAt, durationMs: event.durationMs, timingVersion:event.timingVersion??1, ...(event.day === undefined ? {} : { day: event.day }),
    message: neutral[event.kind],
    ...(event.actorSeat === undefined ? {} : { actorSeat: event.actorSeat }),
    ...(event.targetSeat === undefined ? {} : { targetSeat: event.targetSeat }),
  };
}
export function enqueuePublication(game: GameRuntime, event: ExperienceEvent): void {
  initializePresentation(game);
  if(isNonBlockingExperience(event.kind,event.timingVersion??1)){
    // Announcements are already public at commit. No delayed state patch may rewind a
    // later hand change, nomination or shot; the caller syncs the current business state.
    game.pendingPublications!.push({id:`${event.id}:announcement`,eventId:event.id,at:event.startsAt,order:event.seq*3,patch:{},eventPatch:structuredClone(event)});
    return;
  }
  const duration = event.durationMs;
  const offset = duration === 0 ? 0 : experienceTiming(event.kind,event.timingVersion??1).resultOffset;
  const end = event.startsAt + duration;
  const startPatch: Publication["patch"] = { presentationUntil: end };
  const resultPatch: Publication["patch"] = {};
  if (event.kind === "NIGHT_FALLS") Object.assign(startPatch, { phase: game.phase, contextId: game.contextId, day: game.day, nomination: null, onBlock: null, executionTied: false, readySeats: [], voteSubmissions: {} });
  if (event.kind === "NOMINATION") Object.assign(startPatch, { phase: "VOTING", contextId: game.contextId, nomination: structuredClone(game.nomination), voteSubmissions: {}, readySeats: [] });
  if (event.kind === "SHOT") Object.assign(startPatch, { contextId: game.contextId, readySeats: [] });
  if (event.kind === "DAWN") Object.assign(resultPatch, { phase: "DAY_DISCUSSION", contextId: game.contextId, day: game.day, nomination: null, readySeats: [], voteSubmissions: {} });
  if (event.kind === "VOTE_RESULT") Object.assign(startPatch, { phase: "NOMINATION", contextId: game.contextId, nomination: null, onBlock: game.onBlock ? { ...game.onBlock } : null, executionTied: game.executionTied, readySeats: [] });
  if (event.kind === "GAME_OVER") {
    Object.assign(startPatch, { phase: "GAME_OVER", contextId: game.contextId, nomination: null, readySeats: [] });
    Object.assign(resultPatch, { winner: game.winner, winReason: game.winReason });
  }
  game.pendingPublications!.push(
    { id: `${event.id}:start`, eventId: event.id, at: event.startsAt, order: event.seq * 3, patch: startPatch, eventPatch: offset === 0 ? structuredClone(event) : safeStart(event) },
    { id: `${event.id}:result`, eventId: event.id, at: event.startsAt + offset, order: event.seq * 3 + 1, patch: resultPatch, eventPatch: structuredClone(event),
      ...(["SHOT", "EXECUTION", "DAWN"].includes(event.kind) ? { deaths: [...(event.seats ?? [])] } : {}) },
    { id: `${event.id}:end`, eventId: event.id, at: end, order: event.seq * 3 + 2, patch: event.kind === "GAME_OVER" ? { revealComplete: true } : {} },
  );
}

/** Capture the public ballot timing before a shot can internally finish the game. */
export function attachBallotTiming(game: GameRuntime, eventId?: string): void {
  if (!game.nomination) return;
  const node = game.pendingPublications?.find(node => node.eventId === (eventId ?? game.events.at(-1)?.id) && node.id.endsWith(":start"));
  if (node) node.patch.nomination = structuredClone(game.nomination);
}

/** Called only inside the staged, committed mutation path, never by a GET serializer. */
export function publishDue(game: GameRuntime, now: number): boolean {
  initializePresentation(game);
  const projection = game.publicProjection!;
  const due = game.pendingPublications!.filter(node => node.at <= now).sort((a, b) => a.at - b.at || a.order - b.order);
  for (const node of due) {
    if(node.patch.phase&&node.patch.phase!==projection.phase||node.patch.day!==undefined&&node.patch.day!==projection.day)projection.publishedPhaseStartedAt=node.at;
    Object.assign(projection, structuredClone(node.patch));
    if (node.deaths) projection.aliveSeats = projection.aliveSeats.filter(seat => !node.deaths!.includes(seat));
    if (node.eventPatch) {
      const index = projection.events.findIndex(event => event.id === node.eventId);
      if (index < 0) projection.events.push(structuredClone(node.eventPatch)); else projection.events[index] = structuredClone(node.eventPatch);
    }
    if (node.id.endsWith(":result") && game.deferredRoleChanges) game.deferredRoleChanges = game.deferredRoleChanges.filter(change => change.eventId !== node.eventId);
  }
  game.pendingPublications = game.pendingPublications!.filter(node => node.at > now);
  return due.length > 0;
}

export function syncImmediate(game: GameRuntime, now: number): void {
  initializePresentation(game);
  const projection = game.publicProjection!;
  // Future deaths/finales cannot change publicly inferable fields during the choreography.
  if (now < game.presentationUntil) return;
  if(projection.phase!==game.phase||projection.day!==game.day)projection.publishedPhaseStartedAt=now;
  projection.phase = game.phase;
  projection.contextId = game.contextId;
  projection.day = game.day;
  projection.ghostVoteSeats = [...game.ghostVoteSeats];
  projection.readySeats = [...game.readySeats];
  projection.voteSubmissions = { ...game.voteSubmissions };
  projection.nomination = game.nomination ? structuredClone(game.nomination) : null;
  projection.onBlock = game.onBlock ? { ...game.onBlock } : null;
  projection.executionTied = game.executionTied;
  projection.phaseDeadlineAt = game.phaseDeadlineAt;
  if (game.pauseReason) projection.pauseReason = game.pauseReason; else delete projection.pauseReason;
}

export function abortPresentation(game: GameRuntime, now: number): void {
  initializePresentation(game);
  publishDue(game, now);
  game.pendingPublications = [];
  game.events = structuredClone(game.publicProjection!.events);
  Object.assign(game.publicProjection!, { phase: "ABORTED", contextId: game.contextId, nomination: null, presentationUntil: 0, readySeats: [], revealComplete: false });
  delete game.publicProjection!.winner; delete game.publicProjection!.winReason;
}

export function projectedGame(raw: GameRuntime): GameRuntime {
  initializePresentation(raw);
  const { nomination, onBlock, winner, winReason, pauseReason, ...published } = raw.publicProjection!;
  const game: GameRuntime = { ...raw, ...published };
  if (nomination) game.nomination = nomination; else delete game.nomination;
  if (onBlock) game.onBlock = onBlock; else delete game.onBlock;
  if (winner) game.winner = winner; else delete game.winner;
  if (winReason) game.winReason = winReason; else delete game.winReason;
  if (pauseReason) game.pauseReason = pauseReason; else delete game.pauseReason;
  return game;
}
