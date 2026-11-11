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

function takeRoleIds(type: RoleType, count: number, seed: string, required?:string): string[] {
  const roles=shuffled(rolesByType(type).map((role) => role.id), `${seed}:${type}`).slice(0, count);
  if(required&&!roles.includes(required))roles[roles.length-1]=required;
  return roles;
}

export function setupGameRoles(playerCount: number, seed: string, forced?:{seat:number;roleId:string}): RoleAssignment[] {
  const base = distributionFor(playerCount);
  if(forced&&(!Number.isInteger(forced.seat)||forced.seat<1||forced.seat>playerCount))throw new Error("Invalid forced seat");
  const forcedRole=forced?roleById(forced.roleId):undefined;
  // A forced Outsider must still belong to a legal bag; a Baron supplies the slots when needed.
  const requiredMinion=forcedRole?.type==="MINION"?forcedRole.id:forcedRole?.type==="OUTSIDER"&&base.outsider===0?"baron":undefined;
  const minions = takeRoleIds("MINION", base.minion, seed,requiredMinion);
  const hasBaron = minions.includes("baron");
  const outsiderCount = base.outsider + (hasBaron ? 2 : 0);
  const townsfolkCount = base.townsfolk - (hasBaron ? 2 : 0);
  const fixedTown=forcedRole?.type==="TOWNSFOLK"?forcedRole.id:undefined;
  const townsfolk = takeRoleIds("TOWNSFOLK", townsfolkCount, seed,fixedTown);
  // Legal bag composition is curated before seats are randomized. A new-player table
  // should have an opening clue and a player choice whenever the Townsfolk count allows.
  if (townsfolkCount >= 3) {
    const opening = ["washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller"];
    const active = ["fortune_teller", "monk", "ravenkeeper", "slayer"];
    if (!townsfolk.some((id) => opening.includes(id))) {
      const index=townsfolk.length-1-(townsfolk.at(-1)===fixedTown?1:0);
      townsfolk[index] = shuffled(opening, `${seed}:opening`)[0]!;
    }
    if (!townsfolk.some((id) => active.includes(id))) {
      const replacementIndex = townsfolk.findIndex((id, index) => id!==fixedTown&&(!opening.includes(id) || townsfolk.some((other, otherIndex) => otherIndex !== index && opening.includes(other))));
      townsfolk[replacementIndex] = shuffled(active.filter((id) => !townsfolk.includes(id)), `${seed}:active`)[0]!;
    }
  }
  const outsiders = takeRoleIds("OUTSIDER", outsiderCount, seed,forcedRole?.type==="OUTSIDER"?forcedRole.id:undefined);
  const demons = takeRoleIds("DEMON", base.demon, seed,forcedRole?.type==="DEMON"?forcedRole.id:undefined);
  const selected = [...townsfolk, ...outsiders, ...minions, ...demons];
  const unusedTownsfolk = rolesByType("TOWNSFOLK").map((role) => role.id).filter((id) => !selected.includes(id));
  const perceivedDrunkRole = shuffled(unusedTownsfolk, `${seed}:drunk`)[0] ?? "washerwoman";

  const assignments:RoleAssignment[]=shuffled(selected, `${seed}:seats`).map((roleId, index) => {
    const role = roleById(roleId);
    return {
      seat: index + 1,
      roleId,
      perceivedRoleId: roleId === "drunk" ? perceivedDrunkRole : roleId,
      roleType: role.type,
      alignment: role.type === "MINION" || role.type === "DEMON" ? "EVIL" : "GOOD",
    };
  });
  if(forced){
    const from=assignments.findIndex(role=>role.roleId===forced.roleId),to=forced.seat-1;
    const previous=assignments[to]!;
    assignments[to]={...assignments[from]!,seat:forced.seat};
    assignments[from]={...previous,seat:from+1};
  }
  return assignments;
}
