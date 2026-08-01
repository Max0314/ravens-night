import { expect, test } from "vitest";
import { createRoomCode, normalizeRoomCode } from "./codes.js";

test("room codes are six readable uppercase characters", () => {
  for (let index = 0; index < 200; index += 1) {
    expect(createRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  }
});

test("room codes normalize spaces and lowercase", () => {
  expect(normalizeRoomCode(" a2 b3-c4 ")).toBe("A2B3C4");
});
