import { expect, test } from "vitest";
import { createInitialState } from "@ravens/game-engine";
import { RoomCoordinator } from "./coordinator.js";
import { MemoryEventStore } from "./event-store.js";

test("a coordinator recovers the same state from persisted events", async () => {
  const initial = createInitialState("seed", ["一", "二", "三", "四", "五"]);
  const store = new MemoryEventStore();
  const first = new RoomCoordinator(initial, store);
  await first.submit("phase", { type: "CHANGE_PHASE", phase: "DAY_DISCUSSION" });
  await first.submit("day", { type: "ADVANCE_DAY" });

  const recovered = await RoomCoordinator.recover(initial, store);
  expect(recovered.getState()).toEqual(first.getState());
});
