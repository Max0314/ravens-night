import { describe, expect, test } from "vitest";
import { roleById } from "@ravens/game-engine";
import { RoomService, type RoomRecord } from "./service.js";

function table(roleIds: string[], perceived: Record<number, string> = {}, cinematic = false) {
  let now = 1_800_000_000_000;
  const service = new RoomService({ presentation: cinematic, now: () => now });
  const { room, organizerToken } = service.create(roleIds.length, "规则反例");
  const players = roleIds.map((_, index) => service.join(room.code, `玩家${index + 1}`, "PLAYER"));
  for (const player of players) service.setReady(room.code, player.token, true);
  service.startTutorial(room.code, organizerToken);
  const snapshot = service.snapshot(room.code);
  snapshot.assignments = roleIds.map((roleId, index) => {
    const role = roleById(roleId);
    return { seat: index + 1, roleId, perceivedRoleId: perceived[index + 1] ?? roleId, roleType: role.type, alignment: ["MINION", "DEMON"].includes(role.type) ? "EVIL" : "GOOD" };
  });
  service.restore([snapshot]);
  for (const player of players) service.completeTutorial(room.code, player.token);
  const mutate = (change: (room: RoomRecord) => void) => { const state = service.snapshot(room.code); change(state); service.restore([state]); };
  const settle = (targets: Record<number, number[]> = {}) => {
    for (let pass = 0; pass < 20; pass += 1) {
      const phase = service.publicView(room.code).game!.phase;
      if (!["FIRST_NIGHT", "OTHER_NIGHT"].includes(phase)) return;
      let acted = false;
      for (const player of players) {
        const action = service.privateView(room.code, player.token).action;
        if (action?.kind === "SELECT_ONE" || action?.kind === "SELECT_TWO") {
          service.submitAction(room.code, player.token, targets[player.participant.seat!] ?? action.legalSeats.slice(0, action.maxTargets));
          acted = true;
        }
      }
      if (!acted) throw new Error(`Night is stuck in ${phase}`);
    }
    throw new Error("Night did not finish");
  };
  const day = (targets: Record<number, number[]> = {}) => { for (const player of players) service.confirmRole(room.code, player.token); settle(targets); };
  const endDay = () => { for (const player of players) if (service.privateView(room.code, player.token).canEndDay) service.readyToEndDay(room.code, player.token); };
  const nominateAndVote = (nominator: number, nominee: number, yes: number[]) => {
    service.nominate(room.code, players[nominator - 1]!.token, nominee);
    for (const player of players) if (service.privateView(room.code, player.token).canVote) service.vote(room.code, player.token, yes.includes(player.participant.seat!));
  };
  return { service, room, players, organizerToken, mutate, settle, day, endDay, nominateAndVote, advance: (ms: number) => { now += ms; service.advanceTime(now); }, now: () => now };
}

const base = ["slayer", "empath", "chef", "saint", "poisoner", "imp"];

