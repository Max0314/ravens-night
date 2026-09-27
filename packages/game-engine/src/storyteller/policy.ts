import { randomAt } from "../rng.js";

export interface InformationContext<T> {
  seed: string;
  eventSeq: number;
  truthful: T;
  legal: T[];
  impaired: boolean;
  history?: string[];
  livingCount?: number;
}

export function chooseInformationResult<T>(context: InformationContext<T>): T {
  if (!context.impaired) return context.truthful;
  if (context.legal.length === 0) throw new Error("Information result requires at least one legal value");
  // Truth is legal for a drunk/poisoned player too. Avoid a learnable inversion rule.
  const lateGame = (context.livingCount ?? 12) <= 4;
  const recent = context.history?.slice(-2) ?? [];
  const candidates = context.legal.map((value) => ({ value, weight: (Object.is(value, context.truthful) ? (lateGame ? 1.2 : 1) : 2) * (recent.includes(String(value)) ? 0.7 : 1) }));
  let roll = randomAt(context.seed, context.eventSeq) * candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  return candidates.find((candidate) => (roll -= candidate.weight) < 0)?.value ?? context.legal.at(-1)!;
}

export type RegistrationCheck = "ALIGNMENT" | "ROLE_TYPE";

export function chooseRegistration(
  roleId: string,
  check: RegistrationCheck,
  seed: string,
  eventSeq: number,
): string {
  if (roleId === "recluse") {
    const roll = randomAt(seed, eventSeq);
    return check === "ALIGNMENT" ? (roll >= 0.5 ? "EVIL" : "GOOD") : ["OUTSIDER", "MINION", "DEMON"][Math.floor(roll * 3)]!;
  }
  if (roleId === "spy") {
    const roll = randomAt(seed, eventSeq);
    return check === "ALIGNMENT" ? (roll >= 0.5 ? "GOOD" : "EVIL") : ["MINION", "TOWNSFOLK", "OUTSIDER"][Math.floor(roll * 3)]!;
  }
  if (check === "ALIGNMENT") return roleId === "imp" || ["poisoner", "spy", "scarlet_woman", "baron"].includes(roleId) ? "EVIL" : "GOOD";
  return roleByType(roleId);
}

function roleByType(roleId: string): string {
  if (roleId === "imp") return "DEMON";
  if (["poisoner", "spy", "scarlet_woman", "baron"].includes(roleId)) return "MINION";
  if (["butler", "drunk", "recluse", "saint"].includes(roleId)) return "OUTSIDER";
  return "TOWNSFOLK";
}
