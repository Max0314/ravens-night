import { describe, expect, test } from "vitest";
import { resolveDemonKill, resolveSpecialWin } from "./resolution.js";

describe("night kill resolution", () => {
  test("the soldier and a monk-protected target survive demon attacks", () => {
    expect(resolveDemonKill({ targetSeat: 2, targetRoleId: "soldier", protectedSeat: undefined, livingMinionSeats: [] })).toEqual({ deaths: [] });
    expect(resolveDemonKill({ targetSeat: 2, targetRoleId: "empath", protectedSeat: 2, livingMinionSeats: [] })).toEqual({ deaths: [] });
  });

  test("an imp self-kill transfers demonhood to a living minion", () => {
    expect(resolveDemonKill({ targetSeat: 5, demonSeat: 5, targetRoleId: "imp", protectedSeat: undefined, livingMinionSeats: [2, 4], selectedSuccessorSeat: 4 })).toEqual({ deaths: [5], newDemonSeat: 4 });
  });
});

describe("special wins", () => {
  test("executing the saint gives evil an immediate win", () => {
    expect(resolveSpecialWin({ executedRoleId: "saint", livingCount: 6, demonAlive: true, executedToday: true })).toEqual({ winner: "EVIL", reason: "saint-executed" });
  });

  test("the mayor wins for good at three alive with no execution", () => {
    expect(resolveSpecialWin({ livingRoleIds: ["mayor", "imp", "chef"], livingCount: 3, demonAlive: true, executedToday: false, mayorWinEligible: true })).toEqual({ winner: "GOOD", reason: "mayor-final-three" });
    expect(resolveSpecialWin({ livingRoleIds: ["mayor", "imp", "chef"], livingCount: 3, demonAlive: true, executedToday: false })).toBeUndefined();
  });
});

test("a self-kill respects healthy Scarlet Woman priority and corpse attacks do nothing", () => {
  expect(resolveDemonKill({ targetSeat: 6, demonSeat: 6, targetRoleId: "imp", protectedSeat: undefined, livingMinionSeats: [2, 5], selectedSuccessorSeat: 2, livingCountBefore: 5, healthyScarletWomanSeat: 5 })).toEqual({ deaths: [6], newDemonSeat: 5 });
  expect(resolveDemonKill({ targetSeat: 3, targetRoleId: "saint", protectedSeat: undefined, livingMinionSeats: [], targetAlive: false })).toEqual({ deaths: [] });
});
