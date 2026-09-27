/** Public choreography is never allowed to include private adjudication reasons. */
export type ExperienceKind = "NOTICE" | "NIGHT_FALLS" | "SHOT" | "NOMINATION" | "VOTE_RESULT" | "EXECUTION" | "DAWN" | "GAME_OVER";
export interface ExperienceEvent {
  seq: number;
  id: string;
  gameId: string;
  kind: ExperienceKind;
  message: string;
  occurredAt: number;
  /** Shared wall-clock start, including a short delivery lead for all devices. */
  startsAt: number;
  durationMs: number;
  actorSeat?: number;
  targetSeat?: number;
  seats?: number[];
  outcome?: "DEATH" | "NO_DEATH" | "NONE" | "TIED" | "ON_BLOCK" | "GOOD" | "EVIL";
  votes?: number;
  threshold?: number;
  day?: number;
}
export interface StorytellerDecision {
  id: string;
  day: number;
  ability: string;
  seat: number;
  choice: string;
  reason: string;
}
