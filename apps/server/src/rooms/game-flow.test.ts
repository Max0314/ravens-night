import { expect, test } from "vitest";
import { RoomService } from "./service.js";

test("all players share tutorial state and receive only their own role", () => {
  const service = new RoomService();
  const { room, organizerToken } = service.create(5, "Max");
  const players = ["一", "二", "三", "四", "五"].map((nickname) => service.join(room.code, nickname, "PLAYER"));

  service.startTutorial(room.code, organizerToken);
  expect(service.publicView(room.code).state).toBe("TUTORIAL");
  for (const player of players) service.completeTutorial(room.code, player.token);
  expect(service.publicView(room.code).state).toBe("RUNNING");

  const first = service.privateView(room.code, players[0]!.token);
  const second = service.privateView(room.code, players[1]!.token);
  expect(first.role).toBeDefined();
  expect(second.role).toBeDefined();
  expect(JSON.stringify(first)).not.toContain(second.role!.roleId);
});

test("a room cannot start before every planned player has joined", () => {
  const service = new RoomService();
  const { room, organizerToken } = service.create(5, "Max");
  service.join(room.code, "一", "PLAYER");
  expect(() => service.startTutorial(room.code, organizerToken)).toThrow(/all players/i);
});

test("a player can leave the lobby and their seat is released", () => {
  const service = new RoomService();
  const { room } = service.create(5, "Max");
  const first = service.join(room.code, "一", "PLAYER");
  const second = service.join(room.code, "二", "PLAYER");
  const third = service.join(room.code, "三", "PLAYER");

  service.leave(room.code, second.token);

  expect(service.publicView(room.code).participants).toMatchObject([
    { nickname: "一", seat: 1 },
    { nickname: "三", seat: 2 },
  ]);
  expect(() => service.privateView(room.code, second.token)).toThrow(/authorization/i);
  expect(service.privateView(room.code, first.token).participant.seat).toBe(1);
  expect(service.privateView(room.code, third.token).participant.seat).toBe(2);
});

test("a player cannot leave after the game starts", () => {
  const { service, room, players } = runningRoom();
  expect(() => service.leave(room.code, players[0]!.token)).toThrow(/不能中途退出/);
});

function runningRoom() {
  const service = new RoomService();
  const { room, organizerToken } = service.create(5, "主持测试");
  const players = ["一", "二", "三", "四", "五"].map((nickname) => service.join(room.code, nickname, "PLAYER"));
  service.startTutorial(room.code, organizerToken);
  for (const player of players) service.completeTutorial(room.code, player.token);
  return { service, room, players };
}

test("role confirmations advance the shared game into the first night", () => {
  const { service, room, players } = runningRoom();
  expect(service.publicView(room.code).game?.phase).toBe("ROLE_REVEAL");

  for (const player of players) service.confirmRole(room.code, player.token);

  expect(["FIRST_NIGHT", "DAY_DISCUSSION"]).toContain(service.publicView(room.code).game?.phase);
  expect(service.privateView(room.code, players[0]!.token).messages.length).toBeGreaterThan(0);
});

test("night choices are private and resolve into day one", () => {
  const { service, room, players } = runningRoom();
  for (const player of players) service.confirmRole(room.code, player.token);

  for (const player of players) {
    const view = service.privateView(room.code, player.token);
    if (view.action?.kind === "SELECT_ONE") service.submitAction(room.code, player.token, [view.action.legalSeats[0]!]);
    if (view.action?.kind === "SELECT_TWO") service.submitAction(room.code, player.token, view.action.legalSeats.slice(0, 2));
  }

  expect(service.publicView(room.code).game?.phase).toBe("DAY_DISCUSSION");
  expect(JSON.stringify(service.publicView(room.code))).not.toContain("roleId");
});

test("a complete nomination vote returns to nominations and can end the day", () => {
  const { service, room, players } = runningRoom();
  for (const player of players) service.confirmRole(room.code, player.token);
  for (const player of players) {
    const view = service.privateView(room.code, player.token);
    if (view.action?.kind === "SELECT_ONE") service.submitAction(room.code, player.token, [view.action.legalSeats[0]!]);
    if (view.action?.kind === "SELECT_TWO") service.submitAction(room.code, player.token, view.action.legalSeats.slice(0, 2));
  }

  service.nominate(room.code, players[0]!.token, 2);
  expect(service.publicView(room.code).game?.phase).toBe("VOTING");
  players.forEach((player, index) => service.vote(room.code, player.token, index < 3));
  expect(service.publicView(room.code).game?.phase).toBe("NOMINATION");

  for (const player of players) service.readyToEndDay(room.code, player.token);
  expect(["OTHER_NIGHT", "GAME_OVER"]).toContain(service.publicView(room.code).game?.phase);
});

test("a read-only public display may join after the game starts", () => {
  const { service, room } = runningRoom();
  const display = service.join(room.code, "客厅大屏", "DISPLAY");
  expect(display.participant.mode).toBe("DISPLAY");
  expect(display.participant.seat).toBeUndefined();
});

test("a serialized room snapshot restores the same private game state", () => {
  const { service, room, players } = runningRoom();
  service.confirmRole(room.code, players[0]!.token);
  const snapshot = service.snapshot(room.code);
  const restored = new RoomService();
  restored.restore([snapshot]);
  expect(restored.publicView(room.code)).toEqual(service.publicView(room.code));
  expect(restored.privateView(room.code, players[0]!.token)).toEqual(service.privateView(room.code, players[0]!.token));
});

test("the organizer can reset a table without making seated players rejoin", () => {
  const service = new RoomService();
  const created = service.create(5, "创建者");
  const seated = ["一", "二", "三", "四", "五"].map((nickname) => service.join(created.room.code, nickname, "PLAYER"));
  service.startTutorial(created.room.code, created.organizerToken);
  for (const player of seated) service.completeTutorial(created.room.code, player.token);

  expect(() => service.reset(created.room.code, "wrong-token")).toThrow(/authorization/i);
  service.reset(created.room.code, created.organizerToken);
  const reset = service.publicView(created.room.code);
  expect(reset.state).toBe("LOBBY");
  expect(reset.participants).toHaveLength(5);
  expect(reset.game).toBeUndefined();

  service.startTutorial(created.room.code, created.organizerToken);
  expect(service.publicView(created.room.code).state).toBe("TUTORIAL");
});
