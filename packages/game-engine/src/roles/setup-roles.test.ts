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

  test("a drunk player sees an unused townsfolk role instead of drunk", () => {
    const assignments = Array.from({ length: 200 }, (_, index) => setupGameRoles(8, `drunk-${index}`))
      .find((set) => set.some((assignment) => assignment.roleId === "drunk"));
    expect(assignments).toBeDefined();
    const drunk = assignments?.find((assignment) => assignment.roleId === "drunk");
    expect(drunk?.perceivedRoleId).not.toBe("drunk");
    expect(assignments?.some((assignment) => assignment.roleId === drunk?.perceivedRoleId)).toBe(false);
  });
});
