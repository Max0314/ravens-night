import { randomUUID } from "node:crypto";
import {
  ROLE_CATALOG,
  chooseInformationResult,
  chooseRegistration,
  randomAt,
  resolveDemonKill,
  resolveSpecialWin,
  roleById,
  setupGameRoles,
  type RoleAssignment,
} from "@ravens/game-engine";
import { createOpaqueToken, hashOpaqueToken } from "../auth/session.js";
import { createRoomCode, normalizeRoomCode } from "./codes.js";

export type ParticipantMode = "PLAYER" | "DISPLAY";

export interface ParticipantRecord {
  id: string;
  nickname: string;
  mode: ParticipantMode;
  seat?: number;
  tokenHash: string;
  connected: boolean;
  tutorialComplete: boolean;
}

export interface RoomRecord {
  id: string;
  code: string;
  organizerName: string;
  playerCount: number;
  participants: ParticipantRecord[];
  state: "LOBBY" | "TUTORIAL" | "RUNNING" | "GAME_OVER";
  organizerTokenHash: string;
  assignments: RoleAssignment[];
  gameNumber: number;
  revision: number;
  game?: GameRuntime;
}

type RuntimePhase = "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER";

interface GameRuntime {
  phase: RuntimePhase;
  day: number;
  aliveSeats: number[];
  ghostVoteSeats: number[];
  confirmedRoleSeats: number[];
  nominatedBySeats: number[];
  nominatedSeats: number[];
  readySeats: number[];
  messages: Record<number, string[]>;
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
  events: Array<{ seq: number; message: string }>;
  nomination?: { nominatorSeat: number; nomineeSeat: number };
  onBlock?: { seat: number; votes: number };
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}

export class RoomService {
  readonly #rooms = new Map<string, RoomRecord>();

  create(playerCount: number, organizerName: string): { room: RoomRecord; organizerToken: string } {
    if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 12) {
      throw new Error("Player count must be between 5 and 12");
    }
    let code = createRoomCode();
    while (this.#rooms.has(code)) code = createRoomCode();
    const organizerToken = createOpaqueToken();
    const room: RoomRecord = {
      id: randomUUID(),
      code,
      organizerName: organizerName.trim().slice(0, 24) || "组织者",
      playerCount,
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
      tutorialComplete: false,
    };
    room.participants.push(participant);
    this.changed(room);
    return { participant: structuredClone(participant), token };
  }

