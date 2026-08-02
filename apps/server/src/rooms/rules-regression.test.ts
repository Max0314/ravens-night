import { roleById } from "@ravens/game-engine";
import { expect, test } from "vitest";
import { RoomService } from "./service.js";

function controlledSixPlayerRoom(roleIds: string[], perceivedRoles: Record<number, string> = {}) {
  const setup = new RoomService();
  const { room, organizerToken } = setup.create(6, "六人局测试");
  const players = ["一", "二", "三", "四", "五", "六"].map((nickname) => setup.join(room.code, nickname, "PLAYER"));
  setup.startTutorial(room.code, organizerToken);
  const snapshot = setup.snapshot(room.code);
  snapshot.assignments = roleIds.map((roleId, index) => {
    const role = roleById(roleId);
    return {
      seat: index + 1,
      roleId,
      perceivedRoleId: perceivedRoles[index + 1] ?? roleId,
      roleType: role.type,
      alignment: role.type === "MINION" || role.type === "DEMON" ? "EVIL" : "GOOD",
    };
  });
  const service = new RoomService();
  service.restore([snapshot]);
  for (const player of players) service.completeTutorial(room.code, player.token);
  return { service, room, players };
}

function reachFirstDay(service: RoomService, code: string, players: Array<{ token: string }>) {
  for (const player of players) service.confirmRole(code, player.token);
  for (const player of players) {
    const action = service.privateView(code, player.token).action;
    if (action?.kind === "SELECT_ONE") service.submitAction(code, player.token, [action.legalSeats[0]!]);
    if (action?.kind === "SELECT_TWO") service.submitAction(code, player.token, action.legalSeats.slice(0, 2));
  }
  expect(service.publicView(code).game?.phase).toBe("DAY_DISCUSSION");
}

test("six-player evil players do not receive demon, minion, or bluff setup information", () => {
  const { service, room, players } = controlledSixPlayerRoom(["chef", "empath", "saint", "butler", "poisoner", "imp"]);
  const minionMessages = service.privateView(room.code, players[4]!.token).messages.join(" ");
  const demonMessages = service.privateView(room.code, players[5]!.token).messages.join(" ");
  expect(minionMessages).toContain("六人局特殊规则");
  expect(demonMessages).toContain("六人局特殊规则");
  expect(minionMessages).not.toContain("恶魔是");
  expect(demonMessages).not.toContain("你的爪牙");
  expect(demonMessages).not.toContain("三个安全伪装：");
});

test("an investigator may see the Recluse as an in-play Minion instead of being told Recluse", () => {
  const { service, room, players } = controlledSixPlayerRoom(["investigator", "recluse", "saint", "butler", "baron", "imp"]);
  reachFirstDay(service, room.code, players);
  const information = service.privateView(room.code, players[0]!.token).messages.find((message) => message.startsWith("调查员信息"));
  expect(information).toMatch(/调查员信息：.+（\d号）与.+（\d号）中，有一位是男爵。/);
  expect(information).not.toContain("有一位是隐士");
});

test("a Drunk's believed role stays secret until the final identity reveal", () => {
  const { service, room, players } = controlledSixPlayerRoom(
    ["drunk", "slayer", "saint", "butler", "poisoner", "imp"],
    { 1: "investigator" },
  );
  expect(service.privateView(room.code, players[0]!.token).role).toMatchObject({ roleId: "investigator", name: "调查员" });
  reachFirstDay(service, room.code, players);
  service.useDayAbility(room.code, players[1]!.token, 6);

  expect(service.publicView(room.code).game?.phase).toBe("GAME_OVER");
  expect(service.privateView(room.code, players[1]!.token).history).toContainEqual(expect.objectContaining({ kind: "ACTION", text: "你以猎魔人身份公开射击了六（6号）。" }));
  expect(service.privateView(room.code, players[0]!.token).role).toMatchObject({ roleId: "drunk", name: "酒鬼", perceivedAs: "调查员" });
  expect(service.publicView(room.code).game?.events.at(-1)?.message).toContain("酒鬼（本局以为自己是调查员）");
});

