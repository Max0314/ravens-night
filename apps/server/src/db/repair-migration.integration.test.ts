import { randomUUID, createHash } from "node:crypto";
import { expect, test } from "vitest";
import { Pool } from "pg";
import { PostgresRoomRepository } from "./room-repository.js";
import { LiveRoomRuntime, type CommandReceipt } from "../game/live-runtime.js";
import { RoomService, type RoomRecord } from "../rooms/service.js";
import { initializePresentation } from "../rooms/presentation.js";
import { createRecovery, recoverMembership, inviteWhisper, respondWhisper, sendWhisper, socialView } from "../rooms/social.js";

function table() {
  let now=1_800_000_000_000;
  const service=new RoomService({now:()=>now,presentation:true});const {room}=service.create(6,"测试房主");
  const players=Array.from({length:6},(_,i)=>service.join(room.code,`玩家${i+1}`,"PLAYER"));
  for(const p of players)service.setReady(room.code,p.token,true);service.startTutorial(room.code,players[0]!.token,"SKIP");
  const game=service.find(room.code).game!;game.phase="DAY_DISCUSSION";game.day=1;game.aliveSeats=[1,2,3,4,5];delete game.publicProjection;delete game.pendingPublications;initializePresentation(game);
  return {service,room,players,now:()=>now,advance(ms:number){now+=ms;service.advanceTime(now);}};
}

