import { shuffled } from "../rng.js";
import { distributionFor } from "../setup.js";
import type { Alignment, RoleType } from "../types.js";
import { roleById, rolesByType } from "./catalog.js";

export interface RoleAssignment {
  seat: number;
  roleId: string;
  perceivedRoleId: string;
  roleType: RoleType;
  alignment: Alignment;
}

function takeRoleIds(type: RoleType, count: number, seed: string): string[] {
  return shuffled(rolesByType(type).map((role) => role.id), `${seed}:${type}`).slice(0, count);
}

export function setupGameRoles(playerCount: number, seed: string): RoleAssignment[] {
  const base = distributionFor(playerCount);
  const minions = takeRoleIds("MINION", base.minion, seed);
  const hasBaron = minions.includes("baron");
  const outsiderCount = base.outsider + (hasBaron ? 2 : 0);
  const townsfolkCount = base.townsfolk - (hasBaron ? 2 : 0);
  const townsfolk = takeRoleIds("TOWNSFOLK", townsfolkCount, seed);
  // Legal bag composition is curated before seats are randomized. A new-player table
  // should have an opening clue and a player choice whenever the Townsfolk count allows.
  if (townsfolkCount >= 3) {
    const opening = ["washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller"];
    const active = ["fortune_teller", "monk", "ravenkeeper", "slayer"];
    if (!townsfolk.some((id) => opening.includes(id))) townsfolk[townsfolk.length - 1] = shuffled(opening, `${seed}:opening`)[0]!;
    if (!townsfolk.some((id) => active.includes(id))) {
      const replacementIndex = townsfolk.findIndex((id, index) => !opening.includes(id) || townsfolk.some((other, otherIndex) => otherIndex !== index && opening.includes(other)));
      townsfolk[replacementIndex] = shuffled(active.filter((id) => !townsfolk.includes(id)), `${seed}:active`)[0]!;
    }
  }
  const outsiders = takeRoleIds("OUTSIDER", outsiderCount, seed);
  const demons = takeRoleIds("DEMON", base.demon, seed);
  const selected = [...townsfolk, ...outsiders, ...minions, ...demons];
  const unusedTownsfolk = rolesByType("TOWNSFOLK").map((role) => role.id).filter((id) => !selected.includes(id));
  const perceivedDrunkRole = shuffled(unusedTownsfolk, `${seed}:drunk`)[0] ?? "washerwoman";

  return shuffled(selected, `${seed}:seats`).map((roleId, index) => {
    const role = roleById(roleId);
    return {
      seat: index + 1,
      roleId,
      perceivedRoleId: roleId === "drunk" ? perceivedDrunkRole : roleId,
      roleType: role.type,
      alignment: role.type === "MINION" || role.type === "DEMON" ? "EVIL" : "GOOD",
    };
  });
}
