import { describe, expect, test } from "vitest";
import { createInitialState } from "@ravens/game-engine";
import { MemoryEventStore } from "./event-store.js";
import { RoomCoordinator } from "./coordinator.js";

describe("room command coordination", () => {
  test("repeating a command id returns the original events without appending twice", async () => {
    const store = new MemoryEventStore();
    const coordinator = new RoomCoordinator(createInitialState("seed", ["一", "二", "三", "四", "五"]), store);

    const first = await coordinator.submit("same-id", { type: "CHANGE_PHASE", phase: "DAY_DISCUSSION" });
    const duplicate = await coordinator.submit("same-id", { type: "CHANGE_PHASE", phase: "VOTING" });

    expect(duplicate).toEqual(first);
    expect(await store.load()).toHaveLength(1);
    expect(coordinator.getState().phase).toBe("DAY_DISCUSSION");
  });

  test("simultaneous commands are applied in arrival order", async () => {
    const store = new MemoryEventStore();
    const coordinator = new RoomCoordinator(createInitialState("seed", ["一", "二", "三", "四", "五"]), store);
    await Promise.all([
      coordinator.submit("one", { type: "CHANGE_PHASE", phase: "DAY_DISCUSSION" }),
      coordinator.submit("two", { type: "ADVANCE_DAY" }),
    ]);
    expect(coordinator.getState().phase).toBe("DAY_DISCUSSION");
    expect(coordinator.getState().day).toBe(1);
  });
});
