/** A player's intent is bound at click time; only the command version is filled at dispatch. */
export interface RoomCommandContext {
  roomInstanceId: string;
  setupId: string;
  expectedCommandVersion: number;
  gameId?: string;
  contextId?: string;
  ballotId?: string;
}
export interface RoomSelf {
  participantId: string;
  mode: "PLAYER" | "DISPLAY";
  commandVersion: number;
}
export interface RoomProtocolView {
  protocolVersion: 5;
  roomInstanceId: string;
  setupId: string;
  revision: number;
  serverNow: number;
  self?: RoomSelf;
}
export const ROOM_PROTOCOL_VERSION = 5;
export const roomCommandProperties = {
  roomInstanceId: { type: "string", minLength: 1, maxLength: 100 },
  setupId: { type: "string", minLength: 1, maxLength: 100 },
  expectedCommandVersion: { type: "integer", minimum: 0 },
  gameId: { type: "string", minLength: 1, maxLength: 150 },
  contextId: { type: "string", minLength: 1, maxLength: 100 },
  ballotId: { type: "string", minLength: 1, maxLength: 100 },
} as const;
export const roomCommandRequired = ["roomInstanceId", "setupId", "expectedCommandVersion"];
