import { expect, test } from "vitest";
import { parsePublicGameView } from "./views.js";

test("the public display contract rejects hidden role data", () => {
  const publicView = {
    roomCode: "ABC234",
    phase: "LOBBY",
    day: 0,
    seats: [],
    publicEvents: [],
    roleId: "demon",
  };

  expect(() => parsePublicGameView(publicView)).toThrow(/public view/i);
});
