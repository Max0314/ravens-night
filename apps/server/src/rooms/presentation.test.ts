import { expect, test, vi } from "vitest";
import { protocolApp as buildApp } from "../test-fixtures/protocol-app.js";
import type { RoomRepository } from "../game/live-runtime.js";
import { roleById } from "@ravens/game-engine";
import type { ExperienceEvent } from "@ravens/contracts";
import { RoomService, type RoomRecord } from "./service.js";
import { initializePresentation, enqueuePublication, publishDue } from "./presentation.js";
import { migratePresentation } from "./migration.js";

function shootingTable(successor = false) {
  let now = 1_800_000_000_000;
  const service = new RoomService({ now: () => now, presentation: true });
  const { room } = service.create(6, "房主");
  const players = Array.from({ length: 6 }, (_, i) => service.join(room.code, `玩家${i + 1}`, "PLAYER"));
  for (const player of players) service.setReady(room.code, player.token, true);
  service.startTutorial(room.code, players[0]!.token, "SKIP");
  const snapshot = service.snapshot(room.code);
  snapshot.assignments = ["slayer", "chef", "empath", "saint", successor ? "scarlet_woman" : "baron", "imp"].map((roleId, i) => ({
    seat: i + 1, roleId, perceivedRoleId: roleId, roleType: roleById(roleId).type, alignment: i >= 4 ? "EVIL" : "GOOD",
  }));
  snapshot.game!.presentationVersion=1;snapshot.game!.startInfo={mode:"LEGACY",stage:"COMPLETE",entries:{}};snapshot.game!.phase = "DAY_DISCUSSION"; snapshot.game!.day = 1;
  delete snapshot.game!.publicProjection; delete snapshot.game!.pendingPublications;
  initializePresentation(snapshot.game!); service.restore([snapshot]);
  return { service, room, players, now: () => now, advance(ms: number, tick = true) { now += ms; if (tick) service.advanceTime(now); } };
}

test("the installed 500ms scheduler publishes only committed due results on the next tick",async()=>{
  const t=shootingTable();t.service.useDayAbility(t.room.code,t.players[0]!.token,6);
  let saved=t.service.snapshot(t.room.code);
  const commits:Array<{at:number;alive:number}>=[];
  const repository:RoomRepository={async initialize(){},async close(){},async loadAll(){return[structuredClone(saved)];},async commit(changed){saved=structuredClone(changed[0]!);commits.push({at:Date.now(),alive:saved.game!.publicProjection!.aliveSeats.length});}};
  vi.useFakeTimers({toFake:["Date","setInterval","clearInterval"]});vi.setSystemTime(t.now());
  const app=buildApp({repository,now:()=>Date.now(),presentation:true});
  try{
    await app.ready();
    const view=async()=>(await app.inject(`/api/rooms/${t.room.code}`)).json();
    await vi.advanceTimersByTimeAsync(4299);expect((await view()).game.aliveCount).toBe(6);
    await vi.advanceTimersByTimeAsync(1);expect((await view()).game.aliveCount).toBe(6);
    await vi.advanceTimersByTimeAsync(200);expect((await view()).game.aliveCount).toBe(5);
    expect(commits.filter(c=>c.alive===5)[0]!.at).toBe(t.now()+4500);
    const mine=(await app.inject(`/api/rooms/${t.room.code}/me?token=${t.players[0]!.token}`)).json();
    expect(mine.room.game.aliveCount).toBe(5);expect(mine.room.revision).toBe((await view()).revision);
  }finally{await app.close();vi.useRealTimers();}
});

