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

test("the next seated player becomes organizer when the organizer leaves", () => {
  const service = new RoomService();
  const { room } = service.create(5, "原房主");
  const owner = service.join(room.code, "原房主", "PLAYER");
  const successor = service.join(room.code, "接任房主", "PLAYER");
  for (const nickname of ["三号", "四号", "五号"]) service.join(room.code, nickname, "PLAYER");

  const result = service.leave(room.code, owner.token);

  expect(result).toEqual({ roomDestroyed: false, organizerChanged: true });
  expect(service.publicView(room.code)).toMatchObject({ organizerId: successor.participant.id, organizerName: "接任房主" });
  expect(service.privateView(room.code, successor.token).participant.seat).toBe(1);
  service.join(room.code, "补位玩家", "PLAYER");
  expect(() => service.startTutorial(room.code, successor.token)).not.toThrow();
});

test("a public display can reorder seats without transferring organizer authority", () => {
  const service = new RoomService();
  const { room } = service.create(5, "原房主");
  const owner = service.join(room.code, "原房主", "PLAYER");
  const second = service.join(room.code, "二号", "PLAYER");
  const third = service.join(room.code, "三号", "PLAYER");
  const fourth = service.join(room.code, "四号", "PLAYER");
  const fifth = service.join(room.code, "五号", "PLAYER");
  const display = service.join(room.code, "客厅大屏", "DISPLAY");

  const reordered = [third, owner, second, fourth, fifth].map((player) => player.participant.id);
  service.reorderSeats(room.code, display.token, reordered);

  const publicRoom = service.publicView(room.code);
  const playersBySeat = publicRoom.participants
    .filter((participant) => participant.mode === "PLAYER")
    .sort((left, right) => left.seat! - right.seat!);
  expect(playersBySeat.map((player) => `${player.seat}:${player.nickname}`)).toEqual(["1:三号", "2:原房主", "3:二号", "4:四号", "5:五号"]);
  expect(publicRoom).toMatchObject({ organizerId: owner.participant.id, organizerName: "原房主" });
  expect(service.privateView(room.code, owner.token).participant.seat).toBe(2);
  expect(() => service.reorderSeats(room.code, owner.token, reordered)).toThrow(/只有公共大屏/);
  expect(() => service.reorderSeats(room.code, display.token, reordered.slice(0, 4))).toThrow(/当前全部玩家/);
  expect(() => service.startTutorial(room.code, owner.token)).not.toThrow();
  expect(() => service.reorderSeats(room.code, display.token, reordered)).toThrow(/开局前/);
});

test("the room is destroyed when its last player leaves", () => {
  const service = new RoomService();
  const { room } = service.create(5, "房主");
  const owner = service.join(room.code, "房主", "PLAYER");
  service.join(room.code, "客厅大屏", "DISPLAY");

  expect(service.leave(room.code, owner.token)).toEqual({ roomDestroyed: true, organizerChanged: true });
  expect(() => service.publicView(room.code)).toThrow(/Room not found/i);
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

test("a nominator may cancel before voting starts and reuse the nomination", () => {
  const { service, room, players } = runningRoom();
  reachFirstDay(service, room.code, players);
  const nomineeIndex = players.findIndex((player, index) => index > 0 && service.privateView(room.code, player.token).role?.roleId !== "virgin");
  expect(nomineeIndex).toBeGreaterThan(0);

  service.nominate(room.code, players[0]!.token, nomineeIndex + 1);
  expect(service.publicView(room.code).game?.phase).toBe("VOTING");
  expect(() => service.cancelNomination(room.code, players[1]!.token)).toThrow(/Only the nominator/i);
  service.cancelNomination(room.code, players[0]!.token);
  expect(service.publicView(room.code).game?.phase).toBe("NOMINATION");
  expect(() => service.nominate(room.code, players[0]!.token, nomineeIndex + 1)).not.toThrow();
});

test("a voter may switch between raised and lowered until the final ballot arrives", () => {
  const { service, room, players } = runningRoom();
  reachFirstDay(service, room.code, players);
  const nomineeIndex = players.findIndex((player, index) => index > 0 && service.privateView(room.code, player.token).role?.roleId !== "virgin");
  service.nominate(room.code, players[0]!.token, nomineeIndex + 1);

  service.vote(room.code, players[0]!.token, true);
  expect(service.privateView(room.code, players[0]!.token)).toMatchObject({ voteRaised: true, action: { kind: "VOTE" } });
  expect(service.publicView(room.code).game?.nomination).toMatchObject({ votesReceived: 1, votesRaised: 1 });
  service.vote(room.code, players[0]!.token, false);
  expect(service.privateView(room.code, players[0]!.token)).toMatchObject({ voteRaised: false, action: { kind: "VOTE" } });
  expect(service.publicView(room.code).game?.nomination).toMatchObject({ votesReceived: 1, votesRaised: 0 });
  expect(() => service.cancelNomination(room.code, players[0]!.token)).toThrow(/after voting begins/i);

  for (const player of players.slice(1)) service.vote(room.code, player.token, false);
  expect(service.publicView(room.code).game?.phase).toBe("NOMINATION");
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

test("a legacy snapshot without structured private history keeps its existing clues", () => {
  const { service, room, players } = runningRoom();
  const snapshot = service.snapshot(room.code);
  const legacyGame = snapshot.game as unknown as { privateHistory?: unknown };
  delete legacyGame!.privateHistory;

  const restored = new RoomService();
  restored.restore([snapshot]);
  const view = restored.privateView(room.code, players[0]!.token);
  expect(view.history.map((entry) => entry.text)).toEqual(view.messages);
  expect(view.history[0]).toMatchObject({ phase: "ROLE_REVEAL", day: 0, kind: "IDENTITY" });
});

test("the organizer can reset a table without making seated players rejoin", () => {
  const service = new RoomService();
  const created = service.create(5, "创建者");
  const seated = ["一", "二", "三", "四", "五"].map((nickname) => service.join(created.room.code, nickname, "PLAYER"));
  service.startTutorial(created.room.code, created.organizerToken);
  const firstSetup = service.snapshot(created.room.code);
  for (const player of seated) service.completeTutorial(created.room.code, player.token);

  expect(() => service.reset(created.room.code, "wrong-token")).toThrow(/authorization/i);
  service.reset(created.room.code, created.organizerToken);
  const reset = service.publicView(created.room.code);
  expect(reset.state).toBe("LOBBY");
  expect(reset.participants).toHaveLength(5);
  expect(reset.game).toBeUndefined();

  service.startTutorial(created.room.code, created.organizerToken);
  expect(service.publicView(created.room.code).state).toBe("TUTORIAL");
  const secondSetup = service.snapshot(created.room.code);
  expect(secondSetup.gameNumber).toBe(firstSetup.gameNumber + 1);
  expect(secondSetup.assignments).not.toEqual(firstSetup.assignments);
});

function reachFirstDay(service: RoomService, code: string, players: Array<{ token: string }>) {
  for (const player of players) service.confirmRole(code, player.token);
  for (const player of players) {
    const action = service.privateView(code, player.token).action;
    if (action?.kind === "SELECT_ONE") service.submitAction(code, player.token, [action.legalSeats[0]!]);
    if (action?.kind === "SELECT_TWO") service.submitAction(code, player.token, action.legalSeats.slice(0, 2));
  }
  expect(service.publicView(code).game?.phase).toBe("DAY_DISCUSSION");
}
