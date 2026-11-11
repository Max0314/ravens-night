import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,test} from 'vitest';
import {buildApp} from '../app.js';
import {PostgresRoomRepository} from './room-repository.js';
import {LiveRoomRuntime} from '../game/live-runtime.js';
import {RoomService} from '../rooms/service.js';
import {runBots,stepBot} from '../rooms/bot-scheduler.js';
import {bots} from '../rooms/bot-types.js';
const protocol={'x-ravens-protocol':'4'};
const cookie=(r:{cookies:Array<{name:string;value:string}>})=>r.cookies.map(c=>`${c.name}=${c.value}`).join('; ');

test.skipIf(!process.env.RAVENS_BOT_DATABASE_URL)('PG creation receipt/empty lobby survive restart; bot planning, step and clock roll back atomically',async()=>{
 const base=process.env.RAVENS_BOT_DATABASE_URL!,schema=`bots_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:base});await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema}`);const open=()=>new PostgresRoomRepository(url.toString(),'bots-integration-test-key');
 let app:ReturnType<typeof buildApp>|undefined,runtime:LiveRoomRuntime|undefined;
 try{
  app=buildApp({repository:open(),timers:false,resolveAccount:async()=>null});const ticket=await app.inject({url:'/api/room-create-ticket',headers:protocol}),headers={...protocol,cookie:cookie(ticket),'x-command-id':randomUUID()},payload={playerCount:5,organizerName:'PG pending host',createTicket:ticket.json().createTicket};
  await admin.query(`ALTER TABLE "${schema}".room_runtime_snapshots ADD CONSTRAINT fail_creation CHECK(false)`);
  expect((await app.inject({method:'POST',url:'/api/rooms',headers,payload})).statusCode).toBe(503);expect((await admin.query(`SELECT count(*)::int n FROM "${schema}".room_creation_requests`)).rows[0].n).toBe(0);
  await admin.query(`ALTER TABLE "${schema}".room_runtime_snapshots DROP CONSTRAINT fail_creation`);
  const created=await app.inject({method:'POST',url:'/api/rooms',headers,payload});expect(created.statusCode).toBe(201);const code=created.json().code;
  const raw=(await admin.query(`SELECT payload FROM "${schema}".room_creation_requests`)).rows[0].payload;expect(raw.format).toBe('ravens-aes256-v1');expect(JSON.stringify(raw)).not.toContain(code);
  await app.close();app=buildApp({repository:open(),timers:false,resolveAccount:async()=>null});expect((await app.inject({method:'POST',url:'/api/rooms',headers,payload})).json().code).toBe(code);expect((await app.inject({url:`/api/rooms/${code}`,headers:protocol})).json().participants).toHaveLength(0);await app.close();app=undefined;
  runtime=new LiveRoomRuntime(open(),{presentation:true});await runtime.initialize();let host='';await runtime.execute(s=>{host=s.join(code,'真人','PLAYER').token;s.changeBots(code,host,{fill:true});s.changeRehearsalClock(code,host,'MANUAL');});
  const revision=runtime.service.find(code).revision;await admin.query(`ALTER TABLE "${schema}".room_runtime_snapshots ADD CONSTRAINT fail_step CHECK(revision <= ${revision})`);
  await expect(runtime.execute(s=>stepBot(s,code,host))).rejects.toThrow(/保存/);expect(bots(runtime.service.find(code)).some(p=>p.ready)).toBe(false);expect(runtime.service.find(code).botControl.pending).toEqual([]);
  await admin.query(`ALTER TABLE "${schema}".room_runtime_snapshots DROP CONSTRAINT fail_step`);await runtime.execute(s=>stepBot(s,code,host));expect(bots(runtime.service.find(code)).filter(p=>p.ready)).toHaveLength(1);
  await runtime.close();runtime=new LiveRoomRuntime(open(),{presentation:true});await runtime.initialize();expect(runtime.service.find(code).timeline.mode).toBe('MANUAL');expect(runtime.service.find(code).botControl.mode).toBe('PAUSED');expect(bots(runtime.service.find(code)).filter(p=>p.ready)).toHaveLength(1);
  await runtime.execute(s=>s.changeRehearsalClock(code,host,'WALL'));await runtime.execute(runBots);const pending=runtime.service.find(code).botControl.pending.map(t=>t.id);expect(pending.length).toBeGreaterThan(0);await runtime.close();runtime=new LiveRoomRuntime(open());await runtime.initialize();expect(runtime.service.find(code).botControl.pending.map(t=>t.id)).toEqual(pending);
  await runtime.close();runtime=undefined;await admin.query(`UPDATE "${schema}".room_creation_requests SET expires_at=now()-interval '1 minute'`);runtime=new LiveRoomRuntime(open());await runtime.initialize();expect(runtime.service.creationRequests()).toHaveLength(1);await runtime.execute(s=>s.expireCreations());expect(runtime.service.creationRequests()).toHaveLength(0);expect((await admin.query(`SELECT count(*)::int n FROM "${schema}".room_creation_requests`)).rows[0].n).toBe(0);
 }finally{await app?.close();await runtime?.close();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
},30000);

test.skipIf(!process.env.RAVENS_BOT_DATABASE_URL)('PG v2 snapshots migrate together to v4 before use, preserving roles and original deadlines',async()=>{
 const base=process.env.RAVENS_BOT_DATABASE_URL!,schema=`migration_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:base});await admin.query(`CREATE SCHEMA "${schema}"`);const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema}`);const open=()=>new PostgresRoomRepository(url.toString(),'bots-migration-test-key');let repository=open(),runtime:LiveRoomRuntime|undefined;
 try{const s=new RoomService({presentation:false}),code=s.create(5,'旧房').room.code,players=Array.from({length:5},(_,i)=>s.join(code,`真人${i}`,'PLAYER'));for(const p of players)s.setReady(code,p.token,true);s.startTutorial(code,players[0]!.token,'SKIP');const old=s.snapshot(code);(old as unknown as {schemaVersion:number}).schemaVersion=2;delete(old as Partial<typeof old>).botControl;delete(old as Partial<typeof old>).timeline;if(old.game!.publicProjection)delete(old.game!.publicProjection as {publishedPhaseStartedAt?:number}).publishedPhaseStartedAt;await repository.initialize();await repository.commit([old],[]);await repository.close();runtime=new LiveRoomRuntime(open());await runtime.initialize();const migrated=runtime.service.snapshot(code);expect(migrated.schemaVersion).toBe(4);expect(migrated.assignments).toEqual(old.assignments);expect(migrated.game!.phaseDeadlineAt).toBe(old.game!.phaseDeadlineAt);expect(migrated.participants.every(p=>p.controller==='HUMAN')).toBe(true);expect(migrated.botControl.pending).toEqual([]);expect(migrated.timeline).toEqual({mode:'WALL',offsetMs:0,epoch:0});
 }finally{if(runtime)await runtime.close();else await repository.close().catch(()=>undefined);await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
},30000);