test.each([false,true])("clock cannot write while startup migration is pending (failure=%s)",async(fail)=>{
  const t=shootingTable();t.service.useDayAbility(t.room.code,t.players[0]!.token,6);
  const legacy=t.service.snapshot(t.room.code);delete (legacy as Partial<RoomRecord>).schemaVersion;
  delete legacy.game!.publicProjection;delete legacy.game!.pendingPublications;
  let releaseClaims!:()=>void, enteredClaims!:()=>void;
  const entered=new Promise<void>(resolve=>{enteredClaims=resolve;});
  const gate=new Promise<void>(resolve=>{releaseClaims=resolve;});
  const commit=vi.fn(async()=>{if(fail)throw new Error("migration unavailable");});
  const repository:RoomRepository={async initialize(){},async close(){},async loadAll(){return[legacy];},async loadClaims(){enteredClaims();await gate;return[];},commit};
  vi.useFakeTimers({toFake:["Date","setInterval","clearInterval"]});vi.setSystemTime(t.now());
  const app=buildApp({repository,now:()=>Date.now(),presentation:true});
  const ready=app.ready().then(()=>null,error=>error);
  try{
    await entered;await vi.advanceTimersByTimeAsync(6000);expect(commit).not.toHaveBeenCalled();
    releaseClaims();const result=await ready;expect(Boolean(result)).toBe(fail);expect(commit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(commit).toHaveBeenCalledTimes(fail?1:2);
  }finally{releaseClaims();await app.close();vi.useRealTimers();}
});

test("HTTP serializers release neither future event kinds nor death/winner/identity before their publication nodes", () => {
  const t = shootingTable();
  t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
  const publicView = () => t.service.publicView(t.room.code);
  const me = () => t.service.privateView(t.room.code, t.players[0]!.token);
  expect(publicView().state).toBe("RUNNING");
  expect(publicView().game!.aliveCount).toBe(6);
  expect(publicView().game!.events.some(e => e.kind === "SHOT" || e.kind === "GAME_OVER")).toBe(false);
  expect(me().canAbort).toBe(false);
  t.advance(1500);
  expect(publicView().game!.events.at(-1)).toMatchObject({ kind: "SHOT", message: "猎魔人射击。" });
  expect(publicView().game!.events.at(-1)!.outcome).toBeUndefined();
  t.advance(2799);
  expect(publicView().game!.aliveCount).toBe(6);
  t.advance(1, false); // Wall time alone cannot publish an uncommitted result.
  expect(publicView().game!.aliveCount).toBe(6);
  t.service.advanceTime(t.now());
  expect(publicView().game!.aliveCount).toBe(5);
  expect(publicView().game!.winner).toBeUndefined();
  t.advance(1700);
  expect(publicView().state).toBe("GAME_OVER");
  expect(publicView().game!.winner).toBeUndefined();
  expect(me().storytellerDecisions).toBeUndefined();
  t.advance(2100);
  expect(publicView().game!.winner).toBe("GOOD");
  expect(() => t.service.reset(t.room.code, t.players[0]!.token)).toThrow(/身份公布/);
  t.advance(2900);
  expect(me().storytellerDecisions).toBeDefined();
  expect(publicView().game!.events.at(-1)!.message).toContain("身份揭晓");
  expect(() => t.service.reset(t.room.code, t.players[0]!.token)).not.toThrow();
});

test("a public shot cannot privately announce succession before its death reveal", () => {
  const t = shootingTable(true);
  t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
  const view = () => t.service.privateView(t.room.code, t.players[4]!.token);
  expect(view().role!.roleId).toBe("scarlet_woman");
  expect(view().history.some(e => e.kind === "ROLE_CHANGE")).toBe(false);
  t.advance(4299);
  expect(view().role!.roleId).toBe("scarlet_woman");
  t.advance(1);
  expect(view().role!.roleId).toBe("imp");
  expect(view().history.some(e => e.kind === "ROLE_CHANGE")).toBe(true);
});

test("migration preserves half-counted ballots and reconstructs a pending finale without publishing it", () => {
  const t = shootingTable();
  t.service.useDayAbility(t.room.code, t.players[0]!.token, 6);
  const legacy = t.service.snapshot(t.room.code);
  delete legacy.game!.publicProjection; delete legacy.game!.pendingPublications;
  migratePresentation(legacy.game!, 6, t.now());
  expect(legacy.game!.publicProjection!.aliveSeats).toHaveLength(6);
  expect(legacy.game!.publicProjection!.winner).toBeUndefined();
  expect(legacy.game!.publicProjection!.events.some(e => e.kind === "GAME_OVER")).toBe(false);
  const restored = new RoomService({ now: t.now, presentation: true }); restored.restore([legacy]);
  t.advance(11_000, false); restored.advanceTime(t.now());
  expect(restored.publicView(t.room.code).game!.winner).toBe("GOOD");
});

test("aborted games never publish queued public results", () => {
  const t = shootingTable();
  t.service.abort(t.room.code, t.players[0]!.token);
  const before = t.service.publicView(t.room.code).game;
  t.advance(600_000);
  expect(t.service.publicView(t.room.code).game!.events).toEqual(before!.events);
  expect(t.service.publicView(t.room.code).game!.winner).toBeUndefined();
});

test("terminal and nonterminal shots expose identical controls before death release, including leave errors", () => {
  const terminal=shootingTable(), continuing=shootingTable(true);
  for(const t of [terminal,continuing])t.service.useDayAbility(t.room.code,t.players[0]!.token,6);
  const controls=(t:ReturnType<typeof shootingTable>,index:number)=>{
    const view=t.service.privateView(t.room.code,t.players[index]!.token);
    const {gameId,contextId,revision,...game}=view.game!;
    return {state:view.state,game,canAbort:view.canAbort,canRestart:view.canRestart,canVote:view.canVote,canNominate:view.canNominate,canClaimSlayer:view.canClaimSlayer,canEndDay:view.canEndDay,action:view.action,dayReady:view.dayReady};
  };
  // Private identity/history differences are intentionally outside this public-control comparison.
  const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value).replace(/[a-f0-9-]{36}(?::game-1(?::\d+)?)?/g,"event"));
  for(const step of [0,1500,2799]){
    for(const t of [terminal,continuing])t.advance(step);
    for(let i=0;i<6;i++)expect(normalize(controls(terminal,i))).toEqual(normalize(controls(continuing,i)));
    for(const t of [terminal,continuing])expect(()=>t.service.leave(t.room.code,t.players[1]!.token)).toThrow(/演出/);
  }
});

