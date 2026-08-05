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

  test("an access password protects public room APIs with a signed session cookie", async () => {
    const app = buildApp({ accessPassword: "correct-horse-battery-staple" });
    apps.push(app);
    const denied = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "Max" } });
    expect(denied.statusCode).toBe(401);
    const wrong = await app.inject({ method: "POST", url: "/api/auth/login", payload: { accessPassword: "wrong" } });
    expect(wrong.statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { accessPassword: "correct-horse-battery-staple" } });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    const created = await app.inject({ method: "POST", url: "/api/rooms", headers: { cookie: Array.isArray(cookie) ? cookie[0]! : cookie! }, payload: { playerCount: 5, organizerName: "Max" } });
    expect(created.statusCode).toBe(201);
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

  test("leaving a lobby releases the participant cookie and seat", async () => {
    const app = buildApp();
    apps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "Max" } });
    const room = created.json<{ code: string }>();
    const joined = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname: "Max", mode: "PLAYER" } });
    const playerCookie = String(joined.headers["set-cookie"]).split(";")[0]!;

    const left = await app.inject({ method: "DELETE", url: `/api/rooms/${room.code}/leave`, headers: { cookie: playerCookie }, payload: {} });

    expect(left.statusCode).toBe(200);
    expect(left.json()).toEqual({ left: true, roomDestroyed: true, organizerChanged: true });
    expect(String(left.headers["set-cookie"])).toContain("ravens_player=");
    expect((await app.inject({ method: "GET", url: `/api/rooms/${room.code}` })).statusCode).toBe(404);
  });

  test("the successor can start with their player cookie after the original organizer leaves", async () => {
    const app = buildApp();
    apps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "原房主" } });
    const room = created.json<{ code: string }>();
    const cookies: string[] = [];
    for (const nickname of ["原房主", "接任房主", "三号", "四号", "五号"]) {
      const joined = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname, mode: "PLAYER" } });
      cookies.push(String(joined.headers["set-cookie"]).split(";")[0]!);
    }

    const left = await app.inject({ method: "DELETE", url: `/api/rooms/${room.code}/leave`, headers: { cookie: cookies[0]! }, payload: {} });
    expect(left.json()).toMatchObject({ left: true, roomDestroyed: false, organizerChanged: true });
    const publicRoom = await app.inject({ method: "GET", url: `/api/rooms/${room.code}` });
    expect(publicRoom.json()).toMatchObject({ organizerName: "接任房主" });
    expect(publicRoom.json().participants[0]).toMatchObject({ nickname: "接任房主", seat: 1 });

    const replacement = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname: "补位玩家", mode: "PLAYER" } });
    expect(replacement.statusCode).toBe(201);
    const started = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/start`, headers: { cookie: cookies[1]! }, payload: {} });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({ state: "TUTORIAL", organizerName: "接任房主" });
  });

  test("only a display session may reorder every player before the game starts", async () => {
    const app = buildApp();
    apps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "原房主" } });
    const room = created.json<{ code: string }>();
    const players: Array<{ id: string; cookie: string }> = [];
    for (const nickname of ["原房主", "二号", "三号", "四号", "五号"]) {
      const joined = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname, mode: "PLAYER" } });
      players.push({ id: joined.json<{ id: string }>().id, cookie: String(joined.headers["set-cookie"]).split(";")[0]! });
    }
    const display = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname: "客厅大屏", mode: "DISPLAY" } });
    const displayCookie = String(display.headers["set-cookie"]).split(";")[0]!;
    const participantIds = [players[2]!.id, players[0]!.id, players[1]!.id, players[3]!.id, players[4]!.id];

    const denied = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/seats`, headers: { cookie: players[0]!.cookie }, payload: { participantIds } });
    expect(denied.statusCode).toBe(400);
    expect(denied.json()).toMatchObject({ error: expect.stringContaining("只有公共大屏") });

    const reordered = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/seats`, headers: { cookie: displayCookie }, payload: { participantIds } });
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json()).toMatchObject({ organizerId: players[0]!.id, organizerName: "原房主" });
    expect(reordered.json().participants.find((participant: { id: string }) => participant.id === players[2]!.id)).toMatchObject({ seat: 1, nickname: "三号" });
  });

  test("the organizer starts one synchronized tutorial and each player receives a private role", async () => {
    const app = buildApp();
    apps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "Max" } });
    const room = created.json<{ code: string; organizerToken: string }>();
    const tokens: string[] = [];
    for (const nickname of ["一", "二", "三", "四", "五"]) {
      const joined = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname, mode: "PLAYER" } });
      tokens.push(joined.json<{ token: string }>().token);
    }
    const started = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/start`, payload: { organizerToken: room.organizerToken } });
    expect(started.statusCode).toBe(200);
    for (const token of tokens) {
      const completed = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/tutorial/complete`, payload: { token } });
      expect(completed.statusCode).toBe(200);
    }
    const mine = await app.inject({ method: "GET", url: `/api/rooms/${room.code}/me?token=${tokens[0]}` });
    expect(mine.json()).toMatchObject({ state: "RUNNING", role: { alignment: expect.any(String), name: expect.any(String) } });

    for (const token of tokens) {
      const confirmed = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/role/confirm`, payload: { token } });
      expect(confirmed.statusCode).toBe(200);
    }
    const publicGame = await app.inject({ method: "GET", url: `/api/rooms/${room.code}` });
    expect(["FIRST_NIGHT", "DAY_DISCUSSION"]).toContain(publicGame.json().game.phase);
  });

  test("signed device cookies restore organizer and player identity without exposing tokens in URLs", async () => {
    const app = buildApp();
    apps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "创建者" } });
    const room = created.json<{ code: string }>();
    const organizerCookie = String(created.headers["set-cookie"]).split(";")[0]!;
    const playerCookies: string[] = [];
    for (const nickname of ["一", "二", "三", "四", "五"]) {
      const joined = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/join`, payload: { nickname, mode: "PLAYER" } });
      playerCookies.push(String(joined.headers["set-cookie"]).split(";")[0]!);
    }
    const started = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/start`, headers: { cookie: organizerCookie }, payload: {} });
    expect(started.statusCode).toBe(200);
    for (const cookie of playerCookies) {
      const completed = await app.inject({ method: "POST", url: `/api/rooms/${room.code}/tutorial/complete`, headers: { cookie }, payload: {} });
      expect(completed.statusCode).toBe(200);
    }
    const mine = await app.inject({ method: "GET", url: `/api/rooms/${room.code}/me`, headers: { cookie: playerCookies[0]! } });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ participant: { nickname: "一", seat: 1 }, role: { name: expect.any(String) } });
  });
});
