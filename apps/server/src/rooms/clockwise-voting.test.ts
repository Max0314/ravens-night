import { expect, test } from "vitest";
import { roleById } from "@ravens/game-engine";
import { RoomService, type RoomRecord } from "./service.js";
import { initializePresentation } from "./presentation.js";

function timedTable(roleIds = ["chef", "empath", "soldier", "saint", "baron", "imp"]) {
  let now = 1_800_000_000_000;
  const service = new RoomService({ presentation: true, now: () => now });
  const { room, organizerToken } = service.create(roleIds.length, "顺时针测试");
  const players = roleIds.map((_, index) => service.join(room.code, `玩家${index + 1}`, "PLAYER"));
  for (const player of players) service.setReady(room.code, player.token, true);
  service.startTutorial(room.code, players[0]!.token);
  const snapshot = service.snapshot(room.code);
  snapshot.assignments = roleIds.map((roleId, index) => ({ seat: index + 1, roleId, perceivedRoleId: roleId, roleType: roleById(roleId).type, alignment: ["MINION", "DEMON"].includes(roleById(roleId).type) ? "EVIL" : "GOOD" }));
  service.restore([snapshot]);
  for (const player of players) service.completeTutorial(room.code, player.token);
  const mutate = (change: (state: RoomRecord) => void) => { const state = service.snapshot(room.code); change(state); delete state.game!.publicProjection; delete state.game!.pendingPublications; initializePresentation(state.game!); service.restore([state]); };
  mutate((state) => { state.game!.presentationVersion=1;state.game!.startInfo={mode:"LEGACY",stage:"COMPLETE",entries:{}};state.game!.phase = "DAY_DISCUSSION"; state.game!.day = 1; });
  const game = () => service.publicView(room.code).game!;
  const advance = (milliseconds: number, tick = true) => { now += milliseconds; if (tick) service.advanceTime(now); };
  const nominate = (actor: number, nominee: number) => { service.nominate(room.code, players[actor - 1]!.token, nominee); advance(2500); };
  const vote = (seat: number, raised: boolean) => service.vote(room.code, players[seat - 1]!.token, raised);
  const finish = () => { advance(game().nomination!.voteEndsAt! - now); advance(1500); };
  return { service, room, players, mutate, game, advance, nominate, vote, finish, now: () => now };
}

test("production defense lasts twenty seconds and all submitted ballots still count clockwise at 1.5 seconds per seat", () => {
  const t = timedTable(); t.nominate(1, 3);
  const nomination = t.game().nomination!;
  expect(nomination.voterOrder).toEqual([4, 5, 6, 1, 2, 3]);
  expect(nomination.defenseUntil).toBe(t.now() + 20_000);
  for (let seat = 1; seat <= 6; seat++) t.vote(seat, true);
  expect(t.game().phase).toBe("VOTING");
  expect(t.game().nomination!.countedSeats).toEqual([]);
  t.advance(20_000);
  expect(t.game().nomination!.currentVoterSeat).toBe(4);
  t.advance(1499); expect(t.game().nomination!.countedSeats).toEqual([]);
  t.advance(1); expect(t.game().nomination!.countedSeats).toEqual([4]);
  expect(t.game().nomination!.currentVoterSeat).toBe(5);
  expect(t.game().nomination!.votesRaised).toBe(1);
  expect(() => t.vote(4, false)).toThrow(/本席已计票/);
  t.finish();
  expect(t.game().phase).toBe("NOMINATION");
  expect(t.game().onBlock).toEqual({ seat: 3, votes: 6 });
});

