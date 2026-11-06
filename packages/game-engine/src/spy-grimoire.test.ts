import { expect, test } from "vitest";
import { grimoireCandidates, trueGrimoire, validateGrimoire, type GrimoireInput } from "./spy-grimoire.js";
import { roleById } from "./roles/catalog.js";
function fixture(ids: string[], alive: number[]): GrimoireInput {
  return {assignments:ids.map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id==="drunk"?"washerwoman":id,roleType:roleById(id).type,alignment:["MINION","DEMON"].includes(roleById(id).type)?"EVIL":"GOOD"})),aliveSeats:alive,usedAbilitySeats:[],virginSpentSeats:[]};
}
test("whole poisoned grimoires retain multiple former Imps, every evil seat and coherent drunk packages",()=>{
  const input=fixture(["imp","imp","imp","spy","drunk","virgin","slayer","recluse","monk","fortune_teller","poisoner","butler"],[3,4,5,6,7,8,9,10,11,12]);
  Object.assign(input,{poisonedSeat:4,poisonSourceSeat:11,protectedSeat:5,redHerringSeat:7,butlerMasterSeat:8,usedAbilitySeats:[7],virginSpentSeats:[6],informationPairs:{5:{targetSeat:6,decoySeat:8}}});
  const candidates=grimoireCandidates(input,4);
  expect(candidates.length).toBeGreaterThan(1);expect(candidates[0]).toEqual(trueGrimoire(input));
  for(const candidate of candidates){expect(validateGrimoire(candidate,input,4)).toBe(true);expect(candidate.entries.filter(e=>e.roleId==="imp")).toHaveLength(3);for(const seat of [1,2,3,4,11])expect(candidate.entries.find(e=>e.seat===seat)).toEqual(candidates[0]!.entries.find(e=>e.seat===seat));}
  expect(candidates.slice(1).every(c=>!c.reminders.some(r=>r.kind==="POISON"&&r.targetSeats.includes(4)))).toBe(true);
});
test("no legal perturbation falls back to the complete truthful candidate",()=>{
  const input=fixture(["imp","spy","scarlet_woman","chef","saint"],[1,2,3,4]);
  expect(grimoireCandidates(input,2)).toEqual([trueGrimoire(input)]);
  const bad=trueGrimoire(input);bad.entries[0]!.roleId="chef";expect(validateGrimoire(bad,input,2)).toBe(false);
});
