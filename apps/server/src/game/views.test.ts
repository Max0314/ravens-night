import { describe, expect, test } from "vitest";
import { createInitialState, setupGameRoles } from "@ravens/game-engine";
import { projectPlayerView, projectPublicView } from "./views.js";

function keysDeep(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

describe("authorized game projections", () => {
  const state = createInitialState("seed", ["一", "二", "三", "四", "五"]);
  const assignments = setupGameRoles(5, "seed");

  test("public display projection contains no hidden-state vocabulary", () => {
    const view = projectPublicView(state, "ABC234", new Set([1, 2, 3, 4, 5]));
    const forbidden = ["roleId", "alignment", "poisoned", "drunk", "privateMessages", "availableAction"];
    expect(keysDeep(view).filter((key) => forbidden.includes(key))).toEqual([]);
  });

  test("a player projection contains only that player's assignment", () => {
    const view = projectPlayerView(state, "ABC234", new Set([1]), assignments, 1, []);
    expect(view.self.roleId).toBe(assignments[0]?.perceivedRoleId);
    expect(JSON.stringify(view)).not.toContain(assignments[1]?.roleId ?? "impossible-role");
  });
});
