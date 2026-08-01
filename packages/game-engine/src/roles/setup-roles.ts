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
