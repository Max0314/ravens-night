import type { GamePhase } from "@ravens/contracts";

export type Alignment = "GOOD" | "EVIL";
export type RoleType = "TOWNSFOLK" | "OUTSIDER" | "MINION" | "DEMON";

export interface PlayerState {
  seat: number;
  nickname: string;
  alive: boolean;
  ghostVoteAvailable: boolean;
  nominatedToday: boolean;
  wasNominatedToday: boolean;
  roleId?: string;
  perceivedRoleId?: string;
  alignment?: Alignment;
  roleType?: RoleType;
  poisonedUntilDay?: number;
  drunk?: boolean;
}

export interface NominationState {
  nominatorSeat: number;
  nomineeSeat: number;
  votes: Record<number, boolean>;
}

export interface GameState {
  seed: string;
  rngCursor: number;
  phase: GamePhase;
  day: number;
  players: PlayerState[];
  nomination?: NominationState;
  onBlock?: { seat: number; votes: number };
  executionOccurred: boolean;
  winner?: Alignment;
  winReason?: string;
}

export type EngineEvent =
  | { type: "PHASE_CHANGED"; phase: GamePhase }
  | { type: "PLAYER_DIED"; seat: number; cause: "NIGHT" | "EXECUTION" | "ABILITY" }
  | { type: "DAY_ADVANCED"; day: number }
  | { type: "GHOST_VOTE_SPENT"; seat: number }
  | { type: "NOMINATION_STARTED"; nominatorSeat: number; nomineeSeat: number }
  | { type: "VOTE_RECORDED"; seat: number; raised: boolean }
  | { type: "EXECUTION_SET"; seat: number; votes: number }
  | { type: "GAME_WON"; winner: Alignment; reason: string };

export type EngineCommand =
  | { type: "NOMINATE"; actorSeat: number; nomineeSeat: number }
  | { type: "VOTE"; actorSeat: number; raised: boolean }
  | { type: "CHANGE_PHASE"; phase: GamePhase }
  | { type: "ADVANCE_DAY" };