describe("reviewed rule counterexamples", () => {
  test("a dead Slayer cannot kill the Demon through the API", () => {
    const t = table(base); t.day({ 5: [3] });
    t.mutate((room) => { room.game!.aliveSeats = [2, 3, 4, 5, 6]; });
    expect(() => t.service.useDayAbility(t.room.code, t.players[0]!.token, 6)).toThrow(/dead player/);
    expect(t.service.publicView(t.room.code).game!.seats.find((seat) => seat.seat === 6)!.alive).toBe(true);
  });

  test("a bluffing player gets the same public shot with no role leakage", () => {
    const t = table(base); t.day({ 5: [3] });
    t.service.useDayAbility(t.room.code, t.players[2]!.token, 6);
    const shot = t.service.publicView(t.room.code).game!.events.at(-1)!;
    expect(shot).toMatchObject({ kind: "SHOT", actorSeat: 3, targetSeat: 6, outcome: "NO_DEATH" });
    expect(JSON.stringify(shot)).not.toMatch(/chef|imp|poison|bluff|醉|毒|伪装/);
  });

  test("a poisoned Slayer spends the real once-per-game ability", () => {
    const t = table(base); t.day({ 5: [1] });
    t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
    expect(t.service.snapshot(t.room.code).game!.usedAbilitySeats).toContain(1);
    t.mutate((room) => { delete room.game!.poisonedSeat; room.game!.day += 1; });
    t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
    expect(t.service.publicView(t.room.code).game!.events.at(-1)!.outcome).toBe("NO_DEATH");
  });

  test("five living players before Demon death let Scarlet Woman inherit at four", () => {
    const t = table(["slayer", "chef", "saint", "scarlet_woman", "imp"]); t.day();
    t.service.useDayAbility(t.room.code, t.players[0]!.token, 5);
    expect(t.service.publicView(t.room.code).state).toBe("RUNNING");
    expect(t.service.snapshot(t.room.code).assignments[3]!.roleId).toBe("imp");
    expect(t.service.publicView(t.room.code).game!.aliveCount).toBe(4);
  });

  test("Scarlet Woman has priority over a lower-seat minion during Imp self-kill", () => {
    const t = table(["baron", "chef", "empath", "saint", "scarlet_woman", "imp"]); t.day(); t.endDay();
    t.settle({ 6: [6] });
    const state = t.service.snapshot(t.room.code);
    expect(state.assignments[0]!.roleId).toBe("baron");
    expect(state.assignments[4]!.roleId).toBe("imp");
    expect(state.game!.phase).toBe("DAY_DISCUSSION");
  });

  test("poison stops Scarlet Woman's automatic succession when Demon is shot", () => {
    const t = table(["slayer", "chef", "empath", "poisoner", "scarlet_woman", "imp"]); t.day({ 4: [5] });
    t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
    expect(t.service.publicView(t.room.code).game!.winner).toBe("GOOD");
  });

  test("dead Butler uses a ghost vote independently of their former master", () => {
    const t = table(["butler", "chef", "empath", "saint", "baron", "imp"]); t.day({ 1: [2] });
    t.mutate((room) => { room.game!.aliveSeats = [2, 3, 4, 5, 6]; });
    t.nominateAndVote(2, 6, [1, 3, 4]);
    expect(t.service.publicView(t.room.code).game!.onBlock).toEqual({ seat: 6, votes: 3 });
    expect(t.service.snapshot(t.room.code).game!.ghostVoteSeats).not.toContain(1);
  });

  test("spent dead voters do not block a ballot", () => {
    const t = table(base); t.day({ 5: [3] });
    t.mutate((room) => { room.game!.aliveSeats = [2, 3, 4, 5, 6]; room.game!.ghostVoteSeats = [2, 3, 4, 5, 6]; });
    t.nominateAndVote(2, 6, [2, 3, 4]);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("NOMINATION");
    expect(t.service.publicView(t.room.code).game!.onBlock?.votes).toBe(3);
  });

  test("Librarian sees the Drunk as an Outsider even when it is the only Outsider", () => {
    const t = table(["librarian", "drunk", "chef", "empath", "baron", "imp"], { 2: "washerwoman" }); t.day();
    const clue = t.service.privateView(t.room.code, t.players[0]!.token).messages.find((message) => message.startsWith("图书管理员信息"));
    expect(clue).toContain("有一位是酒鬼");
    expect(clue).toContain("玩家2（2号）");
  });

  test("poisoned Spy cannot register as a Townsfolk to Washerwoman", () => {
    const t = table(["washerwoman", "saint", "drunk", "recluse", "spy", "poisoner", "imp"], { 3: "chef" });
    t.day({ 6: [5] });
    const clue = t.service.privateView(t.room.code, t.players[0]!.token).messages.find((message) => message.startsWith("洗衣妇信息"))!;
    expect(clue).toContain("有一位是洗衣妇");
    expect(clue).toContain("玩家1（1号）");
    expect(clue).not.toContain("有一位是间谍");
  });

  test("poisoned Spy cannot trigger Virgin as a Townsfolk", () => {
    const t = table(["virgin", "spy", "chef", "empath", "poisoner", "imp"]); t.day({ 5: [2] });
    t.service.nominate(t.room.code, t.players[1]!.token, 1);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("VOTING");
  });

  test("Virgin's first Outsider nomination consumes the ability", () => {
    const t = table(["virgin", "saint", "chef", "empath", "baron", "imp"]); t.day();
    t.nominateAndVote(2, 1, []); t.endDay(); t.settle({ 6: [5] });
    t.service.nominate(t.room.code, t.players[2]!.token, 1);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("VOTING");
  });

  test("poisoned Recluse cannot register as a Demon to Slayer", () => {
    const t = table(["slayer", "recluse", "chef", "empath", "poisoner", "imp"]); t.day({ 5: [2] });
    t.service.useDayAbility(t.room.code, t.players[0]!.token, 2);
    expect(t.service.publicView(t.room.code).game!.events.at(-1)!.outcome).toBe("NO_DEATH");
  });

  test("Poisoner dying at night immediately restores poisoned information abilities", () => {
    const t = table(["empath", "chef", "soldier", "saint", "poisoner", "imp"]); t.day({ 5: [1] }); t.endDay();
    t.settle({ 5: [1], 6: [5] });
    expect(t.service.snapshot(t.room.code).game!.poisonedSeat).toBeUndefined();
    expect(t.service.privateView(t.room.code, t.players[0]!.token).messages.at(-1)).toContain("有 1 位邪恶");
  });

  test("a Poisoner becoming Imp immediately ends their poison", () => {
    const t = table(base); t.day({ 5: [3] }); t.endDay(); t.settle({ 5: [1], 6: [6] });
    expect(t.service.snapshot(t.room.code).assignments[4]!.roleId).toBe("imp");
    expect(t.service.snapshot(t.room.code).game!.poisonedSeat).toBeUndefined();
  });

  test("Empath reads nearest living neighbors after the Imp kill", () => {
    const t = table(["chef", "empath", "soldier", "saint", "baron", "imp"]); t.day();
    expect(t.service.privateView(t.room.code, t.players[1]!.token).messages.at(-1)).toContain("有 0 位邪恶");
    t.endDay(); t.settle({ 6: [1] });
    expect(t.service.privateView(t.room.code, t.players[1]!.token).messages.at(-1)).toContain("有 1 位邪恶");
  });

  test("an information role killed before its wake gets no new information", () => {
    const t = table(["fortune_teller", "chef", "empath", "saint", "baron", "imp"]); t.day({ 1: [2, 3] });
    const before = t.service.privateView(t.room.code, t.players[0]!.token).history.filter((entry) => entry.kind === "INFORMATION").length;
    t.endDay();
    t.service.submitAction(t.room.code, t.players[5]!.token, [1]);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("DAY_DISCUSSION");
    expect(t.service.privateView(t.room.code, t.players[0]!.token).history.filter((entry) => entry.kind === "INFORMATION")).toHaveLength(before);
  });

  test("Ravenkeeper resolves privately before death is revealed at dawn", () => {
    const t = table(["ravenkeeper", "empath", "chef", "saint", "baron", "imp"]); t.day(); t.endDay();
    const previousDawns = t.service.publicView(t.room.code).game!.events.filter((event) => event.kind === "DAWN").length;
    t.service.submitAction(t.room.code, t.players[5]!.token, [1]);
    expect(t.service.publicView(t.room.code).game!.seats[0]!.alive).toBe(true);
    expect(t.service.publicView(t.room.code).game!.events.filter((event) => event.kind === "DAWN")).toHaveLength(previousDawns);
    expect(t.service.privateView(t.room.code, t.players[0]!.token).action?.prompt).toContain("夜里死去");
    t.service.submitAction(t.room.code, t.players[0]!.token, [3]);
    const dawn = t.service.publicView(t.room.code).game!.events.filter((event) => event.kind === "DAWN").at(-1)!;
    expect(dawn.seats).toEqual([1]);
    expect(t.service.privateView(t.room.code, t.players[0]!.token).messages.at(-1)).toContain("厨师");
  });

  test("all choose-player abilities accept dead targets and selecting a corpse creates no new death", () => {
    const t = table(["fortune_teller", "monk", "chef", "saint", "poisoner", "imp"]); t.day({ 1: [2, 3], 5: [3] });
    t.mutate((room) => { room.game!.aliveSeats = [1, 2, 4, 5, 6]; }); t.endDay();
    for (const seat of [1, 2, 5, 6]) expect(t.service.privateView(t.room.code, t.players[seat - 1]!.token).action?.legalSeats).toContain(3);
    t.settle({ 1: [3, 4], 2: [3], 5: [3], 6: [3] });
    expect(t.service.publicView(t.room.code).game!.events.filter((event) => event.kind === "DAWN").at(-1)).toMatchObject({ outcome: "NO_DEATH", seats: [] });
  });

  test("a player may nominate themself or a dead player but a dead player cannot nominate", () => {
    const t = table(base); t.day({ 5: [3] });
    t.mutate((room) => { room.game!.aliveSeats = [1, 2, 4, 5, 6]; });
    expect(() => t.service.nominate(t.room.code, t.players[2]!.token, 1)).toThrow(/dead player/);
    t.nominateAndVote(1, 1, []);
    t.nominateAndVote(2, 3, []);
    expect(t.service.snapshot(t.room.code).game!.nominatedSeats).toEqual([1, 3]);
  });

  test("executing a dead Saint neither triggers Saint nor supplies Undertaker information", () => {
    const t = table(["undertaker", "chef", "empath", "saint", "baron", "imp"]); t.day();
    t.mutate((room) => { room.game!.aliveSeats = [1, 2, 3, 5, 6]; });
    t.nominateAndVote(1, 4, [1, 2, 3]); t.endDay(); t.settle({ 6: [4] });
    expect(t.service.publicView(t.room.code).state).toBe("RUNNING");
    expect(t.service.privateView(t.room.code, t.players[0]!.token).messages.join(" ")).not.toContain("送葬信息");
  });

  test("poisoned private effects and adjudication are visible only to the entitled participant", () => {
    const t = table(base); t.day({ 5: [1] });
    const own = t.service.privateView(t.room.code, t.players[4]!.token);
    expect(own.history).toContainEqual(expect.objectContaining({ effect: "POISON", targetSeats: [1], kind: "ACTION" }));
    expect(t.service.privateView(t.room.code, t.players[0]!.token).history.some((entry) => entry.effect === "POISON")).toBe(false);
    expect(t.service.privateView(t.room.code, t.players[0]!.token).storytellerDecisions).toBeUndefined();
    expect(JSON.stringify(t.service.publicView(t.room.code))).not.toMatch(/poisonedSeat|redHerring|decisions|targetSeats|POISON/);
  });
});

