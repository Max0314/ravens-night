import {expect,test} from 'vitest';
import {RoomService,type RoomRecord} from './service.js';
import {runBots,stepBot} from './bot-scheduler.js';
import {bots} from './bot-types.js';
import {LiveRoomRuntime,type RoomRepository} from '../game/live-runtime.js';
function table(){let now=1800000000000;const service=new RoomService({now:()=>now,presentation:true});const {room}=service.create(5,'真人'),code=room.code,host=service.join(code,'真人','PLAYER');return{service,code,host,now:()=>now,advance(ms:number){now+=ms;service.pulse(code,host.token,now);service.advanceTime(now);},tick(ms=500){this.advance(ms);runBots(service);}};}
test('new empty rooms restore; bot fill prepares, stays in the real room and a human replaces the highest bot',()=>{
 const t=table();t.service.changeBots(t.code,t.host.token,{fill:true});expect(bots(t.service.find(t.code))).toHaveLength(4);const previous=t.service.find(t.code).setupId;
 for(let i=0;i<8;i++)t.tick();expect(bots(t.service.find(t.code)).every(p=>p.ready)).toBe(true);
 const replaced=bots(t.service.find(t.code)).find(p=>p.seat===5)!,oldToken=t.service.internalBotToken(t.service.find(t.code),replaced);const joined=t.service.join(t.code,'新真人','PLAYER');expect(joined.participant.seat).toBe(5);expect(()=>t.service.privateView(t.code,oldToken)).toThrow();expect(t.service.find(t.code).setupId).not.toBe(previous);
 const empty=t.service.create(5,'尚未入座').room;const fresh=new RoomService();fresh.restore([empty]);expect(fresh.find(empty.code).metadata?.pendingFirstJoin).toBe(true);
});
test('single-human manual time freezes game but not presence; stepping uses genuine preparation and controls leave cleanly',()=>{
 const t=table();t.service.changeBots(t.code,t.host.token,{fill:true});t.service.changeRehearsalClock(t.code,t.host.token,'MANUAL');
 for(let i=0;i<4;i++)expect(stepBot(t.service,t.code,t.host.token).status).toBe('APPLIED');t.service.setReady(t.code,t.host.token,true);t.service.startTutorial(t.code,t.host.token,'SKIP');
 t.service.confirmRole(t.code,t.host.token);for(let i=0;i<4;i++)stepBot(t.service,t.code,t.host.token);
 const before=t.service.gameNow(t.service.find(t.code));t.advance(60000);expect(t.service.gameNow(t.service.find(t.code))).toBe(before);
 const snapshot=t.service.snapshot(t.code),fresh=new RoomService({now:t.now,presentation:true});fresh.restore([snapshot]);expect(fresh.find(t.code).timeline.mode).toBe('MANUAL');
 expect(t.service.advanceRehearsal(t.code,t.host.token).status).toBe('ADVANCED');expect(t.service.gameNow(t.service.find(t.code))).toBeGreaterThan(before);
 t.service.changeRehearsalClock(t.code,t.host.token,'WALL');expect(t.service.gameNow(t.service.find(t.code))).toBeGreaterThanOrEqual(before);
});
test('clearing the last bot exits manual time; bots never inherit host and a bot-only room is removed',()=>{
 const t=table();t.service.changeBots(t.code,t.host.token,{fill:true});t.service.changeRehearsalClock(t.code,t.host.token,'MANUAL');t.service.changeBots(t.code,t.host.token,{clear:true});expect(t.service.find(t.code).timeline.mode).toBe('WALL');
 t.service.changeBots(t.code,t.host.token,{fill:true});expect(t.service.leave(t.code,t.host.token).roomDestroyed).toBe(true);expect(()=>t.service.find(t.code)).toThrow();
});
test('pending tasks may become stale, restore remains possible and stale work cannot cross setup',()=>{
 const t=table();t.service.changeBots(t.code,t.host.token,{fill:true});runBots(t.service);const before=t.service.snapshot(t.code);expect(before.botControl.pending.length).toBeGreaterThan(0);before.setupId='new-setup';
 const restored=new RoomService({now:t.now});expect(()=>restored.restore([before])).not.toThrow();restored.changeBotControl(t.code,t.host.token,'PAUSED');expect(restored.find(t.code).botControl.pending).toHaveLength(0);
});
test('bot planning and execution roll back with persistence and restore pending work exactly once',async()=>{
 let now=1800000000000,stored:RoomRecord[]=[],fail=false;
 const repository:RoomRepository={initialize:async()=>{},loadAll:async()=>structuredClone(stored),commit:async(changed)=>{if(fail)throw Error('test failure');const map=new Map(stored.map(r=>[r.code,r]));for(const r of changed)map.set(r.code,structuredClone(r));stored=[...map.values()];},close:async()=>{}};
 const runtime=new LiveRoomRuntime(repository,{now:()=>now,presentation:true});await runtime.initialize();let code='',token='';
 await runtime.execute(s=>{code=s.create(5,'主人').room.code;token=s.join(code,'主人','PLAYER').token;s.changeBots(code,token,{fill:true});});
 fail=true;await expect(runtime.execute(runBots)).rejects.toThrow(/保存/);expect(runtime.service.find(code).botControl.pending).toHaveLength(0);
 fail=false;await runtime.execute(runBots);expect(stored[0]!.botControl.pending).toHaveLength(4);now+=500;
 fail=true;await expect(runtime.execute(runBots)).rejects.toThrow(/保存/);expect(bots(runtime.service.find(code)).some(p=>p.ready)).toBe(false);
 fail=false;await runtime.execute(runBots);expect(bots(runtime.service.find(code)).filter(p=>p.ready)).toHaveLength(1);await runtime.close();
});

