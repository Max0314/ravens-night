import { expect, test } from "vitest";
import { RoomService } from "./service.js";
import { inviteWhisper, leaveWhisper, respondWhisper, revokeMembership, sendWhisper, socialView } from "./social.js";

function fixture() {
  const service = new RoomService({ presentation: false });
  const code = service.create(5, "甲").room.code;
  const players = ["甲", "乙", "丙", "丁", "戊"].map(name => service.join(code, name, "PLAYER"));
  return { service, code, room: service.find(code), players };
}

test("all players see pending/active seat relationships, never another pair's IDs or messages", () => {
  const { service, code, room, players: [a, b, c] } = fixture();
  inviteWhisper(room, a!.token, 2);
  const id = socialView(room, b!.token).social.invitations[0]!.id;
  expect(socialView(room, c!.token).social).toEqual({ invitations: [], relations: [{ fromSeat: 1, toSeat: 2, status: "PENDING" }] });
  expect(() => respondWhisper(room, c!.token, id, true)).toThrow("邀请已失效");
  respondWhisper(room, b!.token, id, true);
  sendWhisper(room, a!.token, id, "仅乙能读到这条线索");
  expect(socialView(room, c!.token).social).toEqual({ invitations: [], relations: [{ fromSeat: 1, toSeat: 2, status: "ACTIVE" }] });
  expect(socialView(room, b!.token).social.activeWhisper?.messages[0]?.text).toBe("仅乙能读到这条线索");
  expect(() => sendWhisper(room, c!.token, id, "伪造消息")).toThrow("耳语已经结束");
  expect(JSON.stringify(service.publicView(code))).not.toMatch(/仅乙能读到|relations|activeWhisper/);
  const display = service.join(code, "大屏", "DISPLAY");
  expect(() => socialView(room, display.token)).toThrow("Player authorization failed");
});

test("decline, withdraw, end and membership revocation remove public relationships", () => {
  const { room, players: [a, b, c] } = fixture();
  const third = () => socialView(room, c!.token).social.relations;
  inviteWhisper(room, a!.token, 2);
  let id = socialView(room, b!.token).social.invitations[0]!.id;
  respondWhisper(room, b!.token, id, false); expect(third()).toEqual([]);
  inviteWhisper(room, a!.token, 2); leaveWhisper(room, a!.token); expect(third()).toEqual([]);
  inviteWhisper(room, a!.token, 2); id = socialView(room, b!.token).social.invitations[0]!.id;
  respondWhisper(room, b!.token, id, true); leaveWhisper(room, b!.token); expect(third()).toEqual([]);
  inviteWhisper(room, a!.token, 2); revokeMembership(room, b!.participant.id); expect(third()).toEqual([]);
});

test("relationships follow member identity after reorder and disappear on next-game reset", () => {
  const { service, code, room, players } = fixture();
  const [a, b, c] = players;
  inviteWhisper(room, a!.token, 2);
  service.reorderSeats(code, a!.token, [c!, b!, a!, players[3]!, players[4]!].map(p => p.participant.id));
  expect(socialView(room, c!.token).social.relations).toEqual([{ fromSeat: 3, toSeat: 2, status: "PENDING" }]);
  room.state = "ABORTED";
  service.reset(code, a!.token);
  expect(socialView(room, c!.token).social).toEqual({ invitations: [], relations: [] });
});
