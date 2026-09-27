import { randomUUID } from "node:crypto";
import {
  ROLE_CATALOG,
  chooseInformationResult,
  randomAt,
  resolveSpecialWin,
  roleById,
  setupGameRoles,
  type RoleAssignment,
} from "@ravens/game-engine";
import type { ExperienceEvent, StorytellerDecision } from "@ravens/contracts";
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, shuffled } from "@ravens/game-engine";
import { createOpaqueToken, hashOpaqueToken } from "../auth/session.js";
import { createRoomCode, normalizeRoomCode } from "./codes.js";

export type ParticipantMode = "PLAYER" | "DISPLAY";
export type RoomPlayMode = "IN_PERSON" | "REMOTE" | "HYBRID";

export interface ParticipantRecord {
  id: string;
  nickname: string;
  mode: ParticipantMode;
  seat?: number;
  tokenHash: string;
  connected: boolean;
  tutorialComplete: boolean;
  ready: boolean;
  lastSeenAt: number;
  left?: boolean;
}

export interface RoomRecord {
  metadata?: Record<string, unknown>;
  id: string;
  code: string;
  organizerName: string;
  organizerParticipantId?: string;
  playerCount: number;
  playMode: RoomPlayMode;
  voiceRoomUrl?: string;
  lastActivityAt: string;
  participants: ParticipantRecord[];
  state: "LOBBY" | "TUTORIAL" | "RUNNING" | "GAME_OVER";
  organizerTokenHash: string;
  assignments: RoleAssignment[];
  gameNumber: number;
  revision: number;
  game?: GameRuntime;
}

type RuntimePhase = "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER";
type PrivateHistoryPhase = RuntimePhase | "HISTORY";
type PrivateHistoryKind = "IDENTITY" | "ACTION" | "INFORMATION" | "ROLE_CHANGE" | "NOTICE";

interface PrivateHistoryEntry {
  seq: number;
  phase: PrivateHistoryPhase;
  day: number;
  kind: PrivateHistoryKind;
  text: string;
  effect?: "POISON" | "PROTECT" | "DIVINATION";
  targetSeats?: number[];
}

interface NominationRuntime {
  nominatorSeat: number;
  nomineeSeat: number;
  defenseUntil?: number;
  voteStartsAt?: number;
  voteEndsAt?: number;
  nextCountAt?: number;
  voteStarted?: boolean;
  voterOrder?: number[];
  countedSeats?: number[];
  countedVotes?: Record<number, boolean>;
}

const VOTE_SLOT_MS = 1500;
const DEFENSE_MS = 20_000;

interface GameRuntime {
  gameId: string;
  storytellerSeed: string;
  presentationUntil: number;
  phaseDeadlineAt: number;
  pauseReason?: string;
  decisions: StorytellerDecision[];
  nightStep?: number;
  nightOrder?: Array<{ seat: number; roleId: string }>;
  nightStartAliveSeats?: number[];
  protectedSeat?: number;
  poisonSourceSeat?: number;
  lastExecutedSeat?: number;
  executionDeathRoleId?: string;
  claimDayBySeat: Record<number, number>;
  informationPairs?: Record<number, { targetSeat: number; decoySeat: number }>;
  phase: RuntimePhase;
  day: number;
  aliveSeats: number[];
  ghostVoteSeats: number[];
  confirmedRoleSeats: number[];
  nominatedBySeats: number[];
  nominatedSeats: number[];
  readySeats: number[];
  messages: Record<number, string[]>;
  privateHistory: Record<number, PrivateHistoryEntry[]>;
  nightSubmissions: Record<number, number[]>;
  voteSubmissions: Record<number, boolean>;
  usedAbilitySeats: number[];
  virginSpentSeats: number[];
  butlerMasterSeat?: number;
  poisonedSeat?: number;
  redHerringSeat?: number;
  executionTied: boolean;
  pendingRavenkeeperSeat?: number;
  nightDeaths?: number[];
  lastExecutedRoleId?: string;
  events: ExperienceEvent[];
  nomination?: NominationRuntime;
  onBlock?: { seat: number; votes: number };
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}

export class RoomService {
  readonly #rooms = new Map<string, RoomRecord>();
  readonly #now: () => number;
  readonly #presentation: boolean;

  constructor(options: { now?: () => number; presentation?: boolean } = {}) {
    this.#now = options.now ?? Date.now;
    this.#presentation = options.presentation ?? true;
  }