  leave(codeInput: string, playerToken: string): { roomDestroyed: boolean; organizerChanged: boolean } {
    const room = this.find(codeInput);
    const participantIndex = room.participants.findIndex((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (participantIndex < 0) throw new Error("Player authorization failed");
    const participant = room.participants[participantIndex]!;
    if (participant.mode === "PLAYER" && room.state !== "LOBBY") throw new Error("游戏已经开始，不能中途退出房间");

    const previousOrganizerId = room.participants.find((candidate) => candidate.mode === "PLAYER" && candidate.seat === 1)?.id;
    room.participants.splice(participantIndex, 1);
    const players = room.participants.filter((candidate) => candidate.mode === "PLAYER");
    if (players.length === 0) {
      this.#rooms.delete(room.code);
      return { roomDestroyed: true, organizerChanged: previousOrganizerId === participant.id };
    }
    players.forEach((candidate, index) => { candidate.seat = index + 1; });
    const organizerChanged = previousOrganizerId === participant.id;
    if (organizerChanged) {
      room.organizerName = players[0]!.nickname;
      room.organizerTokenHash = players[0]!.tokenHash;
    }
    this.changed(room);
    return { roomDestroyed: false, organizerChanged };
  }

  snapshot(codeInput: string): RoomRecord { return structuredClone(this.find(codeInput)); }

  restore(snapshots: RoomRecord[]): void {
    for (const snapshot of snapshots) {
      const code = normalizeRoomCode(snapshot.code);
      if (snapshot.playerCount < 5 || snapshot.playerCount > 12 || !Array.isArray(snapshot.participants)) continue;
      const game = snapshot.game ? {
        ...snapshot.game,
        virginSpentSeats: snapshot.game.virginSpentSeats ?? [],
        executionTied: snapshot.game.executionTied ?? false,
      } : undefined;
      this.#rooms.set(code, structuredClone({ ...snapshot, ...(game ? { game } : {}), code, gameNumber: snapshot.gameNumber ?? 0, revision: snapshot.revision || 1 }));
    }
  }

  find(codeInput: string): RoomRecord {
    const code = normalizeRoomCode(codeInput);
    const room = this.#rooms.get(code);
    if (!room) throw new Error("Room not found");
    return room;
  }

  publicView(codeInput: string) {
    const room = this.find(codeInput);
    const organizer = room.participants.find((participant) => participant.mode === "PLAYER" && participant.seat === 1);
    return {
      code: room.code,
      state: room.state,
      playerCount: room.playerCount,
      ...(organizer ? { organizerId: organizer.id, organizerName: organizer.nickname } : {}),
      participants: room.participants.map(({ tokenHash: _tokenHash, tutorialComplete: _tutorialComplete, ...participant }) => participant),
      ...(room.game ? { game: this.publicGame(room) } : {}),
    };
  }

  startTutorial(codeInput: string, organizerToken: string): void {
    const room = this.find(codeInput);
    const players = room.participants.filter((participant) => participant.mode === "PLAYER");
    const organizerHash = hashOpaqueToken(organizerToken);
    if (room.organizerTokenHash !== organizerHash && players.find((participant) => participant.seat === 1)?.tokenHash !== organizerHash) throw new Error("Organizer authorization failed");
    if (players.length !== room.playerCount) throw new Error("All players must join before starting");
    room.gameNumber = (room.gameNumber ?? 0) + 1;
    room.assignments = setupGameRoles(room.playerCount, `${room.id}:${room.code}:game-${room.gameNumber}`);
    room.state = "TUTORIAL";
    this.changed(room);
  }

  reset(codeInput: string, organizerToken: string): void {
    const room = this.find(codeInput);
    const organizerHash = hashOpaqueToken(organizerToken);
    const organizer = room.participants.find((participant) => participant.mode === "PLAYER" && participant.seat === 1);
    if (room.organizerTokenHash !== organizerHash && organizer?.tokenHash !== organizerHash) throw new Error("Organizer authorization failed");
    room.state = "LOBBY";
    room.assignments = [];
    delete room.game;
    for (const participant of room.participants) participant.tutorialComplete = false;
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

  confirmRole(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "ROLE_REVEAL") return;
    if (!game.confirmedRoleSeats.includes(participant.seat!)) game.confirmedRoleSeats.push(participant.seat!);
    if (game.confirmedRoleSeats.length === room.playerCount) {
      game.phase = "FIRST_NIGHT";
      this.event(game, "所有身份已确认。村庄进入首夜。 ");
      this.settleNightIfReady(room);
    }
    this.changed(room);
  }

  submitAction(codeInput: string, playerToken: string, targetSeats: number[]): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "FIRST_NIGHT" && game.phase !== "OTHER_NIGHT") throw new Error("No night action is active");
    const requirement = this.nightRequirement(room, participant.seat!);
    if (!requirement) throw new Error("This role has no pending action");
    if (targetSeats.length !== requirement.count || new Set(targetSeats).size !== targetSeats.length) throw new Error("Invalid number of targets");
    if (targetSeats.some((seat) => !requirement.legalSeats.includes(seat))) throw new Error("Illegal target");
    game.nightSubmissions[participant.seat!] = [...targetSeats];
    this.settleNightIfReady(room);
    this.changed(room);
  }

  nominate(codeInput: string, playerToken: string, nomineeSeat: number): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    const seat = participant.seat!;
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("Nominations are not open");
    if (!game.aliveSeats.includes(seat)) throw new Error("A dead player cannot nominate");
    if (!game.aliveSeats.includes(nomineeSeat)) throw new Error("Only a living player may be nominated");
    if (game.nominatedBySeats.includes(seat)) throw new Error("You already nominated today");
    if (game.nominatedSeats.includes(nomineeSeat)) throw new Error("That player was already nominated today");
    game.nominatedBySeats.push(seat);
    game.nominatedSeats.push(nomineeSeat);
    game.nomination = { nominatorSeat: seat, nomineeSeat };
    game.voteSubmissions = {};
    game.readySeats = [];
    game.phase = "VOTING";
    this.event(game, `${this.nickname(room, seat)} 提名了 ${this.nickname(room, nomineeSeat)}。`);

