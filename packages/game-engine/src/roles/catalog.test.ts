import { describe, expect, test } from "vitest";
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER } from "../night/order.js";
import { ROLE_CATALOG, rolesByType } from "./catalog.js";

describe("beginner role catalog", () => {
  test("contains exactly 13 townsfolk, 4 outsiders, 4 minions, and 1 demon", () => {
    expect(ROLE_CATALOG).toHaveLength(22);
    expect(rolesByType("TOWNSFOLK")).toHaveLength(13);
    expect(rolesByType("OUTSIDER")).toHaveLength(4);
    expect(rolesByType("MINION")).toHaveLength(4);
    expect(rolesByType("DEMON")).toHaveLength(1);
  });

  test("every role has beginner guidance and unique night order slots", () => {
    expect(new Set(ROLE_CATALOG.map((role) => role.id)).size).toBe(22);
    for (const role of ROLE_CATALOG) {
      expect(role.summary.length).toBeGreaterThan(8);
      expect(role.beginnerTip.length).toBeGreaterThan(8);
    }
  });
});


test("night ordering places protection and death before subsequent information", () => {
  expect(FIRST_NIGHT_ORDER).toEqual(["poisoner", "washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller", "butler", "spy"]);
  expect(OTHER_NIGHT_ORDER).toEqual(["poisoner", "monk", "imp", "ravenkeeper", "undertaker", "empath", "fortune_teller", "butler", "spy"]);
});