test('v3 restore rejects malformed tasks/memory and counts task arguments as UTF-8 bytes',()=>{
 const t=table();t.service.changeBots(t.code,t.host.token,{fill:true});runBots(t.service);const good=t.service.snapshot(t.code),restore=(change:(r:RoomRecord)=>void)=>{const bad=structuredClone(good);change(bad);expect(()=>new RoomService().restore([bad])).toThrow(/invalid bot/);};
 restore(r=>{(r.botControl.pending[0] as unknown as {kind:string}).kind='UNKNOWN';});restore(r=>{r.botControl.pending[0]!.kind='WHISPER_ACCEPT';r.botControl.pending[0]!.args={whisperId:'字'.repeat(700)};});restore(r=>{r.botControl.memory['missing-bot']={knownTeamSeats:[],ackedHumanMessageIds:[]};});
 const bot=bots(good)[0]!;restore(r=>{r.botControl.memory[bot.id]={knownTeamSeats:undefined as unknown as number[],ackedHumanMessageIds:[]};});
});

test('second human atomically exits rehearsal and bot names can skip eleven occupied labels',()=>{
 const t=table();t.service.changeBots(t.code,t.host.token,{fill:true});t.service.changeRehearsalClock(t.code,t.host.token,'MANUAL');const version=t.service.find(t.code).botControl.version;t.service.join(t.code,'第二真人','PLAYER');const room=t.service.find(t.code);expect(room.timeline.mode).toBe('WALL');expect(room.botControl.mode).toBe('RUNNING');expect(room.botControl.version).toBe(version+1);expect(room.botControl.pending).toEqual([]);
 const s=new RoomService(),code=s.create(12,'人机·01').room.code,players=Array.from({length:11},(_,i)=>s.join(code,`人机·${String(i+1).padStart(2,'0')}`,'PLAYER'));s.changeBots(code,players[0]!.token,{fill:true});expect(bots(s.find(code))[0]!.nickname).toBe('人机·12');
});

test('quiet human heartbeats checkpoint at most once per minute and survive a restart past room TTL',async()=>{
 let now=1800000000000,stored:RoomRecord[]=[],writes=0;const repository:RoomRepository={initialize:async()=>{},loadAll:async()=>structuredClone(stored),commit:async changed=>{writes++;stored=changed.map(r=>structuredClone(r));},close:async()=>{}};let runtime=new LiveRoomRuntime(repository,{now:()=>now});await runtime.initialize();let code='',token='';await runtime.execute(s=>{code=s.create(5,'真人').room.code;token=s.join(code,'真人','PLAYER').token;s.changeBots(code,token,{fill:true});});const before=writes;for(let tick=0;tick<150;tick++){now+=1000;await runtime.execute(s=>s.pulse(code,token,now));}expect(writes-before).toBe(2);now+=2*60*60*1000;await runtime.execute(s=>s.pulse(code,token,now));await runtime.close();runtime=new LiveRoomRuntime(repository,{now:()=>now});await runtime.initialize();expect(await runtime.execute(s=>s.expireIdle(now))).toEqual([]);expect(runtime.service.find(code).lastHumanActivityAt).toBe(now);await runtime.close();
});
