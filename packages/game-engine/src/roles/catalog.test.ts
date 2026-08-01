import { describe, expect, test } from "vitest";
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
