import { randomAt } from "../rng.js";
import type { Alignment } from "../types.js";

export interface KillContext {
  targetSeat: number;
  demonSeat?: number;
  targetRoleId: string;
  protectedSeat: number | undefined;
  livingMinionSeats: number[];
  targetAlive?: boolean;
  livingCountBefore?: number;
  /** Must already be checked for life and impairment by the caller. */
  healthyScarletWomanSeat?: number;
  selectedSuccessorSeat?: number;
  seed?: string;
}

export interface KillResult {
  deaths: number[];
  newDemonSeat?: number;
}

export function resolveDemonKill(context: KillContext): KillResult {
  if (context.targetAlive === false) return { deaths: [] };
  if (context.targetRoleId === "soldier" || context.protectedSeat === context.targetSeat) return { deaths: [] };
  if (context.targetSeat === context.demonSeat && context.targetRoleId === "imp" && context.livingMinionSeats.length > 0) {
    const scarlet = (context.livingCountBefore ?? 0) >= 5 && context.healthyScarletWomanSeat !== undefined && context.livingMinionSeats.includes(context.healthyScarletWomanSeat)
      ? context.healthyScarletWomanSeat : undefined;
    const chosen = context.selectedSuccessorSeat !== undefined && context.livingMinionSeats.includes(context.selectedSuccessorSeat) ? context.selectedSuccessorSeat : undefined;
    const random = context.livingMinionSeats[Math.floor(randomAt(context.seed ?? "imp-succession", context.targetSeat) * context.livingMinionSeats.length)]!;
    return { deaths: [context.targetSeat], newDemonSeat: scarlet ?? chosen ?? random };
  }
  return { deaths: [context.targetSeat] };
}

export interface SpecialWinContext {
  executedRoleId?: string;
  livingRoleIds?: string[];
  livingCount: number;
  demonAlive: boolean;
  executedToday: boolean;
  mayorWinEligible?: boolean;
}

export function resolveSpecialWin(context: SpecialWinContext): { winner: Alignment; reason: string } | undefined {
  if (context.executedRoleId === "saint") return { winner: "EVIL", reason: "saint-executed" };
  if (context.mayorWinEligible && context.livingCount === 3 && !context.executedToday && context.livingRoleIds?.includes("mayor")) {
    return { winner: "GOOD", reason: "mayor-final-three" };
  }
  if (!context.demonAlive) return { winner: "GOOD", reason: "demon-dead" };
  if (context.livingCount <= 2) return { winner: "EVIL", reason: "final-two" };
  return undefined;
}
