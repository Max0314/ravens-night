import { expect, test } from "vitest";
import { RoomService, type RoomRecord } from "./service.js";
import { initializePresentation } from "./presentation.js";

const INITIAL_NOW = 1_800_000_000_000;
const OPENING_LEAD = 250;
const OPENING_DURATION = 6_200;
const OPENING_END = OPENING_LEAD + OPENING_DURATION;

function table(options: { presentation?: boolean; tutorial?: "SKIP" | "OPTIONAL" } = {}) {
  let now = INITIAL_NOW;
  const service = new RoomService({ now: () => now, presentation: options.presentation ?? true });
  const { room } = service.create(7, "房主");
  const players = Array.from({ length: 7 }, (_, i) => service.join(room.code, `玩家${i + 1}`, "PLAYER"));
  const ready = () => players.forEach(player => service.setReady(room.code, player.token, true));
  ready();
  service.startTutorial(room.code, players[0]!.token, options.tutorial ?? "SKIP");
  return {
    service, code: room.code, players, ready, now: () => now,
    advance(ms: number, target = service) { now += ms; target.advanceTime(now); },
    confirm(target = service) { players.forEach(player => target.confirmRole(room.code, player.token)); },
  };
}

function expectStartInfoWithheld(t: ReturnType<typeof table>, service = t.service) {
  expect(service.find(t.code).game!.startInfo.stage).toBe("WAIT_NIGHTFALL");
  expect(service.find(t.code).game!.nightOrder).toBeUndefined();
  for (const player of t.players) {
    const view = service.privateView(t.code, player.token);
    expect(view.startInfo).toBeUndefined();
    expect(view.history.some(entry => entry.presentation?.kind === "EVIL_START")).toBe(false);
    expect(view.action?.kind === "CONFIRM_ROLE" || view.action === undefined).toBe(true);
  }
}

test("SKIP starts nightfall before confirmation and locks both the delivery lead and the full movie", () => {
  const t = table();
  const game = t.service.snapshot(t.code).game!;
  expect(game.openingNightVersion).toBe(1);
  expect(game.events).toHaveLength(1);
  expect(game.events[0]).toMatchObject({
    kind: "NIGHT_FALLS", day: 0, seq: 1, timingVersion: 4,
    occurredAt: INITIAL_NOW, startsAt: INITIAL_NOW + OPENING_LEAD, durationMs: OPENING_DURATION,
  });
  expect(t.service.publicView(t.code).game).toMatchObject({
    phase: "ROLE_REVEAL", presentationUntil: INITIAL_NOW + OPENING_END,
  });
  expect(t.service.publicView(t.code).game!.events).toHaveLength(0);
  for (const step of [0, OPENING_LEAD - 1, OPENING_DURATION]) {
    t.advance(step);
    for (const player of t.players) {
      expect(t.service.privateView(t.code, player.token).action).toBeUndefined();
      expect(() => t.service.confirmRole(t.code, player.token)).toThrow(/公开演出/);
    }
    expect(t.service.snapshot(t.code).game!.confirmedRoleSeats).toEqual([]);
    expectStartInfoWithheld(t);
  }
  expect(t.now()).toBe(INITIAL_NOW + OPENING_END - 1);
  t.advance(1);
  expect(t.service.publicView(t.code).game!.events.filter(event => event.kind === "NIGHT_FALLS")).toHaveLength(1);
  for (const player of t.players) expect(t.service.privateView(t.code, player.token).action?.kind).toBe("CONFIRM_ROLE");
  expectStartInfoWithheld(t);
});

test("the last tutorial completion creates the same initial nightfall without opening confirmation early", () => {
  const t = table({ tutorial: "OPTIONAL" });
  for (const player of t.players.slice(0, -1)) t.service.completeTutorial(t.code, player.token);
  expect(t.service.publicView(t.code).state).toBe("TUTORIAL");
  expect(t.service.snapshot(t.code).game).toBeUndefined();
  t.advance(500);
  t.service.completeTutorial(t.code, t.players.at(-1)!.token);
  expect(t.service.publicView(t.code)).toMatchObject({ state: "RUNNING", game: {
    phase: "ROLE_REVEAL", presentationUntil: t.now() + OPENING_END,
  } });
  expect(t.service.snapshot(t.code).game!.events).toEqual([expect.objectContaining({
    kind: "NIGHT_FALLS", occurredAt: t.now(), startsAt: t.now() + OPENING_LEAD,
  })]);
  expect(() => t.service.confirmRole(t.code, t.players[0]!.token)).toThrow(/公开演出/);
  expectStartInfoWithheld(t);
});

