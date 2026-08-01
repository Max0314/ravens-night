import { expect, test } from "vitest";
import { createInitialState, reduce, replay } from "../state.js";
import type { EngineEvent } from "../types.js";

test("replaying an event log recreates the same public game state", () => {
  const initial = createInitialState("seed-7", ["安", "北", "晨", "冬", "禾"]);
  const events: EngineEvent[] = [
    { type: "PHASE_CHANGED", phase: "DAY_DISCUSSION" },
    { type: "PLAYER_DIED", seat: 2, cause: "NIGHT" },
    { type: "DAY_ADVANCED", day: 1 },
  ];

  const reduced = events.reduce(reduce, initial);
  expect(replay(initial, events)).toEqual(reduced);
  expect(reduced.players[1]?.alive).toBe(false);
  expect(reduced.day).toBe(1);
});
