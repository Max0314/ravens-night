import { afterEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { RoomService, type RoomRecord } from "./service.js";
import { buildApp } from "../app.js";
import type { RoomRepository } from "../game/live-runtime.js";
import { roleById } from "@ravens/game-engine";

function table() {
  let now = 1_800_000_000_000;
  const service = new RoomService({ now: () => now, presentation: false });
  const created = service.create(6, "房主");
  const players = Array.from({ length: 6 }, (_, i) => service.join(created.room.code, `玩家${i + 1}`, "PLAYER"));
  const code = created.room.code;
  const prepare = () => { for (const player of players) service.setReady(code, player.token, true); };
  const start = () => { prepare(); service.startTutorial(code, players[0]!.token); for (const player of players) service.completeTutorial(code, player.token); };
  return { service, code, players, created, prepare, start, now: () => now, advance(ms: number) { now += ms; } };
}

test("offline-ready player blocks start at exactly 30 seconds; current host alone manages the room", () => {
  const t = table(); t.prepare(); t.advance(30_000);
  t.service.pulse(t.code, t.players[0]!.token, t.now());
  expect(() => t.service.startTutorial(t.code, t.players[0]!.token)).toThrow(/离线/);
  expect(() => t.service.startTutorial(t.code, t.created.organizerToken)).toThrow(/现任房主/);
  for (const player of t.players) t.service.pulse(t.code, player.token, t.now());
  t.service.startTutorial(t.code, t.players[0]!.token);
  const setup = t.service.find(t.code).setupId;
  t.service.removeParticipant(t.code, t.players[0]!.token, t.players[1]!.participant.id, true);
  expect(t.service.publicView(t.code)).toMatchObject({ state: "LOBBY", participants: expect.arrayContaining([expect.objectContaining({ ready: false })]) });
  expect(t.service.find(t.code).setupId).not.toBe(setup);
  expect(() => t.service.privateView(t.code, t.players[1]!.token)).toThrow();
});

test("offline host takeover is compare-and-swap; abort remains terminal and reset preserves command versions", () => {
  const t = table(); t.start();
  const original = t.players[0]!.participant.id;
  t.advance(300_000); t.service.pulse(t.code, t.players[1]!.token, t.now());
  t.service.claimHost(t.code, t.players[1]!.token, original);
  expect(() => t.service.claimHost(t.code, t.players[2]!.token, original)).toThrow(/房主已变化/);
  expect(() => t.service.abort(t.code, t.players[0]!.token)).toThrow(/现任房主/);
  const known = t.service.privateView(t.code, t.players[2]!.token).history;
  t.service.abort(t.code, t.players[1]!.token);
  t.advance(600_000); t.service.advanceTime(t.now());
  expect(t.service.publicView(t.code).game).toMatchObject({ phase: "ABORTED" });
  expect(t.service.publicView(t.code).game?.winner).toBeUndefined();
  expect(t.service.privateView(t.code, t.players[2]!.token).history).toEqual(known);
  t.service.completeCommand(t.code, t.players[1]!.participant.id);
  t.service.reset(t.code, t.players[1]!.token);
  expect(t.service.self(t.code, t.players[1]!.token).commandVersion).toBe(1);
});

class MemoryRepository implements RoomRepository {
  fail = false;
  constructor(public rooms: RoomRecord[]) {}
  async initialize() {}
  async loadAll() { return structuredClone(this.rooms); }
  async commit(changed: RoomRecord[], deleted: string[]) {
    if (this.fail) throw new Error("simulated commit failure");
    this.rooms = this.rooms.filter(room => !deleted.includes(room.code) && !changed.some(next => next.code === room.code)).concat(structuredClone(changed));
  }
  async close() {}
}
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function httpTable() {
  const t = table(); t.start();
  const snapshot = t.service.snapshot(t.code);
  snapshot.game!.phase = "DAY_DISCUSSION"; snapshot.game!.day = 1;
  snapshot.game!.aliveSeats = [1, 2, 3, 4, 5];
  snapshot.assignments = ["chef", "empath", "soldier", "saint", "baron", "imp"].map((id, index) => ({ seat: index + 1, roleId: id, perceivedRoleId: id, roleType: roleById(id).type, alignment: index >= 4 ? "EVIL" : "GOOD" }));
  const repository = new MemoryRepository([snapshot]);
  const app = buildApp({ repository, now: t.now, presentation: false, timers: false, resolveAccount: async () => null });
  apps.push(app); await app.ready();
  async function body(seat: number) {
    const view = (await app.inject({ url: `/api/rooms/${t.code}/me?token=${t.players[seat - 1]!.token}`,headers:{"x-ravens-protocol":"3"} })).json();
    return { token: t.players[seat - 1]!.token, roomInstanceId: view.roomInstanceId, setupId: view.setupId, expectedCommandVersion: view.self.commandVersion, gameId: view.game.gameId, contextId: view.contextId, ...(view.game.nomination ? { ballotId: view.game.nomination.ballotId } : {}) };
  }
  const send = (path: string, payload: object, id = randomUUID()) => app.inject({ method: "POST", url: `/api/rooms/${t.code}/${path}`, headers: { "x-ravens-protocol": "3", "x-command-id": id }, payload });
  return { ...t, app, repository, body, send };
}

test("first-arriving old ballot cannot affect the next ballot or spend a ghost; retry returns current view", async () => {
  const t = await httpTable();
  expect((await t.send("nominate", { ...await t.body(1), nomineeSeat: 2 })).statusCode).toBe(200);
  const late = { ...await t.body(6), raised: true };
  const id = randomUUID(), accepted = { ...await t.body(1), raised: false };
  expect((await t.send("vote", accepted, id)).statusCode).toBe(200);
  for (let seat = 2; seat <= 6; seat++) expect((await t.send("vote", { ...await t.body(seat), raised: false })).statusCode).toBe(200);
  expect((await t.send("nominate", { ...await t.body(2), nomineeSeat: 3 })).statusCode).toBe(200);
  const next = await t.body(6);
  const rejected = await t.send("vote", { ...late, expectedCommandVersion: next.expectedCommandVersion });
  expect(rejected.statusCode).toBe(409);
  expect(rejected.json().errorCode).toBe("BALLOT_CHANGED");
  expect(t.repository.rooms[0]!.game!.ghostVoteSeats).toContain(6);
  expect(t.repository.rooms[0]!.game!.voteSubmissions[6]).toBeUndefined();
  const retried = await t.send("vote", accepted, id);
  expect(retried.statusCode).toBe(200);
  expect(retried.json().game.nomination.ballotId).toBe(next.ballotId);
  expect((await t.send("vote", { ...accepted, raised: true }, id)).json().errorCode).toBe("COMMAND_ID_REUSED");
});

test("save failure rolls back a vote and its receipt; same command can safely retry", async () => {
  const t = await httpTable();
  await t.send("nominate", { ...await t.body(1), nomineeSeat: 2 });
  const payload = { ...await t.body(6), raised: true }, id = randomUUID();
  t.repository.fail = true;
  expect((await t.send("vote", payload, id)).statusCode).toBe(503);
  expect(t.repository.rooms[0]!.game!.voteSubmissions[6]).toBeUndefined();
  t.repository.fail = false;
  expect((await t.send("vote", payload, id)).statusCode).toBe(200);
  expect((await t.body(6)).expectedCommandVersion).toBe(payload.expectedCommandVersion + 1);
});

test("legacy writes require refresh; public participants never include command versions", async () => {
  const t = await httpTable();
  expect((await t.app.inject({ method: "POST", url: `/api/rooms/${t.code}/vote`, payload: { raised: true } })).statusCode).toBe(426);
  const publicRoom = (await t.app.inject({ url: `/api/rooms/${t.code}`,headers:{"x-ravens-protocol":"3"} })).json();
  expect(JSON.stringify(publicRoom.participants)).not.toMatch(/commandVersion|tokenHash|accountId|joinTicket/);
});

test("all public snapshots for equal hands are identical for ordinary, healthy and poisoned Butler", () => {
  const t = table(); t.start();
  const initial = t.service.snapshot(t.code); initial.game!.phase = "DAY_DISCUSSION"; initial.game!.day = 1;
  const traces = ["chef", "butler", "poisoned-butler"].map(kind => {
    const snapshot = structuredClone(initial);
    snapshot.assignments[0]!.roleId = kind === "chef" ? "chef" : "butler";
    snapshot.assignments[0]!.perceivedRoleId = snapshot.assignments[0]!.roleId;
    snapshot.game!.butlerMasterSeat = 4;
    if (kind === "poisoned-butler") snapshot.game!.poisonedSeat = 1;
    const service = new RoomService({ presentation: false, now: t.now }); service.restore([snapshot]);
    service.nominate(t.code, t.players[1]!.token, 6);
    const frames = [];
    for (let seat = 1; seat <= 6; seat++) {
      service.vote(t.code, t.players[seat - 1]!.token, seat === 1);
      const frame = service.publicView(t.code);
      // Independently generated opaque round ids carry no role information.
      frames.push(JSON.stringify(frame).replace(/"contextId":"[^"]+"/g, '"contextId":"opaque"').replace(/"ballotId":"[^"]+"/g, '"ballotId":"opaque"'));
    }
    expect(service.publicView(t.code).game!.events.at(-1)!.votes).toBe(1);
    if (kind !== "chef") expect(service.privateView(t.code, t.players[0]!.token).history.at(-1)!.text).toContain("主人未举手");
    return frames;
  });
  expect(traces[1]).toEqual(traces[0]); expect(traces[2]).toEqual(traces[0]);
});