test("the final frozen ghost vote is public before VOTE_RESULT starts",()=>{
  const t=timedTable();t.mutate(room=>{room.game!.aliveSeats=[1,2,3,4,5];});t.nominate(1,6);t.vote(6,true);
  const end=t.game().nomination!.voteEndsAt!;t.advance(end-t.now());
  expect(t.game().nomination!.countedSeats).toHaveLength(6);expect(t.game().nomination!.countedVotes?.[6]).toBe(true);expect(t.game().seats.find(p=>p.seat===6)!.ghostVoteAvailable).toBe(false);
});
test("the final sunset confirmation is immediately visible before night publication",()=>{
  const t=timedTable();for(const player of t.players)t.service.readyToEndDay(t.room.code,player.token,true);
  expect(t.game().readyCount).toBe(6);expect(t.game().phase).toBe("DAY_DISCUSSION");const night=t.service.snapshot(t.room.code).game!.events.find(e=>e.kind==="NIGHT_FALLS")!;t.advance(night.startsAt-t.now());expect(t.game().readyCount).toBe(0);
});

test("only the nominee can end defense early, including a nominated dead player", () => {
  const t = timedTable();
  t.mutate((state) => { state.game!.aliveSeats = [1, 2, 4, 5, 6]; });
  t.nominate(1, 3);
  expect(() => t.service.finishDefense(t.room.code, t.players[0]!.token)).toThrow(/只有被提名者/);
  expect(t.service.privateView(t.room.code, t.players[2]!.token).canFinishDefense).toBe(true);
  t.service.finishDefense(t.room.code, t.players[2]!.token);
  expect(t.game().nomination!.voteStartsAt).toBe(t.now());
  expect(t.game().nomination!.voteEndsAt).toBe(t.now() + 9000);
  expect(t.game().nomination!.currentVoterSeat).toBe(4);
  expect(t.service.privateView(t.room.code, t.players[2]!.token).canFinishDefense).toBe(false);
});

test("dead players with no ghost vote are skipped; a ghost vote is consumed exactly when counted", () => {
  const t = timedTable();
  t.mutate((state) => { state.game!.aliveSeats = [1, 3, 5, 6]; state.game!.ghostVoteSeats = [1, 2, 3, 5, 6]; });
  t.nominate(1, 3);
  expect(t.game().nomination!.voterOrder).toEqual([5, 6, 1, 2, 3]);
  expect(t.game().nomination!.votersRequired).toBe(5);
  expect(t.service.privateView(t.room.code, t.players[3]!.token).canVote).toBe(false);
  t.vote(2, true);
  t.advance(20_000 + 4500);
  expect(t.game().seats[1]!.ghostVoteAvailable).toBe(true);
  t.advance(1500);
  expect(t.game().seats[1]!.ghostVoteAvailable).toBe(false);
  expect(t.game().nomination!.countedVotes![2]).toBe(true);
  t.finish();
  expect(t.game().events.at(-1)!).toMatchObject({ kind: "VOTE_RESULT", votes: 1, seats: [2] });
});

test("Butler's counted vote is frozen even if their later-counted master lowers their hand", () => {
  const t = timedTable(["butler", "chef", "empath", "saint", "baron", "imp"]);
  t.mutate((state) => { state.game!.butlerMasterSeat = 4; });
  t.nominate(2, 6); t.vote(1, true); t.vote(4, true);
  t.advance(21_500);
  expect(t.game().nomination!.countedVotes![1]).toBe(true);
  t.vote(4, false);
  expect(t.game().nomination!.countedVotes![1]).toBe(true);
  t.finish();
  expect(t.game().events.at(-1)!).toMatchObject({ kind: "VOTE_RESULT", votes: 1, seats: [1] });
});

test("a Butler hand counts even without the master; only its owner receives a reminder", () => {
  const t = timedTable(["butler", "chef", "empath", "saint", "baron", "imp"]);
  t.mutate((state) => { state.game!.butlerMasterSeat = 4; });
  t.nominate(2, 6); t.vote(1, true);
  t.advance(21_500);
  expect(t.game().nomination!.countedVotes![1]).toBe(true);
  expect(t.service.privateView(t.room.code, t.players[0]!.token).history.at(-1)?.text).toContain("主人未举手");
  t.vote(4, true); t.finish();
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 2, seats: [1, 4] });
});

