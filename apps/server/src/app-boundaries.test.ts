import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "./app.js";
import type { RoomRepository } from "./game/live-runtime.js";
import type { RoomRecord } from "./rooms/service.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
function appFixture(repository?: RoomRepository) {
  const app = buildApp({ timers: false, ...(repository ? { repository } : {}) }); apps.push(app); return app;
}
async function roomFixture(app: ReturnType<typeof buildApp>) {
  const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "Host" } });
  const code = created.json().code as string;
  const player = await app.inject({ method: "POST", url: `/api/rooms/${code}/join`, payload: { nickname: "Host", mode: "PLAYER" } });
  const cookie = String(player.headers["set-cookie"]).split(";")[0]!;
  return { code, cookie, player };
}
describe("HTTP and websocket authorization boundaries", () => {
  test("player and display cookies coexist, and display sessions never receive a private projection", async () => {
    const app = appFixture(); const { code, cookie, player } = await roomFixture(app);
    const display = await app.inject({ method: "POST", url: `/api/rooms/${code}/join`, payload: { nickname: "TV", mode: "DISPLAY" } });
    const displayCookie = String(display.headers["set-cookie"]).split(";")[0]!;
    expect(String(player.headers["set-cookie"])).toContain(`Path=/api/rooms/${code}`);
    expect(String(display.headers["set-cookie"])).toContain("ravens_display=");
    const both = `${cookie}; ${displayCookie}`;
    expect((await app.inject({ url: `/api/rooms/${code}/me`, headers: { cookie: both } })).json().participant.nickname).toBe("Host");
    expect((await app.inject({ url: `/api/rooms/${code}/me`, headers: { cookie: displayCookie } })).statusCode).toBe(403);
    await app.ready();
    const ws = await app.injectWS(`/api/rooms/${code}/live?mode=DISPLAY`, { headers: { cookie: both } });
    try {
      const received = new Promise<string>((resolve) => ws.once("message", (message: { toString(): string }) => resolve(message.toString())));
      ws.send("ping");
      const view = JSON.parse(await received);
      expect(view.type).toBe("view");
      expect(view.privateView).toBeUndefined();
      expect(view.room.participants).toHaveLength(2);
      expect(JSON.stringify(view)).not.toMatch(/tokenHash|organizerToken|commandReceipts/);
    } finally { ws.terminate(); }
  });
  test("a recovery response is private, rotates the old cookie, and cannot replay a cached receipt", async () => {
    const app = appFixture(); const { code, cookie } = await roomFixture(app);
    const headers = { cookie, "x-command-id": "recovery-command-001" };
    const issue = () => app.inject({ method: "POST", url: `/api/rooms/${code}/recovery`, headers, payload: {} });
    const issued = await issue(); expect(issued.statusCode).toBe(200);
    const recoveryCode = issued.json().recoveryCode;
    expect((await issue()).json().recoveryCode).toBe(recoveryCode);
    const recovered = await app.inject({ method: "POST", url: `/api/rooms/${code}/recover`, payload: { recoveryCode } });
    expect(recovered.statusCode).toBe(200);
    expect((await issue()).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/rooms/${code}/me`, headers: { cookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/rooms/${code}` })).body).not.toContain(recoveryCode);
  });
  test("invalid modes and string booleans cannot change room state", async () => {
    const app = appFixture(); const { code, cookie } = await roomFixture(app);
    expect((await app.inject({ method: "POST", url: `/api/rooms/${code}/join`, payload: { nickname: "Intruder", mode: "ORGANIZER" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/rooms/${code}/ready`, headers: { cookie }, payload: { ready: "false" } })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/rooms/${code}` })).json().participants).toHaveLength(1);
    expect((await app.inject({ url: `/api/rooms/${code}` })).json().participants[0].ready).toBe(false);
  });
  test("query parameters cannot bypass login throttling and websocket upgrades reject a foreign origin", async () => {
    const app = appFixture();
    for (let i = 0; i < 60; i++) await app.inject({ method: "POST", url: `/api/auth/login?attempt=${i}`, payload: { accessPassword: "test" } });
    expect((await app.inject({ method: "POST", url: "/api/auth/login?different=1", payload: { accessPassword: "test" } })).statusCode).toBe(429);
    const { code, cookie } = await roomFixture(app);
    await expect(app.injectWS(`/api/rooms/${code}/live`, { headers: { cookie, host: "clocktower.fribench.cn", origin: "https://untrusted.fribench.cn" } })).rejects.toThrow();
  });
  test("a lost recovery response can be retried with the same operation id, including after a restart", async () => {
    const saved = new Map<string, RoomRecord>();
    const repository: RoomRepository = {
      async initialize() {}, async close() {}, async loadAll() { return [...saved.values()].map((r) => structuredClone(r)); },
      async commit(changed, deleted) { changed.forEach((r) => saved.set(r.code, structuredClone(r))); deleted.forEach((code) => saved.delete(code)); },
    };
    const app = appFixture(repository); const { code, cookie } = await roomFixture(app);
    const issued = await app.inject({ method: "POST", url: `/api/rooms/${code}/recovery`, headers: { cookie }, payload: {} });
    const request = { method: "POST" as const, url: `/api/rooms/${code}/recover`, headers: { "x-command-id": "lost-response-001" }, payload: { recoveryCode: issued.json().recoveryCode } };
    const first = await app.inject(request); expect(first.statusCode).toBe(200);
    const restarted = appFixture(repository);
    const retried = await restarted.inject(request); expect(retried.statusCode).toBe(200); expect(retried.json().token).toBe(first.json().token);
    expect((await restarted.inject({ ...request, headers: { "x-command-id": "different-operation" } })).statusCode).toBe(400);
    const replacementCookie = String(retried.headers["set-cookie"]).split(";")[0]!;
    await restarted.inject({ method: "POST", url: `/api/rooms/${code}/recovery`, headers: { cookie: replacementCookie }, payload: {} });
    expect((await restarted.inject(request)).statusCode).toBe(400);
  });
  test("a failed commit returns a sanitized retryable error and leaves the acknowledged state available", async () => {
    let fail = false;
    const saved = new Map<string, RoomRecord>();
    const repository: RoomRepository = {
      async initialize() {}, async close() {}, async loadAll() { return [...saved.values()]; },
      async commit(changed, deleted) {
        if (fail) throw new Error("postgres://private-database-password/internal-table");
        changed.forEach((r) => saved.set(r.code, structuredClone(r))); deleted.forEach((code) => saved.delete(code));
      },
    };
    const app = appFixture(repository); const { code, cookie } = await roomFixture(app);
    fail = true;
    const failure = await app.inject({ method: "POST", url: `/api/rooms/${code}/ready`, headers: { cookie }, payload: { ready: true } });
    expect(failure.statusCode).toBe(503); expect(failure.body).not.toContain("private-database-password");
    const privateView = await app.inject({ url: `/api/rooms/${code}/me`, headers: { cookie } });
    expect(privateView.statusCode).toBe(200);
    expect((await app.inject({ url: `/api/rooms/${code}` })).json().participants[0].ready).toBe(false);
    fail = false;
    expect((await app.inject({ method: "POST", url: `/api/rooms/${code}/ready`, headers: { cookie }, payload: { ready: true } })).statusCode).toBe(200);
  });
});