describe("lifecycle, recovery and public choreography", () => {
  test("lobby readiness is explicit, duplicate start cannot redeal, running reset is rejected", () => {
    const service = new RoomService(); const { room, organizerToken } = service.create(5, "host");
    const players = Array.from({ length: 5 }, (_, index) => service.join(room.code, String(index), "PLAYER"));
    expect(() => service.startTutorial(room.code, organizerToken)).toThrow(/准备/);
    for (const player of players) service.setReady(room.code, player.token, true);
    service.startTutorial(room.code, organizerToken);
    const assignments = service.snapshot(room.code).assignments;
    expect(() => service.startTutorial(room.code, organizerToken)).toThrow(/Only a lobby/);
    expect(service.snapshot(room.code).assignments).toEqual(assignments);
    for (const player of players) service.completeTutorial(room.code, player.token);
    expect(() => service.reset(room.code, organizerToken)).toThrow(/进行中/);
  });

  test("join rejects unexpected participant modes at runtime", () => {
    const t = table(base);
    expect(() => t.service.join(t.room.code, "intruder", "ADMIN" as never)).toThrow(/Unknown participant mode/);
  });

  test("a real shared cinematic has stable identity, lead time, a command lock and a queued finale", () => {
    const t = table(base, {}, true);
    t.mutate((room) => { room.game!.phase = "DAY_DISCUSSION"; room.game!.day = 1; });
    t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
    const game = t.service.publicView(t.room.code).game!;
    const shot = game.events.find((event) => event.kind === "SHOT")!;
    const finale = game.events.find((event) => event.kind === "GAME_OVER")!;
    expect(shot).toMatchObject({ durationMs: 4500, startsAt: t.now() + 1500, outcome: "DEATH" });
    expect(finale.startsAt).toBe(shot.startsAt + shot.durationMs);
    expect(game.gameId).toContain("game-1");
    expect(t.service.privateView(t.room.code, t.players[1]!.token).game!.events).toEqual(game.events);
    expect(() => t.service.nominate(t.room.code, t.players[1]!.token, 3)).toThrow(/演出/);
    expect(t.service.privateView(t.room.code, t.players[0]!.token).storytellerDecisions).toBeDefined();
  });

  test("missed ballots time out to abstention and do not consume ghost votes", () => {
    const t = table(base); t.day({ 5: [3] });
    t.mutate((room) => { room.game!.aliveSeats = [1, 2, 4, 5, 6]; });
    t.service.nominate(t.room.code, t.players[0]!.token, 6);
    for (const seat of [1, 2, 4]) t.service.vote(t.room.code, t.players[seat - 1]!.token, true);
    t.advance(60_000);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("NOMINATION");
    expect(t.service.snapshot(t.room.code).game!.ghostVoteSeats).toContain(3);
    expect(t.service.publicView(t.room.code).game!.onBlock).toEqual({ seat: 6, votes: 3 });
  });

  test("night timeout pauses without choosing a private target or identifying the waiting role", () => {
    const t = table(base); for (const player of t.players) t.service.confirmRole(t.room.code, player.token);
    t.advance(180_000);
    const game = t.service.publicView(t.room.code).game!;
    expect(game.phase).toBe("FIRST_NIGHT"); expect(game.pauseReason).toBeDefined();
    expect(game.pauseReason).not.toMatch(/投毒者|玩家5|5号/);
    expect(t.service.snapshot(t.room.code).game!.nightSubmissions).toEqual({});
    t.service.submitAction(t.room.code, t.players[4]!.token, [3]);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("DAY_DISCUSSION");
  });

  test("presence becomes offline and a heartbeat restores it without losing the seat", () => {
    const t = table(base); t.advance(30_001);
    expect(t.service.publicView(t.room.code).participants[0]!.connected).toBe(false);
    expect(t.service.pulse(t.room.code, t.players[0]!.token)).toBe(true);
    expect(t.service.publicView(t.room.code).participants[0]).toMatchObject({ connected: true, seat: 1 });
  });

  test("rotating a participant credential revokes the old credential", () => {
    const t = table(base);
    const recovered = t.service.rotateParticipantToken(t.room.code, t.players[0]!.token);
    expect(() => t.service.privateView(t.room.code, t.players[0]!.token)).toThrow(/authorization/);
    expect(t.service.privateView(t.room.code, recovered.token).participant.seat).toBe(1);
  });

  test("leaving a finished game preserves all original seats and the game history", () => {
    const t = table(base); t.day({ 5: [3] }); t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
    const before = t.service.publicView(t.room.code).game!;
    t.service.leave(t.room.code, t.players[1]!.token);
    const after = t.service.publicView(t.room.code).game!;
    expect(after.seats.map((seat) => [seat.seat, seat.nickname])).toEqual(before.seats.map((seat) => [seat.seat, seat.nickname]));
    expect(after.events).toEqual(before.events);
    expect(() => t.service.privateView(t.room.code, t.players[1]!.token)).toThrow(/authorization/);
  });

  test("public event replay retains more than the former eight-event window", () => {
    const t = table(base); t.day({ 5: [3] });
    for (const seat of [2, 3, 4, 5, 6]) t.service.useDayAbility(t.room.code, t.players[seat - 1]!.token, seat);
    t.nominateAndVote(1, 1, []); t.nominateAndVote(2, 2, []);
    expect(t.service.publicView(t.room.code).game!.events.length).toBeGreaterThan(8);
    expect(t.service.publicView(t.room.code).game!.events[0]!.seq).toBe(1);
  });
});


