import type { PlayerGameView, PublicGameView } from "./views.js";

export type ServerMessage =
  | { type: "PUBLIC_VIEW"; revision: number; view: PublicGameView }
  | { type: "PLAYER_VIEW"; revision: number; view: PlayerGameView }
  | { type: "PRESENCE"; participantId: string; connected: boolean }
  | { type: "ERROR"; code: string; message: string };
