import type { ExperienceEvent, StorytellerDecision } from "./experience.js";
import type { RoomProtocolView } from "./room-protocol.js";
export interface RoomParticipant { id: string; nickname: string; avatar?: string; mode: "PLAYER" | "DISPLAY"; seat?: number; connected: boolean; ready?: boolean; lastSeenAt?: number }
export type RoomPlayMode = "IN_PERSON" | "REMOTE" | "HYBRID";
export interface GameView {
  revealComplete?: boolean;
  contextId?: string;
  gameId?: string;
  revision?: number;
  serverNow?: number;
  presentationUntil?: number;
  phaseDeadlineAt?: number;
  pauseReason?: string;
  phase: "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER" | "ABORTED";
  day: number;
  seats: Array<{ id?: string; avatar?: string; seat: number; nickname: string; connected: boolean; alive: boolean; ghostVoteAvailable: boolean }>;
  events: Array<Partial<ExperienceEvent> & { seq: number; message: string }>;
  readyCount: number;
  aliveCount: number;
  nomination?: { ballotId?: string; nominatorSeat: number; nomineeSeat: number; votesReceived: number; votesRaised: number; threshold: number; votersRequired?: number; defenseUntil?: number; voteStartsAt?: number; voteEndsAt?: number; currentVoterSeat?: number; countedSeats?: number[]; countedVotes?: Record<number, boolean>; voterOrder?: number[]; raisedSeats?: number[]; nextCountAt?: number };
  onBlock?: { seat: number; votes: number };
  executionTied?: boolean;
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}
export interface RoomView extends Partial<RoomProtocolView> { code: string; state: string; playerCount: number; playMode?: RoomPlayMode; voiceRoomUrl?: string; organizerId?: string; organizerName?: string; participants: RoomParticipant[]; game?: GameView; rulesSummary?: string; hostClaimAt?: number; tutorialCompleteCount?: number }
export type PrivateHistoryPhase = GameView["phase"] | "HISTORY";
export type PrivateHistoryKind = "IDENTITY" | "ACTION" | "INFORMATION" | "ROLE_CHANGE" | "NOTICE";
export interface PrivateHistoryEntry {
  seq: number;
  phase: PrivateHistoryPhase;
  day: number;
  kind: PrivateHistoryKind;
  text: string;
}
export interface PrivateView extends Partial<RoomProtocolView> {
  room?: RoomView;
  contextId?: string;
  dayReady?: boolean;
  canCancelNomination?: boolean;
  canAbort?: boolean;
  canRestart?: boolean;
  canCancelTutorial?: boolean;
  canClaimHost?: boolean;
  butler?: { masterSeat?: number; masterRaised: boolean };
  social?: { invitations: Array<{ id: string; fromSeat: number; toSeat: number; status: string; createdAt: number }>; activeWhisper?: { id: string; participants: number[]; messages: Array<{ id: string; seat: number; text: string; createdAt: number }> } };
  participant: { id: string; nickname: string; seat: number; tutorialComplete?: boolean };
  storytellerDecisions?: StorytellerDecision[];
  state: string;
  playMode?: RoomPlayMode;
  voiceRoomUrl?: string;
  canClaimSlayer?: boolean;
  dayAbilityTargets?: number[];
  canNominate?: boolean;
  nominationTargets?: number[];
  canVote?: boolean;
  canEndDay?: boolean;
  canFinishDefense?: boolean;
  role?: { roleId: string; alignment: "GOOD" | "EVIL"; type: string; name: string; summary: string; beginnerTip: string; perceivedAs?: string };
  roleConfirmed?: boolean;
  voteRaised?: boolean;
  messages: string[];
  history: PrivateHistoryEntry[];
  game?: GameView;
  action?: { kind: "CONFIRM_ROLE" | "SELECT_ONE" | "SELECT_TWO" | "VOTE" | "DAY" | "SLAYER"; legalSeats: number[]; minTargets: number; maxTargets: number; prompt: string };
}

export interface RoomResult { gameId: string; releasedAt: number; winner: "GOOD" | "EVIL"; reason: string; days: number; participants: Array<{id: string; nickname: string; avatar?: string; finalRole: string; perceivedRole?: string}> }