describe("information privacy and recovery invariants", () => {
  test("public choreography identifiers never reveal private setup or storyteller seeds", () => {
    const t = table(base); t.day({ 5: [3] });
    const snapshot = t.service.snapshot(t.room.code);
    const publicText = JSON.stringify(t.service.publicView(t.room.code));
    expect(publicText).not.toContain(snapshot.id);
    expect(publicText).not.toContain(snapshot.game!.storytellerSeed);
    expect(snapshot.game!.storytellerSeed).not.toBe(snapshot.game!.gameId);
  });

  test("healthy Spy sees reminder state as well as roles", () => {
    const t = table(["washerwoman", "drunk", "empath", "saint", "spy", "poisoner", "imp"], { 2: "chef" });
    t.day({ 6: [3] });
    const grimoire = t.service.privateView(t.room.code, t.players[4]!.token).messages.find((message) => message.startsWith("魔典："))!;
    expect(grimoire).toContain("中毒");
    expect(grimoire).toContain("红鲱鱼");
    expect(grimoire).toContain("酒鬼自认厨师");
    expect(grimoire).toContain("洗衣妇线索目标");
  });

  test("a restored Ravenkeeper interrupt continues once without prematurely publishing the death", () => {
    const t = table(["ravenkeeper", "chef", "empath", "saint", "baron", "imp"]); t.day(); t.endDay();
    t.service.submitAction(t.room.code, t.players[5]!.token, [1]);
    t.mutate((room) => { delete room.game!.nightOrder; delete room.game!.nightStep; });
    expect(t.service.publicView(t.room.code).game!.seats[0]!.alive).toBe(true);
    t.service.submitAction(t.room.code, t.players[0]!.token, [2]);
    expect(t.service.publicView(t.room.code).game!.phase).toBe("DAY_DISCUSSION");
    expect(t.service.publicView(t.room.code).game!.events.filter((event) => event.kind === "DAWN")).toHaveLength(2);
  });

  test("late votes cannot race the authoritative deadline even before a scheduler tick", () => {
    let now = 1_800_000_000_000;
    const service = new RoomService({ now: () => now, presentation: false });
    const { room, organizerToken } = service.create(5, "host");
    const players = Array.from({ length: 5 }, (_, index) => service.join(room.code, String(index), "PLAYER"));
    for (const player of players) service.setReady(room.code, player.token, true);
    service.startTutorial(room.code, organizerToken);
    for (const player of players) service.completeTutorial(room.code, player.token);
    const snapshot = service.snapshot(room.code);
    snapshot.game!.phase = "VOTING";
    snapshot.game!.nomination = { nominatorSeat: 1, nomineeSeat: 2 };
    snapshot.game!.phaseDeadlineAt = now + 100;
    service.restore([snapshot]);
    now += 101;
    expect(() => service.vote(room.code, players[0]!.token, true)).toThrow(/deadline/);
    service.advanceTime(now);
    expect(service.publicView(room.code).game!.phase).toBe("NOMINATION");
  });
});


test("resume cannot be used to repeatedly extend an active voting deadline", () => {
  const t = table(base); t.day({ 5: [3] });
  t.service.nominate(t.room.code, t.players[0]!.token, 6);
  const deadline = t.service.publicView(t.room.code).game!.phaseDeadlineAt;
  expect(() => t.service.resume(t.room.code, t.players[0]!.token)).toThrow(/没有暂停/);
  expect(t.service.publicView(t.room.code).game!.phaseDeadlineAt).toBe(deadline);
  t.advance(60_000);
  expect(t.service.publicView(t.room.code).game!.phase).toBe("NOMINATION");
});