    const nominee = this.assignment(room, nomineeSeat);
    const nominator = this.assignment(room, seat);
    const virginFirstNomination = nominee.roleId === "virgin" && !game.virginSpentSeats.includes(nomineeSeat);
    if (virginFirstNomination) game.virginSpentSeats.push(nomineeSeat);
    const nominatorRegistersAsTownsfolk = nominator.roleType === "TOWNSFOLK"
      || (nominator.roleId === "spy" && chooseRegistration("spy", "ROLE_TYPE", room.id, game.events.length) === "TOWNSFOLK");
    if (virginFirstNomination && !this.isImpaired(room, nomineeSeat) && nominatorRegistersAsTownsfolk) {
      this.kill(game, seat);
      this.event(game, `处女的能力触发：${this.nickname(room, seat)} 立即被处决。`);
      delete game.nomination;
      game.lastExecutedRoleId = nominator.roleId;
      if (!this.evaluateWin(room, seat, true)) this.beginOtherNight(room);
    }
    this.changed(room);
  }

  cancelNomination(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "VOTING" || !game.nomination) throw new Error("There is no nomination to cancel");
    if (game.nomination.nominatorSeat !== participant.seat) throw new Error("Only the nominator may cancel this nomination");
    if (Object.keys(game.voteSubmissions).length > 0) throw new Error("The nomination cannot be cancelled after voting begins");

    const { nominatorSeat, nomineeSeat } = game.nomination;
    game.nominatedBySeats = game.nominatedBySeats.filter((seat) => seat !== nominatorSeat);
    game.nominatedSeats = game.nominatedSeats.filter((seat) => seat !== nomineeSeat);
    game.voteSubmissions = {};
    delete game.nomination;
    game.phase = "NOMINATION";
    this.event(game, `${this.nickname(room, nominatorSeat)} 取消了对 ${this.nickname(room, nomineeSeat)} 的提名。`);
    this.changed(room);
  }

  vote(codeInput: string, playerToken: string, raised: boolean): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "VOTING" || !game.nomination) throw new Error("Voting is not open");
    const seat = participant.seat!;
    const canRaise = game.aliveSeats.includes(seat) || game.ghostVoteSeats.includes(seat);
    game.voteSubmissions[seat] = canRaise && raised;
    if (Object.keys(game.voteSubmissions).length < room.playerCount) { this.changed(room); return; }
    const validRaisedSeats = Object.entries(game.voteSubmissions).filter(([seatText, isRaised]) => {
      if (!isRaised) return false;
      const voterSeat = Number(seatText);
      if (this.assignment(room, voterSeat).roleId !== "butler" || this.isImpaired(room, voterSeat)) return true;
      return game.butlerMasterSeat !== undefined && game.voteSubmissions[game.butlerMasterSeat] === true;
    }).map(([seatText]) => Number(seatText));
    for (const voterSeat of validRaisedSeats) if (!game.aliveSeats.includes(voterSeat)) game.ghostVoteSeats = game.ghostVoteSeats.filter((candidate) => candidate !== voterSeat);
    const votes = validRaisedSeats.length;
    const threshold = Math.ceil(game.aliveSeats.length / 2);
    const nomineeSeat = game.nomination.nomineeSeat;
    if (votes >= threshold) {
      if (!game.onBlock || votes > game.onBlock.votes) {
        game.onBlock = { seat: nomineeSeat, votes };
        game.executionTied = false;
      } else if (votes === game.onBlock.votes) {
        game.executionTied = true;
      }
    }
    this.event(game, `${this.nickname(room, nomineeSeat)} 获得 ${votes} 票（过半需 ${threshold} 票）。`);
    delete game.nomination;
    game.phase = "NOMINATION";
    this.changed(room);
  }

  readyToEndDay(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("The day cannot end now");
    const seat = participant.seat!;
    if (!game.aliveSeats.includes(seat)) throw new Error("Only living players confirm day end");
    if (!game.readySeats.includes(seat)) game.readySeats.push(seat);
    if (!game.aliveSeats.every((candidate) => game.readySeats.includes(candidate))) { this.changed(room); return; }
    const executed = game.executionTied ? undefined : game.onBlock?.seat;
    if (executed !== undefined) {
      game.lastExecutedRoleId = this.assignment(room, executed).roleId;
      this.kill(game, executed);
      this.event(game, `${this.nickname(room, executed)} 被处决。`);
    } else {
      delete game.lastExecutedRoleId;
      this.event(game, "今天无人被处决。 ");
    }
    if (this.evaluateWin(room, executed, executed !== undefined, true)) { this.changed(room); return; }
    this.beginOtherNight(room);
    this.changed(room);
  }

  useDayAbility(codeInput: string, playerToken: string, targetSeat: number): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    const seat = participant.seat!;
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("Day abilities are not available");
    const actor = this.assignment(room, seat);
    if (actor.perceivedRoleId !== "slayer" || game.usedAbilitySeats.includes(seat)) throw new Error("No day ability is available");
    if (!game.aliveSeats.includes(targetSeat)) throw new Error("The target must be alive");
    game.usedAbilitySeats.push(seat);
    this.event(game, `${this.nickname(room, seat)} 以猎魔人身份射击了 ${this.nickname(room, targetSeat)}。`);
    const target = this.assignment(room, targetSeat);
    const recluseRegistersAsDemon = target.roleId === "recluse"
      && randomAt(`${room.id}:slayer-recluse`, game.events.length) >= 0.5;
    if (actor.roleId === "slayer" && !this.isImpaired(room, seat) && (target.roleType === "DEMON" || recluseRegistersAsDemon)) {
      this.kill(game, targetSeat);
      this.event(game, `${this.nickname(room, targetSeat)} 倒下了。`);
      this.evaluateWin(room);
    } else this.event(game, "枪声散去，但无人死亡。 ");
    this.changed(room);
  }

  privateView(codeInput: string, playerToken: string) {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const assignment = room.assignments.find((candidate) => candidate.seat === participant.seat);
    const revealActualRole = room.state === "GAME_OVER";
    const visibleRoleId = assignment ? (revealActualRole ? assignment.roleId : assignment.perceivedRoleId) : undefined;
    const visibleRole = visibleRoleId ? roleById(visibleRoleId) : undefined;
    return {
      participant: { id: participant.id, nickname: participant.nickname, seat: participant.seat },
      state: room.state,
      messages: room.game?.messages[participant.seat!] ?? [],
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
    if (!participant || participant.mode !== "PLAYER" || participant.seat === undefined) throw new Error("Player authorization failed");
    return { room, participant };
  }

  private createGame(room: RoomRecord): GameRuntime {
    const messages: Record<number, string[]> = {};
    for (const assignment of room.assignments) {
      const role = roleById(assignment.perceivedRoleId);
      messages[assignment.seat] = [`你的身份是${role.name}。${role.summary}`];
    }
    const demon = room.assignments.find((candidate) => candidate.roleType === "DEMON");
    const minions = room.assignments.filter((candidate) => candidate.roleType === "MINION");
    if (demon && room.playerCount >= 7) {
      messages[demon.seat]!.push(`你的爪牙：${minions.map((candidate) => this.playerLabel(room, candidate.seat)).join("、") || "本局没有爪牙"}。`);
      const selected = new Set(room.assignments.map((candidate) => candidate.perceivedRoleId));
      const bluffs = ROLE_CATALOG.filter((role) => role.type === "TOWNSFOLK" && !selected.has(role.id)).slice(0, 3).map((role) => role.name);
      messages[demon.seat]!.push(`三个安全伪装：${bluffs.join("、")}。`);
    }
    if (room.playerCount >= 7) {
      for (const minion of minions) messages[minion.seat]!.push(`恶魔是 ${demon ? this.playerLabel(room, demon.seat) : "未知玩家"}；其他爪牙：${minions.filter((candidate) => candidate.seat !== minion.seat).map((candidate) => this.playerLabel(room, candidate.seat)).join("、") || "无"}。`);
    } else {
      const teensyvilleNotice = "六人局特殊规则：邪恶玩家不会在首夜得知彼此身份，小恶魔也不会获得三个安全伪装。";
      if (demon) messages[demon.seat]!.push(teensyvilleNotice);
      for (const minion of minions) messages[minion.seat]!.push(teensyvilleNotice);
    }
    const goodSeats = room.assignments.filter((assignment) => assignment.alignment === "GOOD").map((assignment) => assignment.seat);
    const redHerringSeat = goodSeats[Math.floor(randomAt(`${room.id}:red-herring`, 0) * goodSeats.length)];
    return {
      phase: "ROLE_REVEAL", day: 0,
      aliveSeats: room.assignments.map((candidate) => candidate.seat),
      ghostVoteSeats: room.assignments.map((candidate) => candidate.seat),
      confirmedRoleSeats: [], nominatedBySeats: [], nominatedSeats: [], readySeats: [],
      messages, nightSubmissions: {}, voteSubmissions: {}, usedAbilitySeats: [], virginSpentSeats: [],
      executionTied: false,
      ...(redHerringSeat ? { redHerringSeat } : {}),
      events: [{ seq: 1, message: "身份已私密发放，请每位玩家确认。" }],
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

  private event(game: GameRuntime, message: string): void {
    game.events.push({ seq: game.events.length + 1, message: message.trim() });
  }

  private changed(room: RoomRecord): void { room.revision += 1; }

  private publicGame(room: RoomRecord) {
    const game = this.requireGame(room);
    return {
      phase: game.phase, day: game.day,
      seats: room.participants.filter((participant) => participant.mode === "PLAYER").map((participant) => ({
        seat: participant.seat!, nickname: participant.nickname, connected: participant.connected,
        alive: game.aliveSeats.includes(participant.seat!), ghostVoteAvailable: game.ghostVoteSeats.includes(participant.seat!),
      })),
      events: game.events.slice(-8),
      readyCount: game.readySeats.length,
      aliveCount: game.aliveSeats.length,
      ...(game.nomination ? { nomination: { ...game.nomination, votesReceived: Object.keys(game.voteSubmissions).length, votesRaised: Object.values(game.voteSubmissions).filter(Boolean).length, threshold: Math.ceil(game.aliveSeats.length / 2) } } : {}),
      ...(game.onBlock ? { onBlock: game.onBlock } : {}),
      executionTied: game.executionTied,
      ...(game.winner ? { winner: game.winner, winReason: game.winReason } : {}),
    };
  }

  private privateAction(room: RoomRecord, seat: number) {
    const game = this.requireGame(room);
    if (game.phase === "ROLE_REVEAL" && !game.confirmedRoleSeats.includes(seat)) return { kind: "CONFIRM_ROLE", legalSeats: [], minTargets: 0, maxTargets: 0, prompt: "确认你已记住身份" };
    if (game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT") {
      if (game.nightSubmissions[seat]) return undefined;
      const requirement = this.nightRequirement(room, seat);
      if (requirement) return { kind: requirement.count === 2 ? "SELECT_TWO" : "SELECT_ONE", legalSeats: requirement.legalSeats, minTargets: requirement.count, maxTargets: requirement.count, prompt: requirement.prompt };
    }
    if (game.phase === "VOTING") return { kind: "VOTE", legalSeats: [], minTargets: 0, maxTargets: 0, prompt: "是否对本次提名举手；结算前可以切换" };
    if ((game.phase === "DAY_DISCUSSION" || game.phase === "NOMINATION") && game.aliveSeats.includes(seat)) {
      if (this.assignment(room, seat).perceivedRoleId === "slayer" && !game.usedAbilitySeats.includes(seat)) return { kind: "SLAYER", legalSeats: game.aliveSeats.filter((candidate) => candidate !== seat), minTargets: 1, maxTargets: 1, prompt: "你可以公开选择一人发动猎魔人能力（整局一次）" };
      return { kind: "DAY", legalSeats: game.aliveSeats, minTargets: 0, maxTargets: 1, prompt: "讨论、提名，或确认结束今天" };
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
    const living = [...game.aliveSeats];
    if (roleId === "poisoner") return { count: 1, legalSeats: living, prompt: "选择今晚投毒的玩家" };
    if (roleId === "fortune_teller") return { count: 2, legalSeats: living, prompt: "选择两名不同的玩家进行占卜" };
    if (roleId === "butler") return { count: 1, legalSeats: living.filter((candidate) => candidate !== seat), prompt: "选择你明天的主人" };
    if (game.phase === "OTHER_NIGHT" && roleId === "monk") return { count: 1, legalSeats: living.filter((candidate) => candidate !== seat), prompt: "选择一名玩家免受恶魔攻击" };
    if (game.phase === "OTHER_NIGHT" && roleId === "imp") return { count: 1, legalSeats: living, prompt: "选择今晚袭击的玩家" };
    return undefined;
  }

  private settleNightIfReady(room: RoomRecord): void {
    const game = this.requireGame(room);
    if (game.pendingRavenkeeperSeat !== undefined) {
      const ravenkeeperSeat = game.pendingRavenkeeperSeat;
      const chosenSeat = game.nightSubmissions[ravenkeeperSeat]?.[0];
      if (chosenSeat === undefined) return;
      const truthfulRoleId = this.assignment(room, chosenSeat).roleId;
      const legalRoleIds = ROLE_CATALOG.map((role) => role.id);
      const shownRoleId = chooseInformationResult({
        seed: `${room.id}:ravenkeeper`,
        eventSeq: game.events.length,
        truthful: truthfulRoleId,
        legal: legalRoleIds,
        impaired: this.isImpaired(room, ravenkeeperSeat),
      });
      game.messages[ravenkeeperSeat]!.push(`守鸦人信息：${this.playerLabel(room, chosenSeat)}是${roleById(shownRoleId).name}。`);
      delete game.pendingRavenkeeperSeat;
      this.finishNight(room);
      return;
    }

    const required = game.aliveSeats.filter((seat) => this.nightRequirement(room, seat));
    if (!required.every((seat) => game.nightSubmissions[seat])) return;
    const firstNight = game.phase === "FIRST_NIGHT";
    const poisonerSeat = room.assignments.find((assignment) => assignment.roleId === "poisoner" && game.aliveSeats.includes(assignment.seat))?.seat;
    const poisonTarget = poisonerSeat === undefined ? undefined : game.nightSubmissions[poisonerSeat]?.[0];
    if (poisonTarget === undefined) delete game.poisonedSeat;
    else game.poisonedSeat = poisonTarget;
    const butlerSeat = room.assignments.find((assignment) => assignment.roleId === "butler" && game.aliveSeats.includes(assignment.seat))?.seat;
    const butlerMaster = butlerSeat === undefined ? undefined : game.nightSubmissions[butlerSeat]?.[0];
    if (butlerMaster === undefined) delete game.butlerMasterSeat;
    else game.butlerMasterSeat = butlerMaster;
    this.deliverNightInformation(room);
    if (!firstNight) {
      const monk = room.assignments.find((assignment) => assignment.roleId === "monk")?.seat;
      const demon = room.assignments.find((assignment) => assignment.roleType === "DEMON" && game.aliveSeats.includes(assignment.seat));
      let target = demon ? game.nightSubmissions[demon.seat]?.[0] : undefined;
      const protectedSeat = monk === undefined || this.isImpaired(room, monk) ? undefined : game.nightSubmissions[monk]?.[0];
      if (demon && target !== undefined && !this.isImpaired(room, demon.seat)) {
        const targetAssignment = this.assignment(room, target);
        if (targetAssignment.roleId === "mayor" && !this.isImpaired(room, target) && protectedSeat !== target) {
          const alternatives = game.aliveSeats.filter((seat) => seat !== target && seat !== demon.seat && seat !== protectedSeat);
          if (alternatives.length > 0) target = alternatives[Math.floor(randomAt(`${room.id}:mayor-redirect`, game.events.length) * alternatives.length)]!;
        }
        const resolvedTarget = this.assignment(room, target);
        const targetRoleId = resolvedTarget.roleId === "soldier" && this.isImpaired(room, target) ? "disabled-soldier" : resolvedTarget.roleId;
        const result = resolveDemonKill({ targetSeat: target, demonSeat: demon.seat, targetRoleId, protectedSeat, livingMinionSeats: room.assignments.filter((assignment) => assignment.roleType === "MINION" && game.aliveSeats.includes(assignment.seat)).map((assignment) => assignment.seat) });
        for (const death of result.deaths) this.kill(game, death);
        game.nightDeaths = result.deaths;
        if (result.newDemonSeat !== undefined) {
          const successor = this.assignment(room, result.newDemonSeat);
          successor.roleId = "imp"; successor.perceivedRoleId = "imp"; successor.roleType = "DEMON";
          game.messages[result.newDemonSeat]!.push("小恶魔自杀后，你已秘密接替成为新的小恶魔。 ");
        }
        this.event(game, result.deaths.length ? `黎明时发现 ${result.deaths.map((seat) => this.nickname(room, seat)).join("、")} 死亡。` : "黎明到来，昨夜无人死亡。 ");
        const ravenkeeper = result.deaths.find((seat) => this.assignment(room, seat).perceivedRoleId === "ravenkeeper");
        if (ravenkeeper !== undefined) {
          game.pendingRavenkeeperSeat = ravenkeeper;
          return;
        }
      } else if (demon && target !== undefined) {
        game.nightDeaths = [];
        this.event(game, "黎明到来，昨夜无人死亡。 ");
      }
    }
    this.finishNight(room);
  }

  private deliverNightInformation(room: RoomRecord): void {
    const game = this.requireGame(room);
    const firstNight = game.phase === "FIRST_NIGHT";
    const registeredEvilSeats = room.assignments.filter((assignment) => {
      if (assignment.roleId !== "recluse" && assignment.roleId !== "spy") return assignment.alignment === "EVIL";
      return chooseRegistration(assignment.roleId, "ALIGNMENT", room.id, game.events.length + assignment.seat) === "EVIL";
    }).map((assignment) => assignment.seat);
    for (const assignment of room.assignments) {
      if (!game.aliveSeats.includes(assignment.seat)) continue;
      const impaired = this.isImpaired(room, assignment.seat);
      const infoSeed = `${room.id}:${assignment.seat}:${game.day}`;
      let message: string | undefined;
      if (assignment.perceivedRoleId === "chef" && firstNight) {
        const count = registeredEvilSeats.filter((seat) => registeredEvilSeats.includes(seat === room.playerCount ? 1 : seat + 1)).length;
        const shown = chooseInformationResult({ seed: infoSeed, eventSeq: game.events.length, truthful: count, legal: [0, 1, 2, 3], impaired });
        message = `厨师信息：相邻邪恶玩家共有 ${shown} 对。`;
      } else if (assignment.perceivedRoleId === "empath") {
        const living = game.aliveSeats;
        const index = living.indexOf(assignment.seat);
        const neighbors = [living[(index - 1 + living.length) % living.length]!, living[(index + 1) % living.length]!];
        const count = neighbors.filter((seat) => registeredEvilSeats.includes(seat)).length;
        const shown = chooseInformationResult({ seed: infoSeed, eventSeq: game.events.length, truthful: count, legal: [0, 1, 2], impaired });
        message = `共情信息：你的两位最近存活邻居中有 ${shown} 位邪恶。`;
      } else if (assignment.perceivedRoleId === "fortune_teller") {
        const chosen = game.nightSubmissions[assignment.seat];
        if (chosen) {
          const truthful = chosen.some((seat) => this.assignment(room, seat).roleType === "DEMON" || seat === game.redHerringSeat);
          const shown = chooseInformationResult({ seed: infoSeed, eventSeq: game.events.length, truthful, legal: [true, false], impaired });
          message = `占卜结果：${shown ? "是" : "否"}。`;
        }
      } else if (["washerwoman", "librarian", "investigator"].includes(assignment.perceivedRoleId) && firstNight) {
        const sought = assignment.perceivedRoleId === "washerwoman" ? "TOWNSFOLK" : assignment.perceivedRoleId === "librarian" ? "OUTSIDER" : "MINION";
        const target = room.assignments.find((candidate) => this.registeredRoleType(room, candidate, game.events.length) === sought && candidate.seat !== assignment.seat);
        const decoy = room.assignments.find((candidate) => candidate.seat !== assignment.seat && candidate.seat !== target?.seat);
        if (target && decoy) {
          const actualTargetRole = roleById(target.roleId === "drunk" ? target.perceivedRoleId : target.roleId);
          const registeredMinionRole = assignment.perceivedRoleId === "investigator" && actualTargetRole.type !== "MINION"
            ? room.assignments.map((candidate) => roleById(candidate.roleId)).find((role) => role.type === "MINION") ?? ROLE_CATALOG.find((role) => role.type === "MINION")!
            : actualTargetRole;
          const shownRole = impaired
            ? ROLE_CATALOG.filter((role) => role.type === sought && role.id !== registeredMinionRole.id)[Math.floor(randomAt(infoSeed, game.events.length) * ROLE_CATALOG.filter((role) => role.type === sought && role.id !== registeredMinionRole.id).length)] ?? registeredMinionRole
            : registeredMinionRole;
          message = `${roleById(assignment.perceivedRoleId).name}信息：${this.playerLabel(room, target.seat)}与${this.playerLabel(room, decoy.seat)}中，有一位是${shownRole.name}。`;
        } else if (assignment.perceivedRoleId === "librarian") message = "图书管理员信息：本局没有外来者。";
      } else if (assignment.roleId === "spy") {
        message = `魔典：${room.assignments.map((candidate) => `${this.playerLabel(room, candidate.seat)} ${roleById(candidate.roleId).name}`).join("；")}。`;
      } else if (assignment.perceivedRoleId === "undertaker" && !firstNight && game.lastExecutedRoleId) {
        const truthful = game.lastExecutedRoleId;
        const shown = chooseInformationResult({ seed: infoSeed, eventSeq: game.events.length, truthful, legal: ROLE_CATALOG.map((role) => role.id), impaired });
        message = `送葬信息：今天被处决的是${roleById(shown).name}。`;
      }
      if (message) game.messages[assignment.seat]!.push(message);
    }
  }

  private finishNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    if (game.phase === "OTHER_NIGHT" && this.evaluateWin(room)) return;
    const firstNight = game.phase === "FIRST_NIGHT";
    game.day = firstNight ? 1 : game.day + 1;
    game.phase = "DAY_DISCUSSION";
    game.nightSubmissions = {};
    delete game.nightDeaths;
    this.event(game, `第 ${game.day} 天开始，自由讨论。`);
  }

  private beginOtherNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    game.phase = "OTHER_NIGHT";
    game.readySeats = [];
    game.nominatedBySeats = [];
    game.nominatedSeats = [];
    game.nightSubmissions = {};
    game.executionTied = false;
    delete game.onBlock;
    delete game.poisonedSeat;
    delete game.pendingRavenkeeperSeat;
    delete game.nightDeaths;
    this.event(game, "夜幕再次降临。请查看自己的手机。 ");
    this.settleNightIfReady(room);
  }

  private kill(game: GameRuntime, seat: number): void {
    game.aliveSeats = game.aliveSeats.filter((candidate) => candidate !== seat);
  }

  private evaluateWin(room: RoomRecord, executedSeat?: number, executedToday = false, mayorWinEligible = false): boolean {
    const game = this.requireGame(room);
    const livingAssignments = room.assignments.filter((assignment) => game.aliveSeats.includes(assignment.seat));
    let demonAlive = livingAssignments.some((assignment) => assignment.roleType === "DEMON");
    if (!demonAlive && game.aliveSeats.length >= 5) {
      const scarlet = livingAssignments.find((assignment) => assignment.roleId === "scarlet_woman" && !this.isImpaired(room, assignment.seat));
      if (scarlet) { scarlet.roleId = "imp"; scarlet.perceivedRoleId = "imp"; scarlet.roleType = "DEMON"; game.messages[scarlet.seat]!.push("恶魔死亡，你已成为新的小恶魔。 "); demonAlive = true; }
    }
    const executedRoleId = executedSeat === undefined || this.isImpaired(room, executedSeat) ? undefined : this.assignment(room, executedSeat).roleId;
    const livingRoleIds = livingAssignments.filter((assignment) => !this.isImpaired(room, assignment.seat)).map((assignment) => assignment.roleId);
    const result = resolveSpecialWin({ ...(executedRoleId ? { executedRoleId } : {}), livingRoleIds, livingCount: game.aliveSeats.length, demonAlive, executedToday, mayorWinEligible });
    if (!result) return false;
    game.phase = "GAME_OVER"; game.winner = result.winner; game.winReason = result.reason; room.state = "GAME_OVER";
    this.event(game, `${result.winner === "GOOD" ? "善良" : "邪恶"}阵营获胜。`);
    this.event(game, `身份揭晓：${room.assignments.map((assignment) => {
      const actual = roleById(assignment.roleId).name;
      const mistaken = assignment.roleId !== assignment.perceivedRoleId ? `（本局以为自己是${roleById(assignment.perceivedRoleId).name}）` : "";
      return `${this.playerLabel(room, assignment.seat)} ${actual}${mistaken}`;
    }).join("；")}。`);
    return true;
  }

  private isImpaired(room: RoomRecord, seat: number): boolean {
    const assignment = this.assignment(room, seat);
    return assignment.roleId === "drunk" || this.requireGame(room).poisonedSeat === seat;
  }

  private registeredRoleType(room: RoomRecord, assignment: RoleAssignment, eventSeq: number): string {
    if (assignment.roleId === "drunk") return "TOWNSFOLK";
    if (assignment.roleId === "recluse" || assignment.roleId === "spy") return chooseRegistration(assignment.roleId, "ROLE_TYPE", room.id, eventSeq + assignment.seat);
    return assignment.roleType;
  }
}