test("only the final confirmation releases first-night information and never schedules a second opening", () => {
  const t = table();
  t.advance(OPENING_END);
  const opening = t.service.snapshot(t.code).game!.events[0]!;
  for (const player of t.players.slice(0, -1)) {
    t.service.confirmRole(t.code, player.token);
    expect(t.service.publicView(t.code).game!.phase).toBe("ROLE_REVEAL");
    expectStartInfoWithheld(t);
  }
  t.service.confirmRole(t.code, t.players.at(-1)!.token);
  const game = t.service.snapshot(t.code).game!;
  expect(t.service.publicView(t.code).game!.phase).toBe("FIRST_NIGHT");
  expect(game.events.filter(event => event.kind === "NIGHT_FALLS")).toEqual([opening]);
  expect(game.events.at(-1)?.kind).toBe("NOTICE");
  expect(game.presentationUntil).toBe(INITIAL_NOW + OPENING_END);
  expect(game.startInfo).toMatchObject({ mode: "REQUIRED", stage: "WAIT_ACK", releasedAt: t.now() });
  expect(game.nightOrder).toBeUndefined();
  const recipients = t.players.filter(player => t.service.privateView(t.code, player.token).startInfo);
  expect(recipients).toHaveLength(2);
  for (const player of recipients) expect(t.service.privateView(t.code, player.token).startInfo?.canAcknowledge).toBe(true);
  for (const player of t.players) expect(t.service.privateView(t.code, player.token).action).toBeUndefined();
  expect(JSON.stringify(t.service.publicView(t.code))).not.toMatch(/infoId|bluffRoleIds|startInfo|EVIL_START/);
});

test("unacknowledged personal identity movies do not add a server-wide animation barrier", () => {
  const t = table();
  t.advance(OPENING_END);
  t.confirm();
  for (const player of t.players) {
    const view = t.service.privateView(t.code, player.token);
    expect(view.roleConfirmed).toBe(true);
    expect(view.presentations.pending.some(entry => entry.scene.kind === "IDENTITY")).toBe(true);
    if (view.startInfo) t.service.acknowledgeStartInfo(t.code, player.token, view.startInfo.infoId);
  }
  expect(t.service.snapshot(t.code).game!.startInfo.stage).toBe("COMPLETE");
  for (const player of t.players) {
    expect(t.service.privateView(t.code, player.token).presentations.pending.some(entry => entry.scene.kind === "IDENTITY")).toBe(true);
  }
});

test("a mid-opening snapshot restores the same event, publication schedule and lock without replaying it", () => {
  const t = table();
  t.advance(OPENING_LEAD + 1_000);
  const saved = t.service.snapshot(t.code);
  const restored = new RoomService({ now: t.now, presentation: true });
  restored.restore([saved]);
  const after = restored.snapshot(t.code);
  expect(after.game!.openingNightVersion).toBe(1);
  expect(after.metadata?.openingNightRulesVersion).toBe(1);
  expect(after.game!.events).toEqual(saved.game!.events);
  expect(after.game!.publicProjection).toEqual(saved.game!.publicProjection);
  expect(after.game!.pendingPublications).toEqual(saved.game!.pendingPublications);
  expect(() => restored.confirmRole(t.code, t.players[0]!.token)).toThrow(/公开演出/);
  t.advance(OPENING_DURATION - 1_001, restored);
  expect(() => restored.confirmRole(t.code, t.players[0]!.token)).toThrow(/公开演出/);
  t.advance(1, restored);
  t.confirm(restored);
  expect(restored.snapshot(t.code).game!.events.filter(event => event.kind === "NIGHT_FALLS")).toEqual(saved.game!.events);
  expect(restored.snapshot(t.code).game!.startInfo.stage).toBe("WAIT_ACK");
});

test("a genuine unmarked pre-opening snapshot retains confirmation first and its later nightfall gate", () => {
  const t = table();
  const legacy = t.service.snapshot(t.code);
  const game = legacy.game!;
  delete game.openingNightVersion;
  delete legacy.metadata!.openingNightRulesVersion;
  // The previous schema-5 ROLE_REVEAL began with an immediate notice, not a
  // scheduled opening. Reconstruct that old state rather than just erasing its marker.
  game.events = [{
    id: `${game.gameId}:1`, gameId: game.gameId, seq: 1, kind: "NOTICE", timingVersion: 4,
    message: "身份已私密发放，请每位玩家确认。", occurredAt: t.now(), startsAt: t.now(), durationMs: 0, day: 0,
  }];
  game.presentationUntil = 0;
  game.phaseDeadlineAt = t.now() + 180_000;
  delete game.publicProjection;
  game.pendingPublications = [];
  initializePresentation(game, t.now());
  game.publicProjection!.events = structuredClone(game.events);
  const restored = new RoomService({ now: t.now, presentation: true });
  restored.restore([legacy]);
  expect(restored.snapshot(t.code).game!.openingNightVersion).toBeUndefined();
  expect(restored.snapshot(t.code).metadata?.openingNightRulesVersion).toBeUndefined();
  for (const player of t.players.slice(0, -1)) {
    expect(restored.privateView(t.code, player.token).action?.kind).toBe("CONFIRM_ROLE");
    restored.confirmRole(t.code, player.token);
  }
  expect(restored.snapshot(t.code).game!.events.some(event => event.kind === "NIGHT_FALLS")).toBe(false);
  restored.confirmRole(t.code, t.players.at(-1)!.token);
  expect(restored.snapshot(t.code).game!.events.at(-1)).toMatchObject({
    kind: "NIGHT_FALLS", seq: 2, startsAt: t.now() + OPENING_LEAD, durationMs: OPENING_DURATION,
  });
  expectStartInfoWithheld(t, restored);
  t.advance(OPENING_END - 1, restored);
  expectStartInfoWithheld(t, restored);
  t.advance(1, restored);
  expect(restored.snapshot(t.code).game!.startInfo.stage).toBe("WAIT_ACK");
});

