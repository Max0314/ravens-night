import { randomUUID } from "node:crypto";
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
}

export interface RoomRecord {
  id: string;
  code: string;
  organizerName: string;
  playerCount: number;
  participants: ParticipantRecord[];
  state: "LOBBY" | "TUTORIAL" | "RUNNING" | "GAME_OVER";
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
    };
    this.#rooms.set(code, room);
    return { room: structuredClone(room), organizerToken };
  }

  join(codeInput: string, nicknameInput: string, mode: ParticipantMode): { participant: ParticipantRecord; token: string } {
    const room = this.find(codeInput);
    if (room.state !== "LOBBY") throw new Error("Game already started");
    const nickname = nicknameInput.trim().slice(0, 24);
    if (!nickname) throw new Error("Nickname is required");
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
    };
    room.participants.push(participant);
    return { participant: structuredClone(participant), token };
  }

  find(codeInput: string): RoomRecord {
    const code = normalizeRoomCode(codeInput);
    const room = this.#rooms.get(code);
    if (!room) throw new Error("Room not found");
    return room;
  }
}
