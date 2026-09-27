import { describe, expect, test } from "vitest";
import { setupGameRoles } from "./setup-roles.js";

describe("role assignment", () => {
  test("assigns exactly one role and one demon to each player", () => {
    const assignments = setupGameRoles(8, "fixed-seed");
    expect(assignments).toHaveLength(8);
    expect(new Set(assignments.map((assignment) => assignment.seat)).size).toBe(8);
    expect(assignments.filter((assignment) => assignment.roleType === "DEMON")).toHaveLength(1);
  });

  test("the same seed produces the same assignments", () => {
    expect(setupGameRoles(10, "repeatable")).toEqual(setupGameRoles(10, "repeatable"));
  });

  test("a six-player Baron setup replaces two Townsfolk with two Outsiders", () => {
    const assignments = Array.from({ length: 200 }, (_, index) => setupGameRoles(6, `baron-${index}`))
      .find((set) => set.some((assignment) => assignment.roleId === "baron"));
    expect(assignments).toBeDefined();
    expect(assignments?.filter((assignment) => assignment.roleType === "TOWNSFOLK")).toHaveLength(1);
    expect(assignments?.filter((assignment) => assignment.roleType === "OUTSIDER")).toHaveLength(3);
    expect(assignments?.filter((assignment) => assignment.roleType === "MINION")).toHaveLength(1);
    expect(assignments?.filter((assignment) => assignment.roleType === "DEMON")).toHaveLength(1);
  });

  test("a drunk player sees an unused townsfolk role instead of drunk", () => {
    const assignments = Array.from({ length: 200 }, (_, index) => setupGameRoles(8, `drunk-${index}`))
      .find((set) => set.some((assignment) => assignment.roleId === "drunk"));
    expect(assignments).toBeDefined();
    const drunk = assignments?.find((assignment) => assignment.roleId === "drunk");
    expect(drunk?.perceivedRoleId).not.toBe("drunk");
    expect(assignments?.some((assignment) => assignment.roleId === drunk?.perceivedRoleId)).toBe(false);
  });
});


test("curated bags preserve distributions while giving larger towns an opening clue and active ability", () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const assignments = setupGameRoles(10, `curated-${seed}`);
    const townsfolk = assignments.filter((assignment) => assignment.roleType === "TOWNSFOLK").map((assignment) => assignment.roleId);
    expect(townsfolk.some((roleId) => ["washerwoman", "librarian", "investigator", "chef", "empath", "fortune_teller"].includes(roleId))).toBe(true);
    expect(townsfolk.some((roleId) => ["fortune_teller", "monk", "ravenkeeper", "slayer"].includes(roleId))).toBe(true);
    expect(new Set(assignments.map((assignment) => assignment.roleId)).size).toBe(assignments.length);
  }
});