test("normal result is captured at reveal, survives reset/abort, and migrated completed games retain it",()=>{
  const t=shootingTable();t.service.useDayAbility(t.room.code,t.players[0]!.token,6);
  expect(t.service.snapshot(t.room.code).lastResult).toBeUndefined();t.advance(11_000);
  const result=t.service.snapshot(t.room.code).lastResult!;expect(result.participants).toHaveLength(6);expect(result.winner).toBe("GOOD");
  const old=t.service.snapshot(t.room.code);delete old.lastResult;delete old.game!.publicProjection;delete old.game!.pendingPublications;delete (old as Partial<RoomRecord>).schemaVersion;
  const restored=new RoomService({now:t.now});restored.restore([old]);restored.reset(t.room.code,t.players[0]!.token);expect(restored.snapshot(t.room.code).lastResult?.gameId).toBe(result.gameId);
  t.service.reset(t.room.code,t.players[0]!.token);for(const p of t.players){t.service.pulse(t.room.code,p.token,t.now());t.service.setReady(t.room.code,p.token,true);}t.service.startTutorial(t.room.code,t.players[0]!.token,"SKIP");t.service.abort(t.room.code,t.players[0]!.token);expect(t.service.snapshot(t.room.code).lastResult).toEqual(result);
});

test("result API excludes anonymous callers and revokes removed members after reset",async()=>{
  const t=shootingTable();t.service.useDayAbility(t.room.code,t.players[0]!.token,6);t.advance(11_000);t.service.reset(t.room.code,t.players[0]!.token);
  const saved=t.service.snapshot(t.room.code);
  const app=buildApp({timers:false,now:t.now,repository:{async initialize(){},async close(){},async loadAll(){return[structuredClone(saved)];},async commit(){}}});
  try{
    const url=`/api/rooms/${t.room.code}`;
    expect((await app.inject(`${url}/result`)).statusCode).toBe(403);
    expect((await app.inject(url)).json().lastResult).toBeUndefined();
    expect((await app.inject(`${url}/result?token=${t.players[1]!.token}`)).json().result.gameId).toBe(saved.lastResult!.gameId);
    const me=(await app.inject(`${url}/me?token=${t.players[0]!.token}`)).json();
    const removed=await app.inject({method:"POST",url:`${url}/participants/${t.players[1]!.participant.id}/remove`,headers:{"x-ravens-protocol":"4","x-command-id":"result-remove-member"},payload:{token:t.players[0]!.token,roomInstanceId:me.roomInstanceId,setupId:me.setupId,expectedCommandVersion:me.self.commandVersion,confirm:true}});
    expect(removed.statusCode).toBe(200);
    expect((await app.inject(`${url}/result?token=${t.players[1]!.token}`)).statusCode).toBe(403);
    expect((await app.inject(`${url}/result?token=${t.players[0]!.token}`)).json().result).toEqual(saved.lastResult);
  }finally{await app.close();}
});

test.each([['SHOT',2800,4500],['EXECUTION',2800,4500],['DAWN',2100,5000],['GAME_OVER',2100,5000]] as const)("%s publication respects exact result and end boundaries and restart catch-up",(kind,offset,duration)=>{
  const t=shootingTable();const game=t.service.snapshot(t.room.code).game!;game.events=[];delete game.publicProjection;game.pendingPublications=[];initializePresentation(game);
  game.winner="GOOD";game.winReason="测试终局";
  const event:ExperienceEvent={id:`${game.gameId}:100`,gameId:game.gameId,seq:100,kind,startsAt:10000,durationMs:duration,occurredAt:8500,message:"已公开结果",outcome:kind==="GAME_OVER"?"GOOD":"DEATH",seats:[6],targetSeat:6,day:2};
  enqueuePublication(game,event);publishDue(game,9999);expect(game.publicProjection!.events).toHaveLength(0);
  publishDue(game,10000);expect(game.publicProjection!.events[0]!.outcome).toBeUndefined();publishDue(game,10000+offset-1);expect(game.publicProjection!.events[0]!.outcome).toBeUndefined();
  const restored=structuredClone(game);publishDue(restored,10000+offset);expect(restored.publicProjection!.events[0]!.outcome).toBe(event.outcome);
  if(kind==="GAME_OVER"){expect(restored.publicProjection!.revealComplete).toBe(false);publishDue(restored,10000+duration-1);expect(restored.publicProjection!.revealComplete).toBe(false);publishDue(restored,10000+duration);expect(restored.publicProjection!.revealComplete).toBe(true);}else expect(restored.publicProjection!.aliveSeats).not.toContain(6);
  const count=restored.publicProjection!.events.length;publishDue(restored,10000+duration+1);expect(restored.publicProjection!.events).toHaveLength(count);
});