test("a drunk who believes they are an active role receives the same action UI and plausible information", () => {
  const { service, room, players } = controlledSixPlayerRoom(
    ["drunk", "chef", "empath", "saint", "poisoner", "imp"],
    { 1: "fortune_teller" },
  );
  for (const player of players) service.confirmRole(room.code, player.token);
  const action = service.privateView(room.code, players[0]!.token).action;
  expect(action).toMatchObject({ kind: "SELECT_TWO", minTargets: 2, maxTargets: 2 });
  service.submitAction(room.code, players[0]!.token, action!.legalSeats.slice(0, 2));
  service.submitAction(room.code, players[4]!.token, [1]);
  expect(service.privateView(room.code, players[0]!.token).messages.join(" ")).toContain("占卜结果");
});

test("private history keeps each player's submitted night targets and information by phase", () => {
  const { service, room, players } = controlledSixPlayerRoom(["fortune_teller", "monk", "butler", "saint", "poisoner", "imp"]);
  for (const player of players) service.confirmRole(room.code, player.token);

  service.submitAction(room.code, players[0]!.token, [2, 3]);
  expect(() => service.submitAction(room.code, players[0]!.token, [3, 4])).toThrow(/already submitted/i);
  service.submitAction(room.code, players[2]!.token, [2]);
  service.submitAction(room.code, players[4]!.token, [1]);

  const fortuneHistory = service.privateView(room.code, players[0]!.token).history;
  expect(fortuneHistory.map((entry) => entry.seq)).toEqual(fortuneHistory.map((_, index) => index + 1));
  expect(fortuneHistory).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: "FIRST_NIGHT", day: 0, kind: "ACTION", text: "你选择查验二（2号）与三（3号）。" }),
    expect.objectContaining({ phase: "FIRST_NIGHT", day: 0, kind: "INFORMATION", text: expect.stringMatching(/^占卜结果：[是否]。$/) }),
  ]));
  expect(fortuneHistory.map((entry) => entry.text).join(" ")).not.toMatch(/酒鬼|中毒|失能/);
  expect(service.privateView(room.code, players[2]!.token).history).toContainEqual(expect.objectContaining({ kind: "ACTION", text: "你选择二（2号）作为明天的主人。" }));
  expect(service.privateView(room.code, players[4]!.token).history).toContainEqual(expect.objectContaining({ kind: "ACTION", text: "你选择投毒一（1号）。" }));

  for (const player of players) service.readyToEndDay(room.code, player.token);
  expect(service.publicView(room.code).game?.phase).toBe("OTHER_NIGHT");
  service.submitAction(room.code, players[1]!.token, [1]);
  service.submitAction(room.code, players[5]!.token, [1]);

  expect(service.privateView(room.code, players[1]!.token).history).toContainEqual(expect.objectContaining({ phase: "OTHER_NIGHT", day: 1, kind: "ACTION", text: "你选择保护一（1号）免受恶魔攻击。" }));
  expect(service.privateView(room.code, players[5]!.token).history).toContainEqual(expect.objectContaining({ phase: "OTHER_NIGHT", day: 1, kind: "ACTION", text: "你选择袭击一（1号）。" }));
});

test("equal top vote totals produce no execution", () => {
  const { service, room, players } = controlledSixPlayerRoom(["chef", "empath", "investigator", "saint", "poisoner", "imp"]);
  reachFirstDay(service, room.code, players);
  service.nominate(room.code, players[0]!.token, 2);
  players.forEach((player, index) => service.vote(room.code, player.token, index < 3));
  service.nominate(room.code, players[2]!.token, 4);
  players.forEach((player, index) => service.vote(room.code, player.token, index >= 3));
  expect(service.publicView(room.code).game?.executionTied).toBe(true);
  for (const player of players) service.readyToEndDay(room.code, player.token);
  expect(service.publicView(room.code).game?.aliveCount).toBe(6);
  expect(service.publicView(room.code).game?.phase).toBe("OTHER_NIGHT");
});

test("poison disables soldier immunity", () => {
  const { service, room, players } = controlledSixPlayerRoom(["soldier", "monk", "chef", "saint", "poisoner", "imp"]);
  reachFirstDay(service, room.code, players);
  for (const player of players) service.readyToEndDay(room.code, player.token);
  service.submitAction(room.code, players[4]!.token, [1]);
  service.submitAction(room.code, players[1]!.token, [3]);
  service.submitAction(room.code, players[5]!.token, [1]);
  expect(service.publicView(room.code).game?.seats.find((seat) => seat.seat === 1)?.alive).toBe(false);
});