test("a master whose ghost vote was already counted still authorizes the living Butler's later vote", () => {
  const t = timedTable(["chef", "empath", "butler", "saint", "baron", "imp"]);
  t.mutate((state) => { state.game!.aliveSeats = [2, 3, 4, 5, 6]; state.game!.butlerMasterSeat = 1; });
  t.nominate(2, 6); t.vote(1, true); t.vote(3, true);
  t.advance(21_500);
  expect(t.game().seats[0]!.ghostVoteAvailable).toBe(false);
  t.advance(3000);
  expect(t.game().nomination!.countedVotes![3]).toBe(true);
  t.finish();
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 2, seats: [1, 3] });
});

test("a dead Butler spends their ghost vote without their former master's hand", () => {
  const t = timedTable(["butler", "chef", "empath", "saint", "baron", "imp"]);
  t.mutate((state) => { state.game!.aliveSeats = [2, 3, 4, 5, 6]; state.game!.butlerMasterSeat = 4; });
  t.nominate(2, 6); t.vote(1, true); t.finish();
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 1, seats: [1] });
  expect(t.game().seats[0]!.ghostVoteAvailable).toBe(false);
});

test("equal highest timed vote totals clear the execution block through a tie", () => {
  const t = timedTable(); t.nominate(1, 6);
  for (const seat of [1, 2, 3]) t.vote(seat, true);
  t.finish(); expect(t.game().onBlock).toEqual({ seat: 6, votes: 3 });
  t.advance(4000); t.nominate(2, 4);
  for (const seat of [1, 2, 5]) t.vote(seat, true);
  t.finish();
  expect(t.game().executionTied).toBe(true);
  expect(t.game().events.at(-1)!).toMatchObject({ outcome: "TIED", votes: 3 });
  t.advance(4000);
  for (const player of t.players) t.service.readyToEndDay(t.room.code, player.token);
  t.advance(4300);
  expect(t.game().aliveCount).toBe(6);
  expect(t.game().events.filter((event) => event.kind === "EXECUTION").at(-1)!.outcome).toBe("NONE");
});

test("daytime death keeps earlier below-majority votes as the high-water mark; only a higher later ballot breaks the tie", () => {
  const t = timedTable(["slayer", "chef", "empath", "soldier", "undertaker", "saint", "recluse", "scarlet_woman", "imp"]);
  t.nominate(2, 3);
  for (const seat of [1, 2, 3, 4]) t.vote(seat, true);
  t.finish();
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 4, threshold: 5, outcome: "NONE" });
  expect(t.game().onBlock).toBeUndefined();
  t.advance(4000); t.service.useDayAbility(t.room.code, t.players[0]!.token, 9); t.advance(8000);
  expect(t.game().aliveCount).toBe(8);
  expect(t.game().winner).toBeUndefined();
  t.nominate(3, 4);
  for (const seat of [1, 2, 3, 4]) t.vote(seat, true);
  t.advance(t.game().nomination!.voteEndsAt! - t.now());
  expect(t.service.snapshot(t.room.code).game!.executionTied).toBe(true);
  expect(t.game().executionTied).toBe(false);
  expect(t.game().onBlock).toBeUndefined();
  t.advance(1499); expect(t.game().executionTied).toBe(false);
  t.advance(1);
  expect(t.game().executionTied).toBe(true);
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 4, threshold: 4, outcome: "TIED" });
  t.advance(4000); t.nominate(4, 5);
  for (const seat of [1, 2]) t.vote(seat, true);
  t.finish();
  expect(t.game().executionTied).toBe(true);
  expect(t.game().onBlock?.votes).toBe(4);
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 2, outcome: "NONE" });
  t.advance(4000); t.nominate(5, 6);
  for (const seat of [1, 2, 3, 4, 5]) t.vote(seat, true);
  t.finish();
  expect(t.game().executionTied).toBe(false);
  expect(t.game().onBlock).toEqual({ seat: 6, votes: 5 });
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 5, outcome: "ON_BLOCK" });
  t.advance(4000); t.nominate(6, 7);
  for (const seat of [1, 2, 3, 4]) t.vote(seat, true);
  t.finish();
  expect(t.game().onBlock).toEqual({ seat: 6, votes: 5 });
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 4, outcome: "NONE" });
});

