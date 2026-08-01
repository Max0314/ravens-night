import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "./app.js";

describe("HTTP application", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  test("health endpoint reports readiness", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "ravens-night" });
  });

  test("five guests can join one invitation-only room", async () => {
    const app = buildApp();
    apps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "Max" } });
    expect(created.statusCode).toBe(201);
    const room = created.json<{ code: string }>();

    const nicknames = ["一", "二", "三", "四", "五"];
    for (const nickname of nicknames) {
      const joined = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname, mode: "PLAYER" } });
      expect(joined.statusCode).toBe(201);
      expect(joined.json()).toMatchObject({ nickname, seat: nicknames.indexOf(nickname) + 1 });
    }
  });
});
