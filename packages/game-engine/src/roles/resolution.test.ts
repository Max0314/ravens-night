import { describe, expect, test } from "vitest";
import { resolveDemonKill, resolveSpecialWin } from "./resolution.js";

describe("night kill resolution", () => {
  test("the soldier and a monk-protected target survive demon attacks", () => {
    expect(resolveDemonKill({ targetSeat: 2, targetRoleId: "soldier", protectedSeat: undefined, livingMinionSeats: [] })).toEqual({ deaths: [] });
    expect(resolveDemonKill({ targetSeat: 2, targetRoleId: "empath", protectedSeat: 2, livingMinionSeats: [] })).toEqual({ deaths: [] });
  });

  test("an imp self-kill transfers demonhood to a living minion", () => {
    expect(resolveDemonKill({ targetSeat: 5, demonSeat: 5, targetRoleId: "imp", protectedSeat: undefined, livingMinionSeats: [2, 4] })).toEqual({ deaths: [5], newDemonSeat: 2 });
  });
});

describe("special wins", () => {
  test("executing the saint gives evil an immediate win", () => {
    expect(resolveSpecialWin({ executedRoleId: "saint", livingCount: 6, demonAlive: true, executedToday: true })).toEqual({ winner: "EVIL", reason: "saint-executed" });
  });

  test("the mayor wins for good at three alive with no execution", () => {
    expect(resolveSpecialWin({ livingRoleIds: ["mayor", "imp", "chef"], livingCount: 3, demonAlive: true, executedToday: false })).toEqual({ winner: "GOOD", reason: "mayor-final-three" });
  });
});