test("restored legacy block still sets the comparison floor when vote events have no structured tally", () => {
  const t = timedTable();
  t.mutate(room => { room.game!.onBlock = { seat: 6, votes: 4 }; room.game!.executionTied = true; });
  t.nominate(1, 4);
  for (const seat of [1, 2, 3]) t.vote(seat, true);
  t.finish();
  expect(t.game().onBlock).toEqual({ seat: 6, votes: 4 });
  expect(t.game().executionTied).toBe(true);
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 3, outcome: "NONE" });
});

test("a scheduler delay cannot let a master's hand change rewrite an earlier Butler count", () => {
  const t = timedTable(["butler", "chef", "empath", "saint", "baron", "imp"]);
  t.mutate((state) => { state.game!.butlerMasterSeat = 4; });
  t.nominate(2, 6); t.vote(1, true); t.vote(4, true);
  t.advance(21_600, false);
  expect(() => t.vote(1, false)).toThrow(/本席已计票/);
  t.vote(4, false);
  expect(t.game().nomination!.countedVotes![1]).toBe(true);
  t.finish(); expect(t.game().events.at(-1)!.seats).toEqual([1]);
});

test("an interrupted count resumes from the persisted slot without re-counting a ghost", () => {
  const t = timedTable();
  t.mutate((state) => { state.game!.aliveSeats = [2, 3, 4, 5, 6]; });
  t.nominate(2, 6); t.vote(1, true); t.vote(3, true);
  t.advance(23_000);
  const snapshot = t.service.snapshot(t.room.code);
  const restored = new RoomService({ presentation: true, now: t.now }); restored.restore([snapshot]);
  expect(restored.publicView(t.room.code).game!.nomination!.countedSeats).toEqual([1, 2]);
  t.advance(t.game().nomination!.voteEndsAt! - t.now(), false); restored.advanceTime(t.now()); t.advance(1500, false); restored.advanceTime(t.now());
  const result = restored.publicView(t.room.code).game!;
  expect(result.events.at(-1)!).toMatchObject({ votes: 2, seats: [1, 3] });
  expect(result.seats[0]!.ghostVoteAvailable).toBe(false);
});

test("all disconnected players automatically abstain and the ballot completes", () => {
  const t = timedTable(); t.nominate(1, 6); t.advance(60_000); t.advance(1500);
  expect(t.game().phase).toBe("NOMINATION");
  expect(t.game().events.at(-1)!).toMatchObject({ votes: 0, seats: [] });
  expect(t.game().seats.every((seat) => seat.ghostVoteAvailable)).toBe(true);
  expect(t.game().pauseReason).toBeUndefined();
});

test("a shot pauses the remaining count for the shared full-screen presentation", () => {
  const t = timedTable(); t.nominate(1, 6); t.advance(21_500);
  const before = t.game().nomination!;
  const endBefore = before.voteEndsAt!;
  t.service.useDayAbility(t.room.code, t.players[1]!.token, 1);
  t.advance(1500);
  expect(t.game().nomination!.voteEndsAt).toBe(endBefore + 6000);
  t.advance(4500);
  expect(t.game().nomination!.countedSeats).toEqual([1]);
  t.advance(1500);
  expect(t.game().nomination!.countedSeats).toEqual([1, 2]);
  t.finish(); expect(t.game().phase).toBe("NOMINATION");
});


test("a player counted while alive retains their ghost vote if shot before the ballot finishes", () => {
  const t = timedTable(["slayer", "chef", "empath", "saint", "scarlet_woman", "imp"]);
  t.nominate(2, 5); t.vote(6, true); t.advance(21_500);
  expect(t.game().nomination!.countedSeats).toEqual([6]);
  t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
  expect(t.game().seats[5]!.alive).toBe(true);
  t.advance(4300);
  expect(t.game().seats[5]!.alive).toBe(false);
  expect(t.game().phase).toBe("VOTING");
  t.finish();
  expect(t.game().events.at(-1)!.seats).toEqual([6]);
  expect(t.game().seats[5]!.ghostVoteAvailable).toBe(true);
});
