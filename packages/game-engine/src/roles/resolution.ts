import type { Alignment } from "../types.js";

export interface KillContext {
  targetSeat: number;
  demonSeat?: number;
  targetRoleId: string;
  protectedSeat: number | undefined;
  livingMinionSeats: number[];
}

export interface KillResult {
  deaths: number[];
  newDemonSeat?: number;
}

export function resolveDemonKill(context: KillContext): KillResult {
  if (context.targetRoleId === "soldier" || context.protectedSeat === context.targetSeat) return { deaths: [] };
  if (context.targetSeat === context.demonSeat && context.targetRoleId === "imp" && context.livingMinionSeats.length > 0) {
    return { deaths: [context.targetSeat], newDemonSeat: [...context.livingMinionSeats].sort((a, b) => a - b)[0]! };
  }
  return { deaths: [context.targetSeat] };
}

export interface SpecialWinContext {
  executedRoleId?: string;
  livingRoleIds?: string[];
  livingCount: number;
  demonAlive: boolean;
  executedToday: boolean;
}

export function resolveSpecialWin(context: SpecialWinContext): { winner: Alignment; reason: string } | undefined {
  if (context.executedRoleId === "saint") return { winner: "EVIL", reason: "saint-executed" };
  if (context.livingCount === 3 && !context.executedToday && context.livingRoleIds?.includes("mayor")) {
    return { winner: "GOOD", reason: "mayor-final-three" };
  }
  if (!context.demonAlive) return { winner: "GOOD", reason: "demon-dead" };
  if (context.livingCount <= 2) return { winner: "EVIL", reason: "final-two" };
  return undefined;
}