test("a healthy Soldier survives the Imp but a Drunk who believes they are the Soldier dies", () => {
  const healthy = controlledSixPlayerRoom(["soldier", "monk", "chef", "saint", "poisoner", "imp"]);
  reachFirstDay(healthy.service, healthy.room.code, healthy.players);
  for (const player of healthy.players) healthy.service.readyToEndDay(healthy.room.code, player.token);
  healthy.service.submitAction(healthy.room.code, healthy.players[4]!.token, [3]);
  healthy.service.submitAction(healthy.room.code, healthy.players[1]!.token, [3]);
  healthy.service.submitAction(healthy.room.code, healthy.players[5]!.token, [1]);
  expect(healthy.service.publicView(healthy.room.code).game?.seats.find((seat) => seat.seat === 1)?.alive).toBe(true);

  const drunk = controlledSixPlayerRoom(
    ["drunk", "monk", "chef", "saint", "poisoner", "imp"],
    { 1: "soldier" },
  );
  reachFirstDay(drunk.service, drunk.room.code, drunk.players);
  for (const player of drunk.players) drunk.service.readyToEndDay(drunk.room.code, player.token);
  drunk.service.submitAction(drunk.room.code, drunk.players[4]!.token, [3]);
  drunk.service.submitAction(drunk.room.code, drunk.players[1]!.token, [3]);
  drunk.service.submitAction(drunk.room.code, drunk.players[5]!.token, [1]);
  expect(drunk.service.publicView(drunk.room.code).game?.seats.find((seat) => seat.seat === 1)?.alive).toBe(false);
});

test("a ravenkeeper killed at night acts before dawn", () => {
  const { service, room, players } = controlledSixPlayerRoom(["ravenkeeper", "monk", "chef", "saint", "poisoner", "imp"]);
  reachFirstDay(service, room.code, players);
  for (const player of players) service.readyToEndDay(room.code, player.token);
  service.submitAction(room.code, players[4]!.token, [3]);
  service.submitAction(room.code, players[1]!.token, [3]);
  service.submitAction(room.code, players[5]!.token, [1]);
  const action = service.privateView(room.code, players[0]!.token).action;
  expect(action).toMatchObject({ kind: "SELECT_ONE", prompt: expect.stringContaining("夜里死去") });
  service.submitAction(room.code, players[0]!.token, [2]);
  expect(service.publicView(room.code).game?.phase).toBe("DAY_DISCUSSION");
  const history = service.privateView(room.code, players[0]!.token).history;
  expect(history).toContainEqual(expect.objectContaining({ kind: "ACTION", text: "你选择查验二（2号）的角色。" }));
  expect(history).toContainEqual(expect.objectContaining({ kind: "INFORMATION", text: expect.stringContaining("守鸦人信息") }));
});

test("a valid virgin trigger immediately executes the nominator and ends the day", () => {
  const { service, room, players } = controlledSixPlayerRoom(["virgin", "chef", "empath", "saint", "baron", "imp"]);
  reachFirstDay(service, room.code, players);
  service.nominate(room.code, players[1]!.token, 1);
  expect(service.publicView(room.code).game?.seats.find((seat) => seat.seat === 2)?.alive).toBe(false);
  expect(service.publicView(room.code).game?.phase).toBe("OTHER_NIGHT");
});

test("a Drunk who believes they are an Investigator does not trigger the Virgin", () => {
  const { service, room, players } = controlledSixPlayerRoom(
    ["virgin", "drunk", "chef", "saint", "baron", "imp"],
    { 2: "investigator" },
  );
  reachFirstDay(service, room.code, players);
  service.nominate(room.code, players[1]!.token, 1);
  expect(service.publicView(room.code).game?.seats.find((seat) => seat.seat === 2)?.alive).toBe(true);
  expect(service.publicView(room.code).game?.phase).toBe("VOTING");
  expect(service.publicView(room.code).game?.events.at(-1)?.message).toBe("二 提名了 一。");
});
