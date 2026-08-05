import { describe, expect, it } from "vitest";
import { RoomService } from "./service.js";

describe("room lifecycle", () => {
  it("keeps the chosen play mode and optional voice room public", () => {
    const rooms = new RoomService();
    const created = rooms.create(5, "Host", "HYBRID", "https://meet.example.test/room");

    expect(rooms.publicView(created.room.code)).toMatchObject({
      playMode: "HYBRID",
      voiceRoomUrl: "https://meet.example.test/room",
    });
  });

  it("destroys inactive lobby rooms after their configured timeout", () => {
    const rooms = new RoomService();
    const created = rooms.create(5, "Host");
    const expiresAt = Date.parse(created.room.lastActivityAt) + 1_001;

    expect(rooms.expireIdle(expiresAt, 1_000, 10_000)).toEqual([created.room.code]);
    expect(() => rooms.publicView(created.room.code)).toThrow("Room not found");
  });
});
