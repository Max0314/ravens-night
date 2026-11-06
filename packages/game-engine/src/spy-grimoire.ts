import type { RoleAssignment } from "./roles/setup-roles.js";
export interface GrimoireEntry { seat: number; roleId: string; perceivedRoleId: string; alive: boolean }
export interface GrimoireReminder { kind: "POISON" | "PROTECT" | "RED_HERRING" | "USED" | "VIRGIN" | "MASTER" | "PAIR"; ownerSeat?: number; targetSeats: number[] }
export interface Grimoire { entries: GrimoireEntry[]; reminders: GrimoireReminder[] }
export interface GrimoireInput {
  assignments: RoleAssignment[]; aliveSeats: number[]; poisonedSeat?: number; poisonSourceSeat?: number;
  protectedSeat?: number; redHerringSeat?: number; usedAbilitySeats: number[]; virginSpentSeats: number[];
  butlerMasterSeat?: number; informationPairs?: Record<number, { targetSeat: number; decoySeat: number }>;
}
export function trueGrimoire(input: GrimoireInput): Grimoire {
  const entries = input.assignments.map(({ seat, roleId, perceivedRoleId }) => ({ seat, roleId, perceivedRoleId, alive: input.aliveSeats.includes(seat) }));
  const reminders: GrimoireReminder[] = [];
  const owner = (roleId: string) => input.assignments.find(role => role.roleId === roleId)?.seat;
  const add = (kind: GrimoireReminder["kind"], target: number | undefined, ownerSeat?: number) => {
    if (target !== undefined) reminders.push({ kind, targetSeats: [target], ...(ownerSeat === undefined ? {} : { ownerSeat }) });
  };
  add("POISON", input.poisonedSeat, input.poisonSourceSeat);
  add("PROTECT", input.protectedSeat, owner("monk"));
  add("RED_HERRING", input.redHerringSeat, owner("fortune_teller"));
  add("MASTER", input.butlerMasterSeat, owner("butler"));
  for (const seat of input.usedAbilitySeats) add("USED", seat, seat);
  for (const seat of input.virginSpentSeats) add("VIRGIN", seat, seat);
  for (const [observer, pair] of Object.entries(input.informationPairs ?? {})) reminders.push({ kind: "PAIR", ownerSeat: Number(observer), targetSeats: [pair.targetSeat, pair.decoySeat] });
  return { entries, reminders };
}
export function validateGrimoire(candidate: Grimoire, input: GrimoireInput, spySeat: number): boolean {
  const truth = trueGrimoire(input), seats = new Set(truth.entries.map(entry => entry.seat));
  const roles = (value: Grimoire) => value.entries.map(entry => entry.roleId).sort().join(",");
  if (candidate.entries.length !== seats.size || new Set(candidate.entries.map(entry => entry.seat)).size !== seats.size || roles(candidate) !== roles(truth)) return false;
  for (const entry of candidate.entries) {
    const real = input.assignments.find(role => role.seat === entry.seat);
    if (!real || entry.alive !== input.aliveSeats.includes(entry.seat)) return false;
    if ((entry.seat === spySeat || real.alignment === "EVIL" || real.roleId === "imp") && (entry.roleId !== real.roleId || entry.perceivedRoleId !== real.perceivedRoleId)) return false;
    if (entry.roleId === "drunk" && candidate.entries.some(other => other.roleId === entry.perceivedRoleId)) return false;
  }
  for (const reminder of candidate.reminders) {
    if (reminder.targetSeats.some(seat => !seats.has(seat)) || (reminder.ownerSeat !== undefined && !seats.has(reminder.ownerSeat))) return false;
    const own = candidate.entries.find(entry => entry.seat === reminder.ownerSeat);
    if (reminder.kind === "USED" && own?.perceivedRoleId !== "slayer") return false;
    if (reminder.kind === "VIRGIN" && own?.perceivedRoleId !== "virgin") return false;
    if (reminder.kind === "PAIR" && !["washerwoman", "librarian", "investigator"].includes(own?.perceivedRoleId ?? "")) return false;
    const role = { POISON: "poisoner", PROTECT: "monk", RED_HERRING: "fortune_teller", MASTER: "butler" }[reminder.kind as "POISON" | "PROTECT" | "RED_HERRING" | "MASTER"];
    if (role && own && own.roleId !== role && own.perceivedRoleId !== role) return false;
  }
  return true;
}

/** Whole candidates preserve real role multiplicities, including dead former Imps. */
export function grimoireCandidates(input: GrimoireInput, spySeat: number): Grimoire[] {
  const truth = trueGrimoire(input), candidates = [truth];
  const movable = input.assignments.filter(role => role.seat !== spySeat && role.alignment === "GOOD" && role.roleId !== "imp");
  for (let i = 0; i < movable.length; i++) for (let j = i + 1; j < movable.length; j++) {
    const a = movable[i]!.seat, b = movable[j]!.seat;
    if (input.aliveSeats.includes(a) !== input.aliveSeats.includes(b)) continue;
    const mapping = (seat: number) => seat === a ? b : seat === b ? a : seat;
    const candidate = structuredClone(truth);
    for (const entry of candidate.entries) entry.seat = mapping(entry.seat);
    candidate.entries.sort((left, right) => left.seat - right.seat);
    for (const reminder of candidate.reminders) {
      if (reminder.ownerSeat !== undefined) reminder.ownerSeat = mapping(reminder.ownerSeat);
      reminder.targetSeats = reminder.targetSeats.map(mapping);
      if (reminder.kind === "POISON" && reminder.targetSeats.includes(spySeat)) {
        const alternative = candidate.entries.find(entry => entry.seat !== spySeat && entry.seat !== reminder.ownerSeat);
        if (alternative) reminder.targetSeats = [alternative.seat];
      }
    }
    if (validateGrimoire(candidate, input, spySeat) && !candidate.reminders.some(reminder => reminder.kind === "POISON" && reminder.targetSeats.includes(spySeat))) candidates.push(candidate);
  }
  return candidates;
}
