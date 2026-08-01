import { describe, expect, test } from "vitest";
import { distributionFor } from "../setup.js";

describe("beginner setup distributions", () => {
  test.each([
    [5, 3, 0, 1, 1],
    [6, 3, 1, 1, 1],
    [7, 5, 0, 1, 1],
    [8, 5, 1, 1, 1],
    [9, 5, 2, 1, 1],
    [10, 7, 0, 2, 1],
    [11, 7, 1, 2, 1],
    [12, 7, 2, 2, 1],
  ])("%i players receive %i/%i/%i/%i roles", (players, townsfolk, outsider, minion, demon) => {
    expect(distributionFor(players)).toEqual({ townsfolk, outsider, minion, demon });
  });

  test("unsupported player counts are rejected", () => {
    expect(() => distributionFor(4)).toThrow(/5.*12/);
    expect(() => distributionFor(13)).toThrow(/5.*12/);
  });
});
