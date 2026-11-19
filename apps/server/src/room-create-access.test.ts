import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { buildApp } from "./app.js";

const apps: ReturnType<typeof buildApp>[] = [];
const protocol = { "x-ravens-protocol": "7" };
const accessUrl = "/api/room-create-access";
function fixture(passcode: string) {
  const app = buildApp({ roomCreatePasscode: passcode, accessPassword: "", resolveAccount: async () => null, timers: false });
  apps.push(app);
  return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

function cookies(response: { cookies: { name: string; value: string }[] }) {
  return response.cookies.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

async function createIntent(app: ReturnType<typeof buildApp>, grant?: string) {
  const ticket = await app.inject({ url: "/api/room-create-ticket", headers: { ...protocol, cookie: grant ?? "" } });
  expect(ticket.statusCode).toBe(200);
  const context = cookies(ticket);
  const commandId = randomUUID();
  const payload = { playerCount: 5, organizerName: "房主", createTicket: ticket.json().createTicket };
  return (access = grant) => app.inject({
    method: "POST", url: "/api/rooms", payload,
    headers: { ...protocol, cookie: [context, access].filter(Boolean).join("; "), "x-command-id": commandId },
  });
}

test("new rooms require a verified browser when configured, while a committed creation still recovers without a grant", async () => {
  const app = fixture("fixture-opening-code");
  expect((await app.inject({ url: accessUrl })).json()).toEqual({ status: "PASSCODE_REQUIRED" });
  const create = await createIntent(app);
  expect((await create()).json()).toMatchObject({ errorCode: "ROOM_CREATE_ACCESS_REQUIRED" });
  const invalid = await app.inject({ method: "POST", url: accessUrl, payload: { passcode: "wrong" } });
  expect(invalid.json().errorCode).toBe("ROOM_CREATE_PASSCODE_INVALID");
  expect(invalid.cookies).toHaveLength(0);
  const granted = await app.inject({ method: "POST", url: accessUrl, payload: { passcode: " fixture-opening-code " } });
  expect(granted.json()).toEqual({ status: "GRANTED" });
  expect(granted.cookies[0]).toMatchObject({ httpOnly: true, path: "/", maxAge: 400 * 24 * 60 * 60 });
  expect(granted.cookies[0]?.value).not.toContain("fixture-opening-code");
  const created = await create(cookies(granted));
  expect(created.statusCode).toBe(201);
  expect((await create()).json().code).toBe(created.json().code);
  const another = await createIntent(app, cookies(granted));
  expect((await another()).json().code).not.toBe(created.json().code);
});

test("rotating the code rejects old unredeemed codes and retains existing browser grants", async () => {
  const before = fixture("fixture-old-code");
  const granted = await before.inject({ method: "POST", url: accessUrl, payload: { passcode: "fixture-old-code" } });
  const after = fixture("fixture-new-code");
  expect((await after.inject({ method: "POST", url: accessUrl, payload: { passcode: "fixture-old-code" } })).statusCode).toBe(403);
  expect((await after.inject({ url: accessUrl })).json().status).toBe("PASSCODE_REQUIRED");
  const remembered = await after.inject({ url: accessUrl, headers: { cookie: cookies(granted) } });
  expect(remembered.json().status).toBe("GRANTED");
  const create = await createIntent(after, cookies(remembered));
  expect((await create()).statusCode).toBe(201);
});

test("a fresh guest can use the room invitation to take a seat without opening-room access", async () => {
  const app = fixture("fixture-opening-code");
  const grant = await app.inject({ method: "POST", url: accessUrl, payload: { passcode: "fixture-opening-code" } });
  const create = await createIntent(app, cookies(grant));
  const created = await create();
  const code = created.json().code;
  const path = `/api/rooms/${code}`;
  async function join(nickname: string, browserCookie = "") {
    const headers = { ...protocol, cookie: browserCookie };
    const ticket = await app.inject({ url: `${path}/join-ticket?mode=PLAYER`, headers });
    const joined = await app.inject({
      method: "POST", url: `${path}/join`, headers,
      payload: { joinTicket: ticket.json().joinTicket, nickname, mode: "PLAYER" },
    });
    expect(joined.statusCode).toBe(201);
    return joined;
  }
  const host = await join("房主", cookies(created));
  const guest = await join("游客同伴");
  const view = await app.inject({ url: `${path}/me`, headers: { ...protocol, cookie: cookies(guest) } });
  expect(view.json().participant).toMatchObject({ nickname: "游客同伴", seat: 2 });
  expect(view.json().room.organizerId).toBe(host.json().id);
  expect((await app.inject({ url: accessUrl, headers: { cookie: cookies(guest) } })).json().status).toBe("PASSCODE_REQUIRED");
});

test("the unconfigured service continues to allow new rooms without a code", async () => {
  const app = fixture("");
  expect((await app.inject({ url: accessUrl })).json().status).toBe("OPEN");
  const create = await createIntent(app);
  expect((await create()).statusCode).toBe(201);
});
