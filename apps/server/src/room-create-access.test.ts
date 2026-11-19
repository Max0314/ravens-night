import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { buildApp } from "./app.js";
import type { Account } from './auth/account.js';

const apps: ReturnType<typeof buildApp>[] = [];
const protocol = { "x-ravens-protocol": "7" };
const accessUrl = "/api/room-create-access";
function fixture(passcode: string) {
  const account:Account = {sub:'opening-test-account',name:'账号房主'};
  const app = buildApp({ roomCreatePasscode: passcode, accessPassword: "", resolveAccount: async cookie => cookie?.includes('sso=fixture')?account:null, timers: false });
  apps.push(app);
  return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

function cookies(response: { cookies: { name: string; value: string }[] }) {
  return response.cookies.map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

async function createIntent(app: ReturnType<typeof buildApp>, grant?: string, setup:Record<string,unknown>={}) {
  const ticket = await app.inject({ url: "/api/room-create-ticket", headers: { ...protocol, cookie: grant ?? "" } });
  expect(ticket.statusCode).toBe(200);
  const context = cookies(ticket);
  const commandId = randomUUID();
  const payload = { playerCount: 5, organizerName: "房主", createTicket: ticket.json().createTicket };
  return (access = grant, changes:Record<string,unknown>={}) => app.inject({
    method: "POST", url: "/api/rooms", payload:{...payload,...setup,...changes},
    headers: { ...protocol, cookie: [context, access].filter(Boolean).join("; "), "x-command-id": commandId },
  });
}

test("new rooms require a verified browser when configured, while a committed creation still recovers without a grant", async () => {
  const app = fixture("fixture-opening-code");
  expect((await app.inject({ url: accessUrl })).json()).toMatchObject({ status: "PASSCODE_REQUIRED",creationV3:true });
  const create = await createIntent(app);
  expect((await create()).json()).toMatchObject({ errorCode: "ROOM_CREATE_ACCESS_REQUIRED" });
  const invalid = await app.inject({ method: "POST", url: accessUrl, payload: { passcode: "wrong" } });
  expect(invalid.json().errorCode).toBe("ROOM_CREATE_PASSCODE_INVALID");
  expect(invalid.cookies).toHaveLength(0);
  const granted = await app.inject({ method: "POST", url: accessUrl, payload: { passcode: " fixture-opening-code " } });
  expect(granted.json()).toMatchObject({ status: "GRANTED",via:'PASSCODE',saved:true });
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

test('only a verified guest can reveal their own entered code; account can open without a grant', async () => {
  const app=fixture('saved-fixture');
  const grant=await app.inject({method:'POST',url:accessUrl,payload:{passcode:' saved-fixture '}});
  const cookie=cookies(grant),saved=accessUrl+'/saved';
  expect(grant.cookies[1]).toMatchObject({httpOnly:true,path:saved,sameSite:'Strict'});
  expect(grant.cookies[1]?.value).not.toContain('saved-fixture');
  expect((await app.inject({url:saved,headers:{cookie}})).json()).toEqual({status:'CURRENT'});
  const reveal=await app.inject({method:'POST',url:saved,payload:{intent:'REVEAL'},headers:{cookie}});
  expect(reveal.headers['cache-control']).toBe('no-store');
  expect(reveal.json()).toEqual({status:'CURRENT',passcode:'saved-fixture'});
  expect((await app.inject({method:'POST',url:accessUrl,payload:{passcode:'wrong'},headers:{cookie}})).statusCode).toBe(403);
  expect((await app.inject({url:saved,headers:{cookie:'sso=fixture; '+cookie}})).statusCode).toBe(403);
  const account=await app.inject({url:accessUrl,headers:{cookie:'sso=fixture'}});
  expect(account.json()).toMatchObject({status:'GRANTED',via:'ACCOUNT'});expect(account.cookies).toHaveLength(0);
  const create=await createIntent(app,'sso=fixture');
  expect((await create()).statusCode).toBe(201);
  const rotated=fixture('different-fixture');
  expect((await rotated.inject({url:saved,headers:{cookie}})).json()).toEqual({status:'ROTATED'});
});

test('v3 guest debug atomically creates a closed roster and replays only for the same browser identity', async () => {
  const app=fixture('debug-fixture');
  const grant=await app.inject({method:'POST',url:accessUrl,payload:{passcode:'debug-fixture'}});
  const create=await createIntent(app,cookies(grant),{creationVersion:3,roomKind:'DEBUG_SOLO',hostAvatar:null,playerCount:7,baseComposition:{townsfolk:4,outsider:0,minion:2,demon:1}});
  const created=await create();
  expect(created.statusCode).toBe(201);
  const body=created.json();
  expect(body).toMatchObject({roomKind:'DEBUG_SOLO',participantId:expect.any(String),roomInstanceId:expect.any(String)});
  expect(body).not.toHaveProperty('organizerToken');
  const origin=`/api/rooms/${body.code}`,headers={...protocol,cookie:cookies(created)};
  const mine=await app.inject({url:`${origin}/me`,headers});
  expect(mine.statusCode).toBe(200);
  expect(mine.json()).toMatchObject({canManageBots:false,rehearsal:{canChooseRole:true},room:{activeHumanCount:1,botCount:6}});
  expect(mine.json().room.participants.filter((p:{controller:string;ready:boolean})=>p.controller==='BOT'&&p.ready)).toHaveLength(6);
  for(const [path,header] of [['/summary',protocol],['?mode=DISPLAY',headers],['/result',protocol],['/join-ticket?mode=PLAYER',headers]] as const){
    const denied=await app.inject({url:origin+path,headers:header});
    expect(denied.json().errorCode).toBe('DEBUG_ROOM_PRIVATE');
  }
  const replay=await create('');
  expect(replay.statusCode).toBe(201);expect(replay.json()).toEqual(body);
  expect((await create('sso=fixture')).json().errorCode).toBe('CREATION_OWNER_CHANGED');
  expect((await create('',{baseComposition:{townsfolk:5,outsider:0,minion:1,demon:1}})).json().errorCode).toBe('CREATION_ID_REUSED');
});
