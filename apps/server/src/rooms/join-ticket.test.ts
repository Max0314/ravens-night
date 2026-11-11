import { afterEach, expect, test } from "vitest";
import { protocolApp as buildApp } from "../test-fixtures/protocol-app.js";
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function lobby() {
  let now=Date.now();
  const app = buildApp({ timers: false, now:()=>now, resolveAccount: async () => null }); apps.push(app); await app.ready();
  const { code } = (await app.inject({ method: "POST", url: "/api/rooms", payload: { playerCount: 5, organizerName: "房主" } })).json();
  const ticket = async () => (await app.inject({ url: `/api/rooms/${code}/join-ticket?mode=PLAYER` })).json().joinTicket;
  const join = (joinTicket: string, nickname = "原昵称", cookie?: string) => app.inject({ method: "POST", url: `/api/rooms/${code}/join`, headers: { "x-ravens-protocol": "3", ...(cookie ? { cookie } : {}) }, payload: { nickname, mode: "PLAYER", joinTicket } });
  return { app, code, ticket, join, advance(ms:number){now+=ms;} };
}
test("lost first join response and concurrent retry reuse one seat even after setup changes", async () => {
  const t = await lobby(), ticket = await t.ticket();
  const [first, second] = await Promise.all([t.join(ticket), t.join(ticket)]);
  expect(first.statusCode).toBe(201); expect(second.statusCode).toBe(201);
  expect(second.json().id).toBe(first.json().id);
  expect(second.json().token).toBe(first.json().token);
  const room = (await t.app.inject({ url: `/api/rooms/${t.code}` })).json();
  expect(room.participants).toHaveLength(1);
});
test("same-cookie join with another name keeps the existing host and nickname", async () => {
  const t = await lobby();
  const first = await t.join(await t.ticket());
  const cookie = first.cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const second = await t.join(await t.ticket(), "另一个昵称", cookie);
  expect(second.json().id).toBe(first.json().id);
  expect(second.json().nickname).toBe("原昵称");
  expect((await t.app.inject({ url: `/api/rooms/${t.code}` })).json().organizerId).toBe(first.json().id);
});
test("unused ticket conflicts when another join changes the roster; used ticket stays replayable", async () => {
  const t = await lobby(), oldUnused = await t.ticket(), used = await t.ticket();
  expect((await t.join(used)).statusCode).toBe(201);
  expect((await t.join(oldUnused, "新玩家")).json().errorCode).toBe("SETUP_CHANGED");
  expect((await t.join(used)).statusCode).toBe(201);
});

test("tickets cannot cross rooms or modes, expire at ten minutes, and rotation revokes used tickets",async()=>{
  const t=await lobby(),ticket=await t.ticket();const joined=await t.join(ticket);const token=joined.json().token;
  const headers={"x-ravens-protocol":"3"};const other=(await t.app.inject({method:"POST",url:"/api/rooms",payload:{playerCount:5,organizerName:"另一个房"}})).json();
  expect((await t.app.inject({method:"POST",url:`/api/rooms/${other.code}/join`,headers,payload:{nickname:"甲",mode:"PLAYER",joinTicket:ticket}})).statusCode).toBe(409);
  expect((await t.app.inject({method:"POST",url:`/api/rooms/${t.code}/join`,headers,payload:{nickname:"电视",mode:"DISPLAY",joinTicket:ticket}})).statusCode).toBe(409);
  const view=(await t.app.inject(`/api/rooms/${t.code}/me?token=${token}`)).json();
  const recovery=(await t.app.inject({method:"POST",url:`/api/rooms/${t.code}/recovery`,headers:{...headers,"x-command-id":"issue-recovery-1"},payload:{token,roomInstanceId:view.roomInstanceId,setupId:view.setupId,expectedCommandVersion:view.self.commandVersion}})).json();
  expect((await t.app.inject({method:"POST",url:`/api/rooms/${t.code}/recover`,headers,payload:{recoveryCode:recovery.recoveryCode}})).statusCode).toBe(200);
  expect((await t.join(ticket)).json().errorCode).toBe("JOIN_TICKET_REVOKED");
  const unused=await t.ticket();t.advance(600_000);expect((await t.join(unused)).json().errorCode).toBe("JOIN_TICKET_EXPIRED");
  expect((await t.app.inject(`/api/rooms/${t.code}`)).json().participants).toHaveLength(1);
});