  create(playerCount: number, organizerName: string, playMode: RoomPlayMode = "IN_PERSON", voiceRoomUrl?: string): { room: RoomRecord; organizerToken: string } {
    if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 12) {
      throw new Error("Player count must be between 5 and 12");
    }
    if (!["IN_PERSON", "REMOTE", "HYBRID"].includes(playMode)) throw new Error("Unknown play mode");
    const normalizedVoiceRoomUrl = voiceRoomUrl?.trim();
    if (normalizedVoiceRoomUrl && !isSafeExternalUrl(normalizedVoiceRoomUrl)) throw new Error("Voice link must use http or https");
    let code = createRoomCode();
    while (this.#rooms.has(code)) code = createRoomCode();
    const organizerToken = createOpaqueToken();
    const room: RoomRecord = {
      id: randomUUID(),
      code,
      organizerName: organizerName.trim().slice(0, 24) || "组织者",
      playerCount,
      playMode,
      ...(normalizedVoiceRoomUrl ? { voiceRoomUrl: normalizedVoiceRoomUrl } : {}),
      lastActivityAt: new Date(this.#now()).toISOString(),
      participants: [],
      state: "LOBBY",
      organizerTokenHash: hashOpaqueToken(organizerToken),
      assignments: [],
      gameNumber: 0,
      revision: 1,
    };
    this.#rooms.set(code, room);
    return { room: structuredClone(room), organizerToken };
  }

  join(codeInput: string, nicknameInput: string, mode: ParticipantMode): { participant: ParticipantRecord; token: string } {
    const room = this.find(codeInput);
    if (mode !== "PLAYER" && mode !== "DISPLAY") throw new Error("Unknown participant mode");
    if (mode === "PLAYER" && room.state !== "LOBBY") throw new Error("Game already started");
    const nickname = nicknameInput.trim().slice(0, 24);
    if (!nickname) throw new Error("Nickname is required");
    if (mode === "PLAYER" && room.participants.some((participant) => participant.mode === "PLAYER" && participant.nickname === nickname)) {
      throw new Error("这个昵称已经有人使用");
    }
    if (mode === "PLAYER" && room.participants.filter((participant) => participant.mode === "PLAYER").length >= room.playerCount) {
      throw new Error("Room is full");
    }
    const token = createOpaqueToken();
    const players = room.participants.filter((participant) => participant.mode === "PLAYER");
    const participant: ParticipantRecord = {
      id: randomUUID(),
      nickname,
      mode,
      ...(mode === "PLAYER" ? { seat: players.length + 1 } : {}),
      tokenHash: hashOpaqueToken(token),
      connected: true,
      tutorialComplete: false, ready: false, lastSeenAt: this.#now(),
    };
    room.participants.push(participant);
    if (mode === "PLAYER" && !room.organizerParticipantId && players.length === 0) {
      room.organizerParticipantId = participant.id;
      room.organizerName = participant.nickname;
    }
    this.changed(room);
    return { participant: structuredClone(participant), token };
  }

  leave(codeInput: string, playerToken: string): { roomDestroyed: boolean; organizerChanged: boolean } {
    const room = this.find(codeInput);
    const participantIndex = room.participants.findIndex((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (participantIndex < 0) throw new Error("Player authorization failed");
    const participant = room.participants[participantIndex]!;
    if (participant.mode === "PLAYER" && room.state !== "LOBBY" && room.state !== "GAME_OVER") throw new Error("游戏已经开始，不能中途退出房间");

    const previousOrganizerId = this.organizer(room)?.id;
    if (room.state === "GAME_OVER" && participant.mode === "PLAYER") {
      participant.left = true;
      participant.connected = false;
      participant.tokenHash = hashOpaqueToken(createOpaqueToken());
    } else room.participants.splice(participantIndex, 1);
    const players = room.participants
      .filter((candidate) => candidate.mode === "PLAYER" && !candidate.left)
      .sort((left, right) => left.seat! - right.seat!);
    if (players.length === 0) {
      this.#rooms.delete(room.code);
      return { roomDestroyed: true, organizerChanged: previousOrganizerId === participant.id };
    }
    if (room.state === "LOBBY") players.forEach((candidate, index) => { candidate.seat = index + 1; });
    const organizerChanged = previousOrganizerId === participant.id;
    if (organizerChanged) {
      room.organizerParticipantId = players[0]!.id;
      room.organizerName = players[0]!.nickname;
      room.organizerTokenHash = players[0]!.tokenHash;
    }
    this.changed(room);
    return { roomDestroyed: false, organizerChanged };
  }

  listCodes(): string[] { return [...this.#rooms.keys()]; }

  snapshot(codeInput: string): RoomRecord { return structuredClone(this.find(codeInput)); }

  reorderSeats(codeInput: string, displayToken: string, participantIds: string[]): void {
    const room = this.find(codeInput);
    if (room.state !== "LOBBY") throw new Error("座位只能在开局前调整");
    const display = room.participants.find((candidate) => candidate.tokenHash === hashOpaqueToken(displayToken));
    if (!display || (display.mode !== "DISPLAY" && this.organizer(room)?.id !== display.id)) throw new Error("只有房主或公共大屏可以调整座位");
    const players = room.participants.filter((candidate) => candidate.mode === "PLAYER");
    const currentIds = new Set(players.map((candidate) => candidate.id));
    if (participantIds.length !== players.length || new Set(participantIds).size !== participantIds.length || participantIds.some((id) => !currentIds.has(id))) {
      throw new Error("座位顺序必须包含当前全部玩家且不能重复");
    }
    const playersById = new Map(players.map((candidate) => [candidate.id, candidate]));
    participantIds.forEach((id, index) => { playersById.get(id)!.seat = index + 1; });
    this.changed(room);
  }

  restore(snapshots: RoomRecord[]): void {
    for (const snapshot of snapshots) {
      const code = normalizeRoomCode(snapshot.code);
      if (snapshot.playerCount < 5 || snapshot.playerCount > 12 || !Array.isArray(snapshot.participants)) continue;
      const game = snapshot.game ? this.restoreGame(snapshot.game, `legacy-game-${snapshot.gameNumber ?? 0}:${randomUUID()}`) : undefined;
      snapshot.participants = snapshot.participants.map((participant) => ({ ...participant, ready: participant.ready ?? false, lastSeenAt: participant.lastSeenAt ?? this.#now() }));
      const organizerParticipantId = snapshot.organizerParticipantId
        ?? snapshot.participants.find((participant) => participant.mode === "PLAYER" && participant.seat === 1)?.id;
      this.#rooms.set(code, structuredClone({ ...snapshot, playMode: snapshot.playMode ?? "IN_PERSON", lastActivityAt: snapshot.lastActivityAt ?? new Date(this.#now()).toISOString(), ...(organizerParticipantId ? { organizerParticipantId } : {}), ...(game ? { game } : {}), code, gameNumber: snapshot.gameNumber ?? 0, revision: snapshot.revision || 1 }));
    }
  }

  expireIdle(now = Date.now(), lobbyTtlMs = 2 * 60 * 60 * 1000, activeTtlMs = 24 * 60 * 60 * 1000): string[] {
    const expired: string[] = [];
    for (const room of this.#rooms.values()) {
      const age = now - Date.parse(room.lastActivityAt);
      const ttl = room.state === "LOBBY" ? lobbyTtlMs : activeTtlMs;
      if (Number.isFinite(age) && age >= ttl) {
        this.#rooms.delete(room.code);
        expired.push(room.code);
      }
    }
    return expired;
  }

  find(codeInput: string): RoomRecord {
    const code = normalizeRoomCode(codeInput);
    const room = this.#rooms.get(code);
    if (!room) throw new Error("Room not found");
    return room;
  }

  publicView(codeInput: string) {
    const room = this.find(codeInput);
    const organizer = this.organizer(room);
    return {
      code: room.code,
      revision: room.revision, serverNow: this.#now(),
      rulesSummary: room.playerCount < 7 ? "5–6 人采用官方 Teensyville：恶魔与爪牙互不认识，恶魔没有三个伪装。提名后辩护 20 秒，从被提名者下一座顺时针每席 1.5 秒计票；本席计票前可调整举手，未举手不消耗鬼票。" : "暗流涌动标准规则。提名后辩护 20 秒，从被提名者下一座顺时针每席 1.5 秒计票；本席计票前可调整举手，未举手不消耗鬼票。",
      state: room.state,
      playerCount: room.playerCount,
      playMode: room.playMode,
      ...(room.voiceRoomUrl ? { voiceRoomUrl: room.voiceRoomUrl } : {}),
      ...(organizer ? { organizerId: organizer.id, organizerName: organizer.nickname } : {}),
      participants: room.participants.map(({ tokenHash: _tokenHash, tutorialComplete: _tutorialComplete, ...participant }) => participant),
      ...(room.game ? { game: this.publicGame(room) } : {}),
    };
  }

  startTutorial(codeInput: string, organizerToken: string): void {
    const room = this.find(codeInput);
    const players = room.participants.filter((participant) => participant.mode === "PLAYER");
    const organizerHash = hashOpaqueToken(organizerToken);
    if (room.organizerTokenHash !== organizerHash && this.organizer(room)?.tokenHash !== organizerHash) throw new Error("Organizer authorization failed");
    if (room.state !== "LOBBY") throw new Error("Only a lobby can start; finish or reset the previous game first");
    if (players.length !== room.playerCount) throw new Error("All players must join before starting");
    if (players.some((player) => !player.ready)) throw new Error("所有玩家准备后才能开始");
    for (const player of players) player.tutorialComplete = false;
    delete room.game;
    room.gameNumber = (room.gameNumber ?? 0) + 1;
    room.assignments = setupGameRoles(room.playerCount, `${room.id}:${room.code}:game-${room.gameNumber}`);
    room.state = "TUTORIAL";
    this.changed(room);
  }

  reset(codeInput: string, organizerToken: string): void {
    const room = this.find(codeInput);
    const organizerHash = hashOpaqueToken(organizerToken);
    const organizer = this.organizer(room);
    if (room.organizerTokenHash !== organizerHash && organizer?.tokenHash !== organizerHash) throw new Error("Organizer authorization failed");
    if (room.state === "RUNNING") throw new Error("不能重置进行中的对局");
    room.state = "LOBBY";
    room.participants = room.participants.filter((participant) => !participant.left);
    room.participants.filter((participant) => participant.mode === "PLAYER").sort((a, b) => a.seat! - b.seat!).forEach((participant, index) => { participant.seat = index + 1; });
    room.assignments = [];
    delete room.game;
    for (const participant of room.participants) { participant.tutorialComplete = false; participant.ready = false; }
    this.changed(room);
  }

  completeTutorial(codeInput: string, playerToken: string): void {
    const room = this.find(codeInput);
    if (room.state !== "TUTORIAL") throw new Error("Tutorial is not active");
    const participant = room.participants.find((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (!participant || participant.mode !== "PLAYER") throw new Error("Player authorization failed");
    participant.tutorialComplete = true;
    const players = room.participants.filter((candidate) => candidate.mode === "PLAYER");
    if (players.length === room.playerCount && players.every((candidate) => candidate.tutorialComplete)) room.state = "RUNNING";
    if (room.state === "RUNNING" && !room.game) room.game = this.createGame(room);
    this.changed(room);
  }

  setReady(codeInput: string, playerToken: string, ready: boolean): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    if (room.state !== "LOBBY") throw new Error("只能在大厅准备");
    if (typeof ready !== "boolean") throw new Error("Ready must be boolean");
    participant.ready = ready;
    this.changed(room);
  }

  pulse(codeInput: string, token: string, now = this.#now()): boolean {
    const room = this.find(codeInput);
    const participant = room.participants.find((candidate) => !candidate.left && candidate.tokenHash === hashOpaqueToken(token));
    if (!participant) throw new Error("Participant authorization failed");
    const wasOffline = !participant.connected;
    participant.lastSeenAt = now;
    participant.connected = true;
    room.lastActivityAt = new Date(now).toISOString();
    if (wasOffline) room.revision += 1;
    return wasOffline;
  }

  rotateParticipantToken(codeInput: string, oldToken: string): { participant: ParticipantRecord; token: string } {
    const room = this.find(codeInput);
    const participant = room.participants.find((candidate) => !candidate.left && candidate.tokenHash === hashOpaqueToken(oldToken));
    if (!participant) throw new Error("Participant authorization failed");
    const token = createOpaqueToken();
    const oldHash = participant.tokenHash;
    participant.tokenHash = hashOpaqueToken(token);
    participant.lastSeenAt = this.#now();
    participant.connected = true;
    if (room.organizerTokenHash === oldHash) room.organizerTokenHash = participant.tokenHash;
    this.changed(room);
    return { participant: structuredClone(participant), token };
  }

  resume(codeInput: string, token: string): void {
    const { room } = this.authorizedPlayer(codeInput, token);
    const game = this.requireGame(room);
    if (!game.pauseReason || game.phase === "GAME_OVER") throw new Error("当前阶段没有暂停，不能延长截止时间");
    delete game.pauseReason;
    this.deadline(game);
    this.changed(room);
  }

  advanceTime(now = this.#now()): string[] {
    const changed: string[] = [];
    for (const room of this.#rooms.values()) {
      let dirty = false;
      for (const participant of room.participants) {
        if (participant.connected && now - participant.lastSeenAt >= 30_000) { participant.connected = false; dirty = true; }
      }
      const game = room.game;
      if (game?.phase === "VOTING" && game.nomination?.voterOrder && now >= game.presentationUntil) dirty = this.advanceBallot(room, now) || dirty;
      if (game && game.phase !== "GAME_OVER" && now >= game.phaseDeadlineAt && now >= game.presentationUntil && !game.pauseReason) {
        if (game.phase === "VOTING") {
          for (const seat of this.eligibleVoters(game)) game.voteSubmissions[seat] ??= false;
          this.settleVote(room);
        } else {
          game.pauseReason = "本阶段等待超时。请确认所有玩家已连接并完成手机上的操作；完成操作后继续。";
          this.event(game, "说书人正在等候玩家，请检查连接并完成当前操作。");
        }
        dirty = true;
      }
      if (dirty) { room.revision += 1; changed.push(room.code); }
    }
    return changed;
  }

  confirmRole(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "ROLE_REVEAL") return;
    if (!game.confirmedRoleSeats.includes(participant.seat!)) game.confirmedRoleSeats.push(participant.seat!);
    delete game.pauseReason;
    if (this.#now() >= game.phaseDeadlineAt) this.deadline(game);
    if (game.confirmedRoleSeats.length === room.playerCount) {
      game.phase = "FIRST_NIGHT";
      this.event(game, "所有身份已确认。村庄进入首夜。", "NIGHT_FALLS");
      this.initializeNight(room);
      this.settleNightIfReady(room);
    }
    this.changed(room);
  }

  submitAction(codeInput: string, playerToken: string, targetSeats: number[]): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    if (game.phase !== "FIRST_NIGHT" && game.phase !== "OTHER_NIGHT") throw new Error("No night action is active");
    if (game.nightSubmissions[participant.seat!]) throw new Error("Night action already submitted");
    const requirement = this.nightRequirement(room, participant.seat!);
    if (!requirement) throw new Error("This role has no pending action");
    if (!Array.isArray(targetSeats) || targetSeats.length !== requirement.count || new Set(targetSeats).size !== targetSeats.length) throw new Error("Invalid number of targets");
    if (targetSeats.some((seat) => !requirement.legalSeats.includes(seat))) throw new Error("Illegal target");
    const roleId = this.assignment(room, participant.seat!).perceivedRoleId;
    const effect = roleId === "poisoner" ? "POISON" : roleId === "monk" ? "PROTECT" : ["fortune_teller", "ravenkeeper"].includes(roleId) ? "DIVINATION" : undefined;
    this.privateMessage(game, participant.seat!, this.describeNightAction(room, participant.seat!, targetSeats), "ACTION", effect, targetSeats);
    game.nightSubmissions[participant.seat!] = [...targetSeats];
    delete game.pauseReason;
    if (this.#now() >= game.phaseDeadlineAt) this.deadline(game);
    this.settleNightIfReady(room);
    this.changed(room);
  }

  nominate(codeInput: string, playerToken: string, nomineeSeat: number): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    const seat = participant.seat!;
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("Nominations are not open");
    if (!game.aliveSeats.includes(seat)) throw new Error("A dead player cannot nominate");
    this.assignment(room, nomineeSeat);
    if (game.nominatedBySeats.includes(seat)) throw new Error("You already nominated today");
    if (game.nominatedSeats.includes(nomineeSeat)) throw new Error("That player was already nominated today");
    game.nominatedBySeats.push(seat);
    game.nominatedSeats.push(nomineeSeat);
    game.nomination = { nominatorSeat: seat, nomineeSeat };
    game.voteSubmissions = {};
    game.readySeats = [];
    game.phase = "VOTING";
    this.event(game, `${this.nickname(room, seat)} 提名了 ${this.nickname(room, nomineeSeat)}。`, "NOMINATION", { actorSeat: seat, targetSeat: nomineeSeat });
    if (this.#presentation) this.prepareBallot(room);
    const nominee = this.assignment(room, nomineeSeat);
    const first = nominee.perceivedRoleId === "virgin" && !game.virginSpentSeats.includes(nomineeSeat);
    if (first) game.virginSpentSeats.push(nomineeSeat);
    if (first && nominee.roleId === "virgin" && game.aliveSeats.includes(nomineeSeat) && !this.isImpaired(room, nomineeSeat)
      && roleById(this.registeredRole(room, seat, "virgin", ["TOWNSFOLK"])).type === "TOWNSFOLK") {
      this.execute(room, seat, "处女的能力触发");
      delete game.nomination;
      if (!this.evaluateWin(room, true)) this.beginOtherNight(room);
    }
    this.deadline(game);
    this.changed(room);
  }

  cancelNomination(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    if (game.phase !== "VOTING" || !game.nomination) throw new Error("There is no nomination to cancel");
    if (game.nomination.nominatorSeat !== participant.seat) throw new Error("Only the nominator may cancel this nomination");
    if (Object.keys(game.voteSubmissions).length > 0 || (game.nomination.voteStartsAt !== undefined && this.#now() >= game.nomination.voteStartsAt)) throw new Error("The nomination cannot be cancelled after voting begins");
    const { nominatorSeat, nomineeSeat } = game.nomination;
    // A withdrawn public nomination still consumes both daily nomination allowances.
    delete game.nomination;
    game.phase = "NOMINATION";
    this.event(game, `${this.nickname(room, nominatorSeat)} 撤回对 ${this.nickname(room, nomineeSeat)} 的提名；双方今日提名次数已使用。`);
    this.deadline(game);
    this.changed(room);
  }

  finishDefense(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    const nomination = game.nomination;
    if (game.phase !== "VOTING" || !nomination || nomination.defenseUntil === undefined || this.#now() >= nomination.defenseUntil) throw new Error("辩护窗口已经结束");
    if (nomination.nomineeSeat !== participant.seat) throw new Error("只有被提名者可以提前结束辩护");
    const now = this.#now();
    nomination.defenseUntil = now;
    nomination.voteStartsAt = now;
    nomination.nextCountAt = now + VOTE_SLOT_MS;
    nomination.voteEndsAt = now + nomination.voterOrder!.length * VOTE_SLOT_MS;
    nomination.voteStarted = true;
    this.event(game, `${this.nickname(room, participant.seat!)} 结束了辩护，开始顺时针计票。`);
    this.deadline(game);
    this.changed(room);
  }

  vote(codeInput: string, playerToken: string, raised: boolean): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    if (game.phase !== "VOTING" || !game.nomination) throw new Error("Voting is not open");
    if (this.#now() >= game.phaseDeadlineAt) throw new Error("Voting deadline passed");
    if (typeof raised !== "boolean") throw new Error("Vote must be boolean");
    const seat = participant.seat!;
    if (!this.eligibleVoters(game).includes(seat)) throw new Error("No ghost vote remains");
    if (game.nomination.voterOrder) {
      if (this.voteIsLocked(game, seat)) throw new Error("本席已计票，不能再改变举手状态");
      // Freeze any earlier seats before applying a later player's hand change. Otherwise
      // a delayed scheduler tick could retrospectively alter a Butler's already earned vote.
      this.advanceBallot(room, this.#now());
    }
    game.voteSubmissions[seat] = raised;
    delete game.pauseReason;
    if (!game.nomination?.voterOrder && this.eligibleVoters(game).every((candidate) => game.voteSubmissions[candidate] !== undefined)) this.settleVote(room);
    this.changed(room);
  }

  private eligibleVoters(game: GameRuntime): number[] {
    return [...new Set([...game.aliveSeats, ...game.ghostVoteSeats])];
  }

  private prepareBallot(room: RoomRecord): void {
    const game = this.requireGame(room);
    const nomination = game.nomination!;
    const eligible = new Set(this.eligibleVoters(game));
    const voterOrder = Array.from({ length: room.playerCount }, (_, index) => (nomination.nomineeSeat + index) % room.playerCount + 1).filter((seat) => eligible.has(seat));
    const voteStartsAt = Math.max(this.#now(), game.presentationUntil) + DEFENSE_MS;
    Object.assign(nomination, { defenseUntil: voteStartsAt, voteStartsAt, voteEndsAt: voteStartsAt + voterOrder.length * VOTE_SLOT_MS, nextCountAt: voteStartsAt + VOTE_SLOT_MS, voterOrder, countedSeats: [], countedVotes: {}, voteStarted: false });
  }

  private voteIsLocked(game: GameRuntime, seat: number): boolean {
    const nomination = game.nomination;
    if (!nomination?.voterOrder) return false;
    const index = nomination.voterOrder.indexOf(seat);
    const counted = nomination.countedSeats!.length;
    return index < counted || index < 0 || this.#now() >= nomination.nextCountAt! + (index - counted) * VOTE_SLOT_MS;
  }

  private raisedVoteIsValid(room: RoomRecord, seat: number): boolean {
    const game = this.requireGame(room);
    if (!game.voteSubmissions[seat]) return false;
    if (!game.aliveSeats.includes(seat) || this.assignment(room, seat).roleId !== "butler" || this.isImpaired(room, seat)) return true;
    const master = game.butlerMasterSeat;
    if (master === undefined) return false;
    const nomination = game.nomination;
    if (nomination?.countedVotes && Object.hasOwn(nomination.countedVotes, master)) return nomination.countedVotes[master] === true;
    return game.voteSubmissions[master] === true && this.eligibleVoters(game).includes(master);
  }

  private validVotes(room: RoomRecord): number[] {
    const game = this.requireGame(room);
    if (game.nomination?.countedVotes) return Object.entries(game.nomination.countedVotes).filter(([, raised]) => raised).map(([seat]) => Number(seat));
    return this.eligibleVoters(game).filter((seat) => this.raisedVoteIsValid(room, seat));
  }

  private advanceBallot(room: RoomRecord, now: number): boolean {
    const game = this.requireGame(room);
    const nomination = game.nomination;
    if (game.phase !== "VOTING" || !nomination?.voterOrder || now < nomination.voteStartsAt! || now < game.presentationUntil) return false;
    let changed = false;
    if (!nomination.voteStarted) { nomination.voteStarted = true; changed = true; }
    while (nomination.countedSeats!.length < nomination.voterOrder.length && now >= nomination.nextCountAt!) {
      const seat = nomination.voterOrder[nomination.countedSeats!.length]!;
      const valid = this.eligibleVoters(game).includes(seat) && this.raisedVoteIsValid(room, seat);
      nomination.countedSeats!.push(seat);
      nomination.countedVotes![seat] = valid;
      if (valid && !game.aliveSeats.includes(seat)) game.ghostVoteSeats = game.ghostVoteSeats.filter((candidate) => candidate !== seat);
      nomination.nextCountAt! += VOTE_SLOT_MS;
      changed = true;
    }
    if (nomination.countedSeats!.length === nomination.voterOrder.length) { this.settleVote(room); changed = true; }
    return changed;
  }

  private pauseBallotForPresentation(game: GameRuntime): void {
    const nomination = game.nomination;
    if (!nomination?.voterOrder) return;
    const delay = Math.max(0, game.presentationUntil - this.#now());
    if (this.#now() < nomination.defenseUntil!) {
      nomination.defenseUntil! += delay;
      nomination.voteStartsAt! += delay;
    }
    nomination.nextCountAt! += delay;
    nomination.voteEndsAt! += delay;
  }

  private settleVote(room: RoomRecord): void {
    const game = this.requireGame(room);
    if (!game.nomination) return;
    const validRaisedSeats = this.validVotes(room);
    if (!game.nomination.countedVotes) for (const seat of validRaisedSeats) if (!game.aliveSeats.includes(seat)) game.ghostVoteSeats = game.ghostVoteSeats.filter((candidate) => candidate !== seat);
    const votes = validRaisedSeats.length;
    const threshold = Math.ceil(game.aliveSeats.length / 2);
    const nomineeSeat = game.nomination.nomineeSeat;
    if (votes >= threshold) {
      if (!game.onBlock || votes > game.onBlock.votes) { game.onBlock = { seat: nomineeSeat, votes }; game.executionTied = false; }
      else if (votes === game.onBlock.votes) game.executionTied = true;
    }
    this.event(game, `${this.nickname(room, nomineeSeat)} 获得 ${votes} 票（至少一半需 ${threshold} 票）。${game.executionTied ? "最高票平票，暂时无人处决。" : ""}`, "VOTE_RESULT", { targetSeat: nomineeSeat, seats: validRaisedSeats, votes, threshold, outcome: game.executionTied ? "TIED" : game.onBlock?.seat === nomineeSeat ? "ON_BLOCK" : "NONE" });
    delete game.nomination;
    game.phase = "NOMINATION";
    this.deadline(game);
  }

  readyToEndDay(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("The day cannot end now");
    const seat = participant.seat!;
    if (!game.aliveSeats.includes(seat)) throw new Error("Only living players confirm day end");
    if (!game.readySeats.includes(seat)) game.readySeats.push(seat);
    delete game.pauseReason;
    if (!game.aliveSeats.every((candidate) => game.readySeats.includes(candidate))) { this.changed(room); return; }
    const executed = game.executionTied ? undefined : game.onBlock?.seat;
    if (executed !== undefined) this.execute(room, executed);
    else {
      delete game.lastExecutedRoleId; delete game.lastExecutedSeat; delete game.executionDeathRoleId;
      this.event(game, "今天无人被处决。", "EXECUTION", { outcome: "NONE" });
    }
    if (!this.evaluateWin(room, executed !== undefined, true)) this.beginOtherNight(room);
    this.changed(room);
  }

  private execute(room: RoomRecord, seat: number, prefix = ""): void {
    const game = this.requireGame(room);
    const wasAlive = game.aliveSeats.includes(seat);
    const roleId = this.assignment(room, seat).roleId;
    const impaired = this.isImpaired(room, seat);
    delete game.executionDeathRoleId;
    delete game.lastExecutedRoleId;
    delete game.lastExecutedSeat;
    if (wasAlive) {
      game.lastExecutedRoleId = roleId;
      game.lastExecutedSeat = seat;
      if (!impaired) game.executionDeathRoleId = roleId;
      this.kill(room, seat);
    }
    this.event(game, `${prefix ? prefix + "：" : ""}${this.nickname(room, seat)} 被处决。${wasAlive ? "" : "该玩家已经死亡。"}`, "EXECUTION", { targetSeat: seat, seats: wasAlive ? [seat] : [], outcome: wasAlive ? "DEATH" : "NO_DEATH" });
  }

  useDayAbility(codeInput: string, playerToken: string, targetSeat: number): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(game);
    const seat = participant.seat!;
    if (!["DAY_DISCUSSION", "NOMINATION", "VOTING"].includes(game.phase)) throw new Error("Day abilities are not available");
    if (!game.aliveSeats.includes(seat)) throw new Error("A dead player cannot use a day ability");
    if (game.phase === "VOTING" && game.nomination?.voterOrder) this.advanceBallot(room, this.#now());
    const actor = this.assignment(room, seat);
    const target = this.assignment(room, targetSeat);
    if (game.claimDayBySeat[seat] === game.day) throw new Error("今日已经公开宣称过猎魔人");
    game.claimDayBySeat[seat] = game.day;
    const available = !game.usedAbilitySeats.includes(seat);
    if (actor.perceivedRoleId === "slayer" && available) game.usedAbilitySeats.push(seat);
    this.privateMessage(game, seat, `你以猎魔人身份公开射击了${this.playerLabel(room, targetSeat)}。`, "ACTION");
    const registeredDemon = target.roleType === "DEMON" || this.registeredRole(room, targetSeat, "slayer", ["DEMON"]) === "imp";
    const death = game.aliveSeats.includes(targetSeat) && actor.roleId === "slayer" && available && !this.isImpaired(room, seat) && registeredDemon;
    if (death) this.kill(room, targetSeat);
    this.event(game, `${this.nickname(room, seat)} 以猎魔人身份射击了 ${this.nickname(room, targetSeat)}。${death ? `${this.nickname(room, targetSeat)} 倒下了。` : "枪声散去，但无人死亡。"}`, "SHOT", { actorSeat: seat, targetSeat, seats: death ? [targetSeat] : [], outcome: death ? "DEATH" : "NO_DEATH" });
    if (death) this.evaluateWin(room);
    if (game.phase === "VOTING") this.pauseBallotForPresentation(game);
    this.deadline(game);
    this.changed(room);
  }

  privateView(codeInput: string, playerToken: string) {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const assignment = room.assignments.find((candidate) => candidate.seat === participant.seat);
    const revealActualRole = room.state === "GAME_OVER";
    const visibleRoleId = assignment ? (revealActualRole ? assignment.roleId : assignment.perceivedRoleId) : undefined;
    const visibleRole = visibleRoleId ? roleById(visibleRoleId) : undefined;
    const game = room.game;
    const seat = participant.seat!;
    const available = !!game && this.#now() >= game.presentationUntil;
    const alive = !!game?.aliveSeats.includes(seat);
    const daytime = !!game && ["DAY_DISCUSSION", "NOMINATION"].includes(game.phase);
    return {
      participant: { id: participant.id, nickname: participant.nickname, seat: participant.seat, tutorialComplete: participant.tutorialComplete },
      state: room.state,
      playMode: room.playMode,
      canClaimSlayer: available && alive && !!game && ["DAY_DISCUSSION", "NOMINATION", "VOTING"].includes(game.phase) && game.claimDayBySeat[seat] !== game.day,
      dayAbilityTargets: room.assignments.map((candidate) => candidate.seat),
      canNominate: available && alive && daytime && !game!.nominatedBySeats.includes(seat),
      nominationTargets: game ? room.assignments.map((candidate) => candidate.seat).filter((candidate) => !game.nominatedSeats.includes(candidate)) : [],
      canVote: available && game?.phase === "VOTING" && this.eligibleVoters(game).includes(seat) && !this.voteIsLocked(game, seat),
      canFinishDefense: available && game?.phase === "VOTING" && game.nomination?.nomineeSeat === seat && this.#now() < (game.nomination?.defenseUntil ?? 0),
      canEndDay: available && alive && daytime,
      ...(revealActualRole && game ? { storytellerDecisions: game.decisions } : {}),
      messages: room.game?.messages[participant.seat!] ?? [],
      history: room.game?.privateHistory[participant.seat!] ?? [],
      ...(room.game?.phase === "VOTING" && room.game.voteSubmissions[participant.seat!] !== undefined ? { voteRaised: room.game.voteSubmissions[participant.seat!] } : {}),
      ...(room.game ? { game: this.publicGame(room), roleConfirmed: room.game.confirmedRoleSeats.includes(participant.seat!), ...(this.privateAction(room, participant.seat!) ? { action: this.privateAction(room, participant.seat!) } : {}) } : {}),
      ...(assignment && visibleRole && (room.state === "RUNNING" || room.state === "GAME_OVER")
        ? { role: { roleId: visibleRole.id, alignment: assignment.alignment, type: visibleRole.type, name: visibleRole.name, summary: visibleRole.summary, beginnerTip: visibleRole.beginnerTip, ...(revealActualRole && assignment.roleId !== assignment.perceivedRoleId ? { perceivedAs: roleById(assignment.perceivedRoleId).name } : {}) } }
        : {}),
    };
  }

  private authorizedPlayer(codeInput: string, playerToken: string) {
    const room = this.find(codeInput);
    const participant = room.participants.find((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (!participant || participant.left || participant.mode !== "PLAYER" || participant.seat === undefined) throw new Error("Player authorization failed");
    return { room, participant };
  }

  private createGame(room: RoomRecord): GameRuntime {
    const messages: Record<number, string[]> = {};
    const privateHistory: Record<number, PrivateHistoryEntry[]> = {};
    const goodSeats = room.assignments.filter((assignment) => assignment.alignment === "GOOD").map((assignment) => assignment.seat);
    const redHerringSeat = goodSeats[Math.floor(randomAt(`${room.id}:red-herring`, 0) * goodSeats.length)];
    const game: GameRuntime = {
      gameId: `${randomUUID()}:game-${room.gameNumber}`, storytellerSeed: randomUUID(), presentationUntil: 0, phaseDeadlineAt: this.#now() + 180_000, decisions: [], claimDayBySeat: {},
      phase: "ROLE_REVEAL", day: 0,
      aliveSeats: room.assignments.map((candidate) => candidate.seat),
      ghostVoteSeats: room.assignments.map((candidate) => candidate.seat),
      confirmedRoleSeats: [], nominatedBySeats: [], nominatedSeats: [], readySeats: [],
      messages, privateHistory,
      nightSubmissions: {}, voteSubmissions: {}, usedAbilitySeats: [], virginSpentSeats: [],
      executionTied: false,
      ...(redHerringSeat ? { redHerringSeat } : {}),
      events: [],
    };
    game.decisions.push({ id: `${game.gameId}:decision-1`, day: 0, ability: "setup", seat: 0, choice: "暗流涌动基础信息与主动能力组合", reason: "角色数量遵循人数配置与男爵修正；镇民足够时兼顾首夜信息和主动能力，身份随机分配。" });
    this.event(game, "身份已私密发放，请每位玩家确认。");
    for (const assignment of room.assignments) {
      const role = roleById(assignment.perceivedRoleId);
      messages[assignment.seat] = [];
      privateHistory[assignment.seat] = [];
      this.privateMessage(game, assignment.seat, `你的身份是${role.name}。${role.summary}`, "IDENTITY");
    }
    const demon = room.assignments.find((candidate) => candidate.roleType === "DEMON");
    const minions = room.assignments.filter((candidate) => candidate.roleType === "MINION");
    if (demon && room.playerCount >= 7) {
      this.privateMessage(game, demon.seat, `你的爪牙：${minions.map((candidate) => this.playerLabel(room, candidate.seat)).join("、") || "本局没有爪牙"}。`, "INFORMATION");
    }
    for (const minion of room.playerCount >= 7 ? minions : []) {
      this.privateMessage(game, minion.seat, `恶魔是 ${demon ? this.playerLabel(room, demon.seat) : "未知玩家"}；其他爪牙：${minions.filter((candidate) => candidate.seat !== minion.seat).map((candidate) => this.playerLabel(room, candidate.seat)).join("、") || "无"}。`, "INFORMATION");
    }
    if (demon && room.playerCount >= 7) {
      const selected = new Set(room.assignments.flatMap((candidate) => [candidate.roleId, candidate.perceivedRoleId]));
      const bluffs = shuffled(ROLE_CATALOG.filter((role) => ["TOWNSFOLK", "OUTSIDER"].includes(role.type) && !selected.has(role.id)), `${game.storytellerSeed}:bluffs`).slice(0, 3).map((role) => role.name);
      this.privateMessage(game, demon.seat, `三个安全伪装：${bluffs.join("、")}。`, "INFORMATION");
    }
    if (room.playerCount < 7) {
      const smallGameNotice = "官方 Teensyville 小局规则：恶魔与爪牙互不认识，小恶魔没有三个安全伪装。";
      if (demon) this.privateMessage(game, demon.seat, smallGameNotice, "NOTICE");
      for (const minion of minions) this.privateMessage(game, minion.seat, smallGameNotice, "NOTICE");
    }
    return game;
  }

  private restoreGame(snapshot: GameRuntime, gameId: string): GameRuntime {
    const legacy = snapshot as GameRuntime & { privateHistory?: Record<number, PrivateHistoryEntry[]> };
    const privateHistory = legacy.privateHistory ?? Object.fromEntries(
      Object.entries(snapshot.messages ?? {}).map(([seat, messages]) => [seat, messages.map((text, index) => ({
        seq: index + 1,
        phase: index === 0 || snapshot.phase === "ROLE_REVEAL" || snapshot.phase === "FIRST_NIGHT" ? "ROLE_REVEAL" as const : "HISTORY" as const,
        day: index === 0 ? 0 : snapshot.day ?? 0,
        kind: index === 0 ? "IDENTITY" as const : "NOTICE" as const,
        text,
      }))]),
    );
    return {
      ...snapshot,
      privateHistory,
      gameId: snapshot.gameId ?? gameId,
      storytellerSeed: snapshot.storytellerSeed ?? randomUUID(),
      presentationUntil: snapshot.presentationUntil ?? 0,
      phaseDeadlineAt: snapshot.phaseDeadlineAt ?? this.#now() + 180_000,
      decisions: snapshot.decisions ?? [],
      claimDayBySeat: snapshot.claimDayBySeat ?? {},
      ...(snapshot.pendingRavenkeeperSeat !== undefined && !snapshot.nightOrder ? { nightStep: 0, nightOrder: [{ seat: snapshot.pendingRavenkeeperSeat, roleId: "ravenkeeper" }], nightStartAliveSeats: [...new Set([...snapshot.aliveSeats, ...(snapshot.nightDeaths ?? [snapshot.pendingRavenkeeperSeat])])] } : {}),
      events: snapshot.events.map((event) => ({ ...event, kind: event.kind ?? "NOTICE", id: event.id ?? `${gameId}:${event.seq}`, gameId: event.gameId ?? gameId, occurredAt: event.occurredAt ?? 0, startsAt: event.startsAt ?? 0, durationMs: event.durationMs ?? 0 })),
      virginSpentSeats: snapshot.virginSpentSeats ?? [],
      executionTied: snapshot.executionTied ?? false,
    };
  }

  private requireGame(room: RoomRecord): GameRuntime {
    if (!room.game) throw new Error("Game has not started");
    return room.game;
  }

  private assignment(room: RoomRecord, seat: number): RoleAssignment {
    const assignment = room.assignments.find((candidate) => candidate.seat === seat);
    if (!assignment) throw new Error("Unknown seat");
    return assignment;
  }

  private nickname(room: RoomRecord, seat: number): string {
    return room.participants.find((candidate) => candidate.seat === seat)?.nickname ?? `${seat}号`;
  }

  private playerLabel(room: RoomRecord, seat: number): string {
    const participant = room.participants.find((candidate) => candidate.mode === "PLAYER" && candidate.seat === seat);
    return participant ? `${participant.nickname}（${seat}号）` : `${seat}号玩家`;
  }

  private event(game: GameRuntime, message: string, kind: ExperienceEvent["kind"] = "NOTICE", details: Partial<ExperienceEvent> = {}): void {
    const duration = { NOTICE: 0, NIGHT_FALLS: 2000, SHOT: 4500, NOMINATION: 1000, VOTE_RESULT: 2500, EXECUTION: 4500, DAWN: 5000, GAME_OVER: 5000 }[kind];
    const durationMs = this.#presentation ? duration : 0;
    const occurredAt = this.#now();
    const startsAt = durationMs ? Math.max(occurredAt + 1500, game.presentationUntil) : Math.max(occurredAt, game.presentationUntil);
    const seq = game.events.length + 1;
    game.events.push({ ...details, seq, id: `${game.gameId}:${seq}`, gameId: game.gameId, kind, message: message.trim(), occurredAt, startsAt, durationMs, day: game.day });
    if (durationMs) game.presentationUntil = startsAt + durationMs;
  }

  private privateMessage(game: GameRuntime, seat: number, text: string, kind: PrivateHistoryKind, effect?: PrivateHistoryEntry["effect"], targetSeats?: number[]): void {
    const message = text.trim();
    (game.messages[seat] ??= []).push(message);
    const history = game.privateHistory[seat] ??= [];
    history.push({
      seq: (history.at(-1)?.seq ?? 0) + 1,
      phase: game.phase,
      day: game.day,
      kind,
      text: message,
      ...(effect ? { effect } : {}), ...(targetSeats ? { targetSeats } : {}),
    });
  }

  private describeNightAction(room: RoomRecord, seat: number, targetSeats: number[]): string {
    const game = this.requireGame(room);
    const assignment = this.assignment(room, seat);
    const perceivedRoleId = assignment.roleId === "drunk" ? assignment.perceivedRoleId : assignment.roleId;
    const targets = targetSeats.map((targetSeat) => this.playerLabel(room, targetSeat));
    if (game.pendingRavenkeeperSeat === seat) return `你选择查验${targets[0]}的角色。`;
    if (perceivedRoleId === "poisoner") return `你选择投毒${targets[0]}。`;
    if (perceivedRoleId === "fortune_teller") return `你选择查验${targets.join("与")}。`;
    if (perceivedRoleId === "butler") return `你选择${targets[0]}作为明天的主人。`;
    if (perceivedRoleId === "monk") return `你选择保护${targets[0]}免受恶魔攻击。`;
    if (perceivedRoleId === "imp") return `你选择袭击${targets[0]}。`;
    return `你选择了${targets.join("与")}。`;
  }

  private changed(room: RoomRecord): void { room.revision += 1; room.lastActivityAt = new Date(this.#now()).toISOString(); }

  private organizer(room: RoomRecord): ParticipantRecord | undefined {
    return room.participants.find((participant) => participant.mode === "PLAYER" && !participant.left && participant.id === room.organizerParticipantId)
      ?? room.participants.find((participant) => participant.mode === "PLAYER" && !participant.left);
  }

  private publicGame(room: RoomRecord) {
    const game = this.requireGame(room);
    const visibleAlive = ["FIRST_NIGHT", "OTHER_NIGHT"].includes(game.phase) ? game.nightStartAliveSeats ?? game.aliveSeats : game.aliveSeats;
    return {
      gameId: game.gameId, revision: room.revision, serverNow: this.#now(),
      presentationUntil: game.presentationUntil, phaseDeadlineAt: game.phaseDeadlineAt,
      ...(game.pauseReason ? { pauseReason: game.pauseReason } : {}),
      phase: game.phase, day: game.day,
      seats: room.participants.filter((participant) => participant.mode === "PLAYER").sort((left, right) => left.seat! - right.seat!).map((participant) => ({
        seat: participant.seat!, nickname: participant.nickname, connected: participant.connected,
        alive: visibleAlive.includes(participant.seat!), ghostVoteAvailable: game.ghostVoteSeats.includes(participant.seat!),
      })),
      events: game.events,
      readyCount: game.readySeats.length,
      aliveCount: visibleAlive.length,
      ...(game.nomination ? { nomination: { ...game.nomination, votesReceived: Object.keys(game.voteSubmissions).length, votersRequired: game.nomination.voterOrder?.length ?? this.eligibleVoters(game).length,
        ...(game.nomination.voterOrder && this.#now() >= game.nomination.voteStartsAt! && this.#now() >= game.presentationUntil && game.nomination.countedSeats!.length < game.nomination.voterOrder.length ? { currentVoterSeat: game.nomination.voterOrder[game.nomination.countedSeats!.length] } : {}),
        raisedSeats: Object.entries(game.voteSubmissions).filter(([, raised]) => raised).map(([seat]) => Number(seat)),
        votesRaised: this.validVotes(room).length, threshold: Math.ceil(game.aliveSeats.length / 2) } } : {}),
      ...(game.onBlock ? { onBlock: game.onBlock } : {}),
      executionTied: game.executionTied,
      ...(game.winner ? { winner: game.winner, winReason: game.winReason } : {}),
    };
  }

  private privateAction(room: RoomRecord, seat: number) {
    const game = this.requireGame(room);
    if (this.#now() < game.presentationUntil) return undefined;
    if (game.phase === "ROLE_REVEAL" && !game.confirmedRoleSeats.includes(seat)) return { kind: "CONFIRM_ROLE", legalSeats: [], minTargets: 0, maxTargets: 0, prompt: "确认你已记住身份" };
    if (game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT") {
      if (game.nightSubmissions[seat]) return undefined;
      const requirement = this.nightRequirement(room, seat);
      if (requirement) return { kind: requirement.count === 2 ? "SELECT_TWO" : "SELECT_ONE", legalSeats: requirement.legalSeats, minTargets: requirement.count, maxTargets: requirement.count, prompt: requirement.prompt };
    }
    if (game.phase === "VOTING" && this.eligibleVoters(game).includes(seat) && !this.voteIsLocked(game, seat)) return { kind: "VOTE", legalSeats: [], minTargets: 0, maxTargets: 0, prompt: "提前举手或放下；顺时针数到本席时锁票，未举手不消耗鬼票" };
    if ((game.phase === "DAY_DISCUSSION" || game.phase === "NOMINATION") && game.aliveSeats.includes(seat)) {
      if (this.assignment(room, seat).perceivedRoleId === "slayer" && !game.usedAbilitySeats.includes(seat)) return { kind: "SLAYER", legalSeats: room.assignments.map((assignment) => assignment.seat), minTargets: 1, maxTargets: 1, prompt: "你可以公开选择任意玩家发动猎魔人能力（整局一次）" };
      return { kind: "DAY", legalSeats: room.assignments.map((assignment) => assignment.seat), minTargets: 0, maxTargets: 1, prompt: "讨论、提名，或确认结束今天" };
    }
    return undefined;
  }

  private nightRequirement(room: RoomRecord, seat: number): { count: number; legalSeats: number[]; prompt: string } | undefined {
    const game = this.requireGame(room);
    if (game.pendingRavenkeeperSeat === seat) {
      return { count: 1, legalSeats: room.assignments.map((assignment) => assignment.seat), prompt: "你在夜里死去：选择一名玩家查看其角色" };
    }
    if (!game.aliveSeats.includes(seat)) return undefined;
    const assignment = this.assignment(room, seat);
    const roleId = assignment.roleId === "drunk" ? assignment.perceivedRoleId : assignment.roleId;
    const living = room.assignments.map((candidate) => candidate.seat);
    if (roleId === "poisoner") return { count: 1, legalSeats: living, prompt: "选择今晚投毒的玩家" };
    if (roleId === "fortune_teller") return { count: 2, legalSeats: living, prompt: "选择两名不同的玩家进行占卜" };
    if (roleId === "butler") return { count: 1, legalSeats: room.assignments.map((candidate) => candidate.seat).filter((candidate) => candidate !== seat), prompt: "必须选择一名其他玩家作为你明天的主人（可以选择已死亡玩家）" };
    if (game.phase === "OTHER_NIGHT" && roleId === "monk") return { count: 1, legalSeats: living.filter((candidate) => candidate !== seat), prompt: "选择一名玩家免受恶魔攻击" };
    if (game.phase === "OTHER_NIGHT" && roleId === "imp") return { count: 1, legalSeats: living, prompt: "选择今晚袭击的玩家" };
    return undefined;
  }

  private initializeNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    game.nightStartAliveSeats = [...game.aliveSeats];
    game.nightDeaths = [];
    game.nightStep = 0;
    const order = game.phase === "FIRST_NIGHT" ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
    game.nightOrder = order.flatMap((roleId) => room.assignments.filter((assignment) => assignment.perceivedRoleId === roleId && game.aliveSeats.includes(assignment.seat)).map((assignment) => ({ seat: assignment.seat, roleId })));
    delete game.protectedSeat;
    this.deadline(game);
  }

  private settleNightIfReady(room: RoomRecord): void {
    const game = this.requireGame(room);
    if (!game.nightOrder) this.initializeNight(room);
    while ((game.nightStep ?? 0) < game.nightOrder!.length) {
      const { seat, roleId } = game.nightOrder![game.nightStep!]!;
      const isRaven = roleId === "ravenkeeper" && game.pendingRavenkeeperSeat === seat;
      if (!game.aliveSeats.includes(seat) && !isRaven) { game.nightStep! += 1; continue; }
      if (roleId === "ravenkeeper" && !isRaven) { game.nightStep! += 1; continue; }
      // A new Imp has already benefited from this night's original Imp action.
      if (this.assignment(room, seat).perceivedRoleId !== roleId && !isRaven) { game.nightStep! += 1; continue; }
      const requirement = this.nightRequirement(room, seat);
      if (requirement && !game.nightSubmissions[seat]) return;
      const targets = game.nightSubmissions[seat] ?? [];
      if (roleId === "poisoner" && !this.isImpaired(room, seat)) {
        game.poisonSourceSeat = seat; game.poisonedSeat = targets[0]!;
      } else if (roleId === "monk" && !this.isImpaired(room, seat)) {
        game.protectedSeat = targets[0]!;
      } else if (roleId === "imp") {
        this.resolveNightKill(room, seat, targets[0]);
        if (!room.assignments.some((assignment) => assignment.roleType === "DEMON" && game.aliveSeats.includes(assignment.seat)) || game.aliveSeats.length <= 2) { this.finishNight(room); return; }
      } else if (roleId === "butler") {
        game.butlerMasterSeat = targets[0]!;
      } else if (isRaven) {
        const target = targets[0]!;
        const truthful = this.registeredRole(room, target, "ravenkeeper");
        const shown = this.information(room, seat, roleId, truthful, ROLE_CATALOG.map((role) => role.id));
        this.privateMessage(game, seat, `守鸦人信息：${this.playerLabel(room, target)}是${roleById(shown).name}。`, "INFORMATION");
        delete game.pendingRavenkeeperSeat;
      } else this.deliverNightInformation(room, seat, roleId);
      game.nightStep! += 1;
    }
    this.finishNight(room);
  }

  private resolveNightKill(room: RoomRecord, demonSeat: number, selectedSeat: number | undefined): void {
    const game = this.requireGame(room);
    if (selectedSeat === undefined || this.isImpaired(room, demonSeat)) return;
    let target = selectedSeat;
    const selected = this.assignment(room, target);
    if (selected.roleId === "mayor" && game.aliveSeats.includes(target) && !this.isImpaired(room, target) && game.protectedSeat !== target) {
      const options = room.assignments.map((assignment) => assignment.seat);
      // Keeping the attack on the Mayor, an already dead player, or the Demon are all legal.
      target = this.choose(room, demonSeat, "mayor-redirect", options, (candidate) => candidate === selectedSeat ? 2 : !game.aliveSeats.includes(candidate) ? 1 : 3);
    }
    if (!game.aliveSeats.includes(target) || game.protectedSeat === target) return;
    if (this.assignment(room, target).roleId === "soldier" && !this.isImpaired(room, target)) return;
    const raven = this.assignment(room, target).perceivedRoleId === "ravenkeeper";
    this.kill(room, target, target === demonSeat);
    game.nightDeaths!.push(target);
    if (raven) {
      game.pendingRavenkeeperSeat = target;
      delete game.nightSubmissions[target];
    }
  }

  private deliverNightInformation(room: RoomRecord, seat: number, roleId: string): void {
    const game = this.requireGame(room);
    const first = game.phase === "FIRST_NIGHT";
    let message: string | undefined;
    if (roleId === "chef" && first) {
      const evil = room.assignments.filter((assignment) => this.registeredAlignment(room, assignment.seat, `chef-${seat}`) === "EVIL").map((assignment) => assignment.seat);
      const count = evil.filter((candidate) => evil.includes(candidate === room.playerCount ? 1 : candidate + 1)).length;
      message = `厨师信息：相邻邪恶玩家共有 ${this.information(room, seat, roleId, count, Array.from({ length: room.playerCount + 1 }, (_, index) => index))} 对。`;
    } else if (roleId === "empath") {
      const living = [...game.aliveSeats].sort((a, b) => a - b);
      const index = living.indexOf(seat);
      const neighbors = [living[(index - 1 + living.length) % living.length]!, living[(index + 1) % living.length]!];
      const count = neighbors.filter((candidate) => this.registeredAlignment(room, candidate, `empath-${seat}`) === "EVIL").length;
      message = `共情信息：你的两位最近存活邻居中有 ${this.information(room, seat, roleId, count, [0, 1, 2])} 位邪恶。`;
    } else if (roleId === "fortune_teller") {
      const truthful = game.nightSubmissions[seat]!.some((target) => target === game.redHerringSeat || this.registeredRole(room, target, `fortune_teller-${seat}`, ["DEMON"]) === "imp");
      message = `占卜结果：${this.information(room, seat, roleId, truthful, [true, false]) ? "是" : "否"}。`;
    } else if (["washerwoman", "librarian", "investigator"].includes(roleId) && first) {
      const sought = roleId === "washerwoman" ? "TOWNSFOLK" : roleId === "librarian" ? "OUTSIDER" : "MINION";
      const registrations = room.assignments.map((candidate) => ({ seat: candidate.seat, roleId: this.registeredRole(room, candidate.seat, `${roleId}-${seat}`, [sought]) }));
      const valid = registrations.filter((candidate) => roleById(candidate.roleId).type === sought);
      if (valid.length === 0 && !this.isImpaired(room, seat) && roleId === "librarian") message = "图书管理员信息：本局没有外来者。";
      else {
        const legalPool = this.isImpaired(room, seat) || !valid.length ? registrations : valid;
        const others = legalPool.filter((candidate) => candidate.seat !== seat);
        const pool = others.length ? others : legalPool;
        const target = this.choose(room, seat, `${roleId}-target`, pool);
        const decoy = this.choose(room, seat, `${roleId}-decoy`, registrations.filter((candidate) => candidate.seat !== target.seat && candidate.seat !== seat));
        (game.informationPairs ??= {})[seat] = { targetSeat: target.seat, decoySeat: decoy.seat };
        const legalRoles = ROLE_CATALOG.filter((role) => role.type === sought).map((role) => role.id);
        const truthfulRole = roleById(target.roleId).type === sought ? target.roleId : this.choose(room, seat, `${roleId}-plausible`, legalRoles);
        const shown = this.information(room, seat, roleId, truthfulRole, legalRoles);
        const pair = shuffled([target.seat, decoy.seat], `${game.storytellerSeed}:${seat}:pair`, game.decisions.length);
        message = `${roleById(roleId).name}信息：${this.playerLabel(room, pair[0]!)}与${this.playerLabel(room, pair[1]!)}中，有一位是${roleById(shown).name}。`;
      }
    } else if (roleId === "spy") {
      const impaired = this.isImpaired(room, seat);
      const entries = room.assignments.map((candidate) => {
        const shownRole = this.information(room, seat, `spy-${candidate.seat}`, candidate.roleId, ROLE_CATALOG.map((role) => role.id));
        const reminders = [!game.aliveSeats.includes(candidate.seat) ? "死亡" : "存活", candidate.roleId === "drunk" ? `酒鬼自认${roleById(candidate.perceivedRoleId).name}` : undefined,
          game.poisonedSeat === candidate.seat ? "中毒" : undefined, game.protectedSeat === candidate.seat ? "僧侣保护" : undefined, game.redHerringSeat === candidate.seat ? "红鲱鱼" : undefined,
          game.usedAbilitySeats.includes(candidate.seat) ? "一次能力已用" : undefined, game.virginSpentSeats.includes(candidate.seat) ? "处女已触发" : undefined,
          game.butlerMasterSeat === candidate.seat ? "管家主人" : undefined,
          ...Object.entries(game.informationPairs ?? {}).flatMap(([observer, pair]) => pair.targetSeat === candidate.seat ? [`${roleById(this.assignment(room, Number(observer)).perceivedRoleId).name}线索目标`] : pair.decoySeat === candidate.seat ? [`${roleById(this.assignment(room, Number(observer)).perceivedRoleId).name}线索干扰`] : [])].filter(Boolean);
        // An impaired grimoire is a complete plausible fiction, not true hidden reminders around a fake role.
        return `${this.playerLabel(room, candidate.seat)} ${roleById(shownRole).name} [${impaired ? (game.aliveSeats.includes(candidate.seat) ? "存活" : "死亡") : reminders.join("、")}]`;
      });
      message = `魔典：${entries.join("；")}。`;
    } else if (roleId === "undertaker" && !first && game.lastExecutedSeat !== undefined) {
      const truthful = this.registeredRole(room, game.lastExecutedSeat, "undertaker");
      const shown = this.information(room, seat, roleId, truthful, ROLE_CATALOG.map((role) => role.id));
      message = `送葬信息：今天因处决死亡的是${roleById(shown).name}。`;
    }
    if (message) this.privateMessage(game, seat, message, "INFORMATION");
  }

  private finishNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    const first = game.phase === "FIRST_NIGHT";
    const deaths = game.nightDeaths ?? [];
    game.day = first ? 1 : game.day + 1;
    game.phase = "DAY_DISCUSSION";
    game.nightSubmissions = {};
    delete game.nightOrder; delete game.nightStep; delete game.pendingRavenkeeperSeat;
    delete game.nightStartAliveSeats; delete game.protectedSeat;
    this.event(game, deaths.length ? `黎明时发现 ${deaths.map((seat) => this.nickname(room, seat)).join("、")} 死亡。` : "黎明到来，昨夜无人死亡。", "DAWN", { seats: deaths, outcome: deaths.length ? "DEATH" : "NO_DEATH" });
    delete game.nightDeaths;
    if (!this.evaluateWin(room)) this.event(game, `第 ${game.day} 天开始，自由讨论。`);
    this.deadline(game);
  }

  private beginOtherNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    game.phase = "OTHER_NIGHT";
    game.readySeats = []; game.nominatedBySeats = []; game.nominatedSeats = []; game.nightSubmissions = {};
    game.executionTied = false;
    delete game.nomination; delete game.onBlock; delete game.poisonedSeat; delete game.poisonSourceSeat; delete game.pendingRavenkeeperSeat;
    this.event(game, "夜幕再次降临。请查看自己的手机。", "NIGHT_FALLS");
    this.initializeNight(room);
    this.settleNightIfReady(room);
  }

  private kill(room: RoomRecord, seat: number, impSelfKill = false): void {
    const game = this.requireGame(room);
    if (!game.aliveSeats.includes(seat)) return;
    const beforeCount = game.aliveSeats.length;
    const killed = this.assignment(room, seat);
    game.aliveSeats = game.aliveSeats.filter((candidate) => candidate !== seat);
    if (game.poisonSourceSeat === seat || killed.roleId === "poisoner") { delete game.poisonedSeat; delete game.poisonSourceSeat; }
    if (killed.roleId === "monk") delete game.protectedSeat;
    if (killed.roleType !== "DEMON") return;
    const scarlet = beforeCount >= 5 ? room.assignments.find((candidate) => candidate.roleId === "scarlet_woman" && game.aliveSeats.includes(candidate.seat) && !this.isImpaired(room, candidate.seat)) : undefined;
    const minions = room.assignments.filter((candidate) => candidate.roleType === "MINION" && game.aliveSeats.includes(candidate.seat));
    const successor = scarlet ?? (impSelfKill && minions.length ? this.choose(room, seat, "imp-successor", minions, (candidate) => 1 / (1 + game.events.filter((event) => event.kind === "NOMINATION" && event.targetSeat === candidate.seat).length)) : undefined);
    if (successor) {
      if (successor.roleId === "poisoner") { delete game.poisonedSeat; delete game.poisonSourceSeat; }
      const old = successor.roleId;
      successor.roleId = "imp"; successor.perceivedRoleId = "imp"; successor.roleType = "DEMON";
      this.decision(room, successor.seat, "demon-succession", `${old} → imp`, scarlet ? `恶魔死亡前 ${beforeCount} 人存活，健康猩红女郎优先接任。` : "小恶魔自杀，从仍存活的爪牙中选择继任者。");
      this.privateMessage(game, successor.seat, "恶魔死亡，你已秘密接替成为新的小恶魔。", "ROLE_CHANGE");
    }
  }

  private evaluateWin(room: RoomRecord, executedToday = false, mayorWinEligible = false): boolean {
    const game = this.requireGame(room);
    const living = room.assignments.filter((assignment) => game.aliveSeats.includes(assignment.seat));
    const result = resolveSpecialWin({ ...(executedToday && game.executionDeathRoleId ? { executedRoleId: game.executionDeathRoleId } : {}), livingRoleIds: living.filter((assignment) => !this.isImpaired(room, assignment.seat)).map((assignment) => assignment.roleId), livingCount: game.aliveSeats.length, demonAlive: living.some((assignment) => assignment.roleType === "DEMON"), executedToday, mayorWinEligible });
    if (!result) return false;
    game.phase = "GAME_OVER"; delete game.nomination; game.winner = result.winner; game.winReason = result.reason; room.state = "GAME_OVER";
    delete game.pauseReason;
    this.event(game, `${result.winner === "GOOD" ? "善良" : "邪恶"}阵营获胜。`, "GAME_OVER", { outcome: result.winner });
    this.event(game, `身份揭晓：${room.assignments.map((assignment) => {
      const actual = roleById(assignment.roleId).name;
      const mistaken = assignment.roleId !== assignment.perceivedRoleId ? `（本局以为自己是${roleById(assignment.perceivedRoleId).name}）` : "";
      return `${this.playerLabel(room, assignment.seat)} ${actual}${mistaken}`;
    }).join("；")}。`);
    return true;
  }

  private isImpaired(room: RoomRecord, seat: number): boolean {
    return this.assignment(room, seat).roleId === "drunk" || this.requireGame(room).poisonedSeat === seat;
  }

  private registeredRole(room: RoomRecord, seat: number, ability: string, soughtTypes?: string[]): string {
    const assignment = this.assignment(room, seat);
    // Recluse and Spy explicitly retain registration while dead, but never while poisoned.
    if (this.isImpaired(room, seat) || !["recluse", "spy"].includes(assignment.roleId)) return assignment.roleId;
    const allowed = assignment.roleId === "recluse" ? ["MINION", "DEMON"] : ["TOWNSFOLK", "OUTSIDER"];
    const roles = ROLE_CATALOG.filter((role) => allowed.includes(role.type) && (!soughtTypes || soughtTypes.includes(role.type))).map((role) => role.id);
    return this.choose(room, seat, `${ability}-registration`, [assignment.roleId, ...roles], (roleId) => roleId === assignment.roleId ? Math.max(1, roles.length) : 1);
  }

  private registeredAlignment(room: RoomRecord, seat: number, ability: string): "GOOD" | "EVIL" {
    const assignment = this.assignment(room, seat);
    if (this.isImpaired(room, seat) || !["recluse", "spy"].includes(assignment.roleId)) return assignment.alignment;
    return this.choose(room, seat, `${ability}-alignment`, ["GOOD", "EVIL"]);
  }

  private information<T>(room: RoomRecord, seat: number, ability: string, truthful: T, legal: T[]): T {
    const game = this.requireGame(room);
    const impaired = this.isImpaired(room, seat);
    const prior = game.decisions.filter((decision) => decision.seat === seat && decision.ability === ability).map((decision) => decision.choice);
    const shown = chooseInformationResult({ seed: `${game.storytellerSeed}:${seat}:${ability}:${game.day}`, eventSeq: game.decisions.length, truthful, legal, impaired, history: prior, livingCount: game.aliveSeats.length });
    this.decision(room, seat, ability, String(shown), impaired ? "醉毒信息：从合法信息集合中按局势与历史选择；真值仍为合法候选。" : "健康角色依据此时夜序快照及合法登记获得信息。");
    return shown;
  }

  private choose<T>(room: RoomRecord, seat: number, ability: string, legal: T[], weight: (value: T) => number = () => 1): T {
    if (!legal.length) throw new Error(`No legal storyteller choice for ${ability}`);
    const game = this.requireGame(room);
    const prior = game.decisions.filter((decision) => decision.ability === ability).slice(-3).map((decision) => decision.choice);
    const weighted = legal.map((value) => ({ value, weight: Math.max(0.1, weight(value)) * (prior.includes(JSON.stringify(value)) ? 0.7 : 1) }));
    let roll = randomAt(`${game.storytellerSeed}:${game.day}:${seat}:${ability}`, game.decisions.length) * weighted.reduce((sum, entry) => sum + entry.weight, 0);
    const selected = weighted.find((entry) => (roll -= entry.weight) < 0)?.value ?? legal.at(-1)!;
    this.decision(room, seat, ability, JSON.stringify(selected), `在 ${legal.length} 个合法候选中，结合既往裁量避免固定座位和固定输出。`);
    return selected;
  }

  private decision(room: RoomRecord, seat: number, ability: string, choice: string, reason: string): void {
    const game = this.requireGame(room);
    game.decisions.push({ id: `${game.gameId}:decision-${game.decisions.length + 1}`, day: game.day, ability, seat, choice, reason });
  }

  private assertPresentationComplete(game: GameRuntime): void {
    if (this.#now() < game.presentationUntil) throw new Error("公开演出正在同步，请稍候再操作");
  }

  private deadline(game: GameRuntime): void {
    game.phaseDeadlineAt = game.phase === "VOTING" && game.nomination?.voteEndsAt !== undefined ? game.nomination.voteEndsAt : Math.max(this.#now(), game.presentationUntil) + (game.phase === "VOTING" ? 60_000 : ["DAY_DISCUSSION", "NOMINATION"].includes(game.phase) ? 10 * 60_000 : 180_000);
    delete game.pauseReason;
  }

}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