test("MANUAL freezes the opening across wall time and advances through its actual lead and end boundaries", () => {
  let now = INITIAL_NOW;
  const service = new RoomService({ now: () => now, presentation: true });
  const code = service.create(7, "真人").room.code;
  const host = service.join(code, "真人", "PLAYER");
  service.changeBots(code, host.token, { fill: true });
  const room = service.find(code);
  for (const player of room.participants) {
    service.setReady(code, player.id === host.participant.id ? host.token : service.internalBotToken(room, player), true);
  }
  service.changeRehearsalClock(code, host.token, "MANUAL");
  service.startTutorial(code, host.token, "SKIP");
  now += 60_000;
  service.advanceTime(now);
  expect(service.snapshot(code).timeline.manualNowMs).toBe(INITIAL_NOW);
  expect(service.publicView(code).game!.events).toHaveLength(0);
  expect(() => service.confirmRole(code, host.token)).toThrow(/公开演出/);
  expect(service.advanceRehearsal(code, host.token).status).toBe("ADVANCED");
  expect(service.snapshot(code).timeline.manualNowMs).toBe(INITIAL_NOW + OPENING_LEAD);
  expect(service.publicView(code).game!.events.at(-1)?.kind).toBe("NIGHT_FALLS");
  expect(() => service.confirmRole(code, host.token)).toThrow(/公开演出/);
  expect(service.advanceRehearsal(code, host.token).status).toBe("ADVANCED");
  expect(service.snapshot(code).timeline.manualNowMs).toBe(INITIAL_NOW + OPENING_END);
  expect(service.privateView(code, host.token).action?.kind).toBe("CONFIRM_ROLE");
  service.confirmRole(code, host.token);
  expect(service.privateView(code, host.token).roleConfirmed).toBe(true);
  expect(service.snapshot(code).game!.startInfo.stage).toBe("WAIT_NIGHTFALL");
});

test("reset retains the persisted rules marker and the next game schedules its own single opening", () => {
  const t = table();
  const firstId = t.service.snapshot(t.code).game!.gameId;
  t.advance(OPENING_END);
  t.service.abort(t.code, t.players[0]!.token);
  t.service.reset(t.code, t.players[0]!.token);
  expect(t.service.snapshot(t.code).metadata?.openingNightRulesVersion).toBe(1);
  t.ready();
  t.service.startTutorial(t.code, t.players[0]!.token, "SKIP");
  const next = t.service.snapshot(t.code);
  expect(next.game!.gameId).not.toBe(firstId);
  expect(next.game!.openingNightVersion).toBe(1);
  expect(next.game!.confirmedRoleSeats).toEqual([]);
  expect(next.game!.events).toEqual([expect.objectContaining({
    kind: "NIGHT_FALLS", seq: 1, gameId: next.game!.gameId, startsAt: t.now() + OPENING_LEAD,
  })]);
  expect(t.service.publicView(t.code).game).toMatchObject({ phase: "ROLE_REVEAL", presentationUntil: t.now() + OPENING_END });
  expect(() => t.service.confirmRole(t.code, t.players[0]!.token)).toThrow(/公开演出/);
});

test("presentation:false preserves the immediate service path without a phantom visual lock", () => {
  const t = table({ presentation: false });
  expect(t.service.snapshot(t.code).game!.events[0]).toMatchObject({
    kind: "NIGHT_FALLS", startsAt: INITIAL_NOW, durationMs: 0,
  });
  for (const player of t.players) expect(t.service.privateView(t.code, player.token).action?.kind).toBe("CONFIRM_ROLE");
  t.confirm();
  const game = t.service.snapshot(t.code).game!;
  expect(game.events.filter(event => event.kind === "NIGHT_FALLS")).toHaveLength(1);
  expect(game.startInfo).toMatchObject({ stage: "WAIT_ACK", releasedAt: INITIAL_NOW });
  expect(t.service.publicView(t.code).game!.phase).toBe("FIRST_NIGHT");
});

test("restore refuses an unknown opening version in both legacy and current snapshots", () => {
  const t = table();
  for (const schemaVersion of [1, 5]) {
    const snapshot = t.service.snapshot(t.code);
    (snapshot as { schemaVersion: number }).schemaVersion = schemaVersion;
    (snapshot.game as unknown as { openingNightVersion: number }).openingNightVersion = 2;
    const restored = new RoomService({ now: t.now, presentation: true });
    expect(() => restored.restore([snapshot as RoomRecord])).toThrow(/opening night version/i);
    expect(restored.listCodes()).toEqual([]);
  }
});
