export type GameCommand =
  | { type: "ACK_TUTORIAL"; step: number }
  | { type: "CONFIRM_ROLE" }
  | { type: "SUBMIT_NIGHT_TARGET"; seats: number[] }
  | { type: "START_NOMINATION"; nomineeSeat: number }
  | { type: "CAST_VOTE"; raised: boolean }
  | { type: "ADVANCE_PHASE" }
  | { type: "ABORT_GAME" };

export interface CommandEnvelope {
  commandId: string;
  actorParticipantId: string;
  roomId: string;
  command: GameCommand;
}
