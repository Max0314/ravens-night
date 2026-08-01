import { randomAt } from "../rng.js";

export interface InformationContext<T> {
  seed: string;
  eventSeq: number;
  truthful: T;
  legal: T[];
  impaired: boolean;
}

export function chooseInformationResult<T>(context: InformationContext<T>): T {
  if (!context.impaired) return context.truthful;
  if (context.legal.length === 0) throw new Error("Information result requires at least one legal value");
  const misleading = context.legal.filter((value) => !Object.is(value, context.truthful));
  const candidates = misleading.length > 0 ? misleading : context.legal;
  return candidates[Math.floor(randomAt(context.seed, context.eventSeq) * candidates.length)]!;
}

export type RegistrationCheck = "ALIGNMENT" | "ROLE_TYPE";

export function chooseRegistration(
  roleId: string,
  check: RegistrationCheck,
  seed: string,
  eventSeq: number,
): string {
  if (roleId === "recluse") {
    const evil = randomAt(seed, eventSeq) >= 0.5;
    return check === "ALIGNMENT" ? (evil ? "EVIL" : "GOOD") : (evil ? "MINION" : "OUTSIDER");
  }
  if (roleId === "spy") {
    const good = randomAt(seed, eventSeq) >= 0.5;
    return check === "ALIGNMENT" ? (good ? "GOOD" : "EVIL") : (good ? "TOWNSFOLK" : "MINION");
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
