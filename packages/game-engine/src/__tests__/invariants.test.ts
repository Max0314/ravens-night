import { describe, expect, test } from "vitest";
import { decide } from "../commands.js";
import { createInitialState, reduce } from "../state.js";

describe("day-phase invariants", () => {
  test("a dead player cannot nominate", () => {
    let state = createInitialState("seed", ["一", "二", "三", "四", "五"]);
    state = reduce(state, { type: "PHASE_CHANGED", phase: "DAY_DISCUSSION" });
    state = reduce(state, { type: "PLAYER_DIED", seat: 1, cause: "NIGHT" });
    expect(() => decide(state, { type: "NOMINATE", actorSeat: 1, nomineeSeat: 2 })).toThrow(/dead/i);
  });

  test("a ghost vote can only be spent once", () => {
    let state = createInitialState("seed", ["一", "二", "三", "四", "五"]);
    state = reduce(state, { type: "PHASE_CHANGED", phase: "VOTING" });
    state = reduce(state, { type: "PLAYER_DIED", seat: 1, cause: "NIGHT" });
    state = reduce(state, { type: "GHOST_VOTE_SPENT", seat: 1 });
    state = reduce(state, { type: "NOMINATION_STARTED", nominatorSeat: 2, nomineeSeat: 3 });
    expect(() => decide(state, { type: "VOTE", actorSeat: 1, raised: true })).toThrow(/ghost vote/i);
  });
});