test.skipIf(!process.env.RAVENS_REPAIR_DATABASE_URL)("v1 migration is atomic in PostgreSQL, retains frozen ballots/recovery, and IDs survive restart",async()=>{
  const schema="repair_"+randomUUID().replaceAll("-","");const admin=new Pool({connectionString:process.env.RAVENS_REPAIR_DATABASE_URL!});
  await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(process.env.RAVENS_REPAIR_DATABASE_URL!);url.searchParams.set("options",`-c search_path=${schema}`);
  const open=()=>new PostgresRoomRepository(url.toString(),"repair-test-key");let repository=open();let runtime:LiveRoomRuntime|undefined;
  try {
    const t=table();t.service.nominate(t.room.code,t.players[0]!.token,5);t.advance(2500);t.service.vote(t.room.code,t.players[5]!.token,true);t.advance(21_500);
    const recovery=createRecovery(t.service.find(t.room.code),t.players[2]!.token,t.now());
    const old=t.service.snapshot(t.room.code);expect(old.game!.nomination!.countedVotes![6]).toBe(true);expect(old.game!.ghostVoteSeats).not.toContain(6);
    delete (old as Partial<RoomRecord>).schemaVersion;delete (old as Partial<RoomRecord>).roomInstanceId;delete (old as Partial<RoomRecord>).setupId;delete old.game!.publicProjection;delete old.game!.pendingPublications;
    const second=t.service.create(5,"第二房").room;const other=t.service.snapshot(second.code);delete (other as Partial<RoomRecord>).schemaVersion;
    await repository.initialize();await repository.commit([old,other],[]);await repository.close();
    await admin.query(`INSERT INTO "${schema}".room_public_events(code,game_id,seq,event) VALUES($1,$2,999,'{"kind":"GAME_OVER","winner":"secret"}')`,[old.code,old.game!.gameId]);
    await admin.query(`ALTER TABLE "${schema}".room_runtime_snapshots ADD CONSTRAINT block_upgrade CHECK(code <> '${other.code}' OR revision <= ${other.revision})`);
    repository=open();runtime=new LiveRoomRuntime(repository,{now:t.now,presentation:true});await expect(runtime.initialize()).rejects.toThrow();await runtime.close();runtime=undefined;
    repository=open();await repository.initialize();expect((await repository.loadAll()).every(r=>r.schemaVersion===undefined)).toBe(true);await repository.close();
    expect((await admin.query(`SELECT count(*)::int n FROM "${schema}".room_public_events WHERE seq=999`)).rows[0].n).toBe(1);
    await admin.query(`ALTER TABLE "${schema}".room_runtime_snapshots DROP CONSTRAINT block_upgrade`);
    repository=open();runtime=new LiveRoomRuntime(repository,{now:t.now,presentation:true});await runtime.initialize();
    const migrated=runtime.service.snapshot(old.code);expect(migrated.schemaVersion).toBe(3);expect(migrated.revision).toBe(old.revision+1);expect(migrated.game!.nomination).toEqual(old.game!.nomination);expect(migrated.game!.publicProjection!.nomination?.countedVotes?.[6]).toBe(true);expect(migrated.game!.ghostVoteSeats).not.toContain(6);
    expect((await admin.query(`SELECT count(*)::int n FROM "${schema}".room_public_events WHERE seq=999`)).rows[0].n).toBe(0);
    await runtime.close();repository=open();runtime=new LiveRoomRuntime(repository,{now:t.now,presentation:true});await runtime.initialize();
    expect(runtime.service.snapshot(old.code).roomInstanceId).toBe(migrated.roomInstanceId);expect(runtime.service.snapshot(old.code).setupId).toBe(migrated.setupId);
    const recovered=await runtime.execute(s=>recoverMembership(s,old.code,recovery.recoveryCode,"old-code-recovery",undefined,t.now()));expect(recovered.id).toBe(t.players[2]!.participant.id);
    await runtime.execute(s=>s.advanceTime(t.now()));expect(runtime.service.snapshot(old.code).game!.ghostVoteSeats).not.toContain(6);
  } finally {if(runtime)await runtime.close();else await repository.close().catch(()=>undefined);await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
},30_000);

test("256 compact receipts plus 100 maximum Chinese whispers fit the approved budget and evicted commands cannot execute",async()=>{
  const t=table(),snapshot=t.service.snapshot(t.room.code);const runtime=new LiveRoomRuntime(undefined,{now:t.now,presentation:true});runtime.service.restore([snapshot]);
  const actor=t.players[0]!,other=t.players[1]!;let last:CommandReceipt|undefined,first:CommandReceipt|undefined;
  inviteWhisper(runtime.service.find(t.room.code),actor.token,2);const invitation=socialView(runtime.service.find(t.room.code),other.token).social.invitations[0]!;respondWhisper(runtime.service.find(t.room.code),other.token,invitation.id,true);
  for(let i=0;i<270;i++){
    const view=runtime.service.privateView(t.room.code,actor.token);const context={roomInstanceId:view.roomInstanceId,setupId:view.setupId,expectedCommandVersion:view.self.commandVersion,gameId:view.game!.gameId,contextId:view.contextId!};
    const receipt:CommandReceipt={code:t.room.code,id:`message-${i}`,actor:actor.token,context,fingerprint:createHash("sha256").update(String(i)).digest("hex"),resultKind:"view"};first??=receipt;last=receipt;
    await runtime.execute(s=>{s.validateCommand(t.room.code,actor.token,context,"GAME");sendWhisper(s.find(t.room.code),actor.token,invitation.id,"字".repeat(500));},receipt);
  }
  const saved=runtime.service.snapshot(t.room.code), receipts=saved.metadata!.commandReceipts;
  expect(Object.keys(receipts as object)).toHaveLength(256);expect(Buffer.byteLength(JSON.stringify(receipts))).toBeLessThanOrEqual(65_536);expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThanOrEqual(262_144);
  expect(JSON.stringify(receipts)).not.toMatch(/messages|history|participants|events/);expect(socialView(saved,actor.token).social.activeWhisper!.messages).toHaveLength(100);
  const version=runtime.service.self(t.room.code,actor.token).commandVersion;
  await runtime.execute(()=>{throw Error("must not execute retry");},last);expect(runtime.service.self(t.room.code,actor.token).commandVersion).toBe(version);
  await expect(runtime.execute(s=>s.validateCommand(t.room.code,actor.token,first!.context!,"GAME"),first)).rejects.toMatchObject({errorCode:"COMMAND_VERSION_STALE"});
  await runtime.close();
});
