import {expect,test} from 'vitest';
import {RoomService,type RoomRecord} from './service.js';
import {stepBot} from './bot-scheduler.js';
import {LiveRoomRuntime,type RoomRepository} from '../game/live-runtime.js';
function fixture(count=5){const service=new RoomService({presentation:false}),code=service.create(count,'真人').room.code,host=service.join(code,'真人','PLAYER');service.changeBots(code,host.token,{fill:true});return{service,code,host};}
function start(service:RoomService,code:string,token:string){const room=service.find(code);for(const p of room.participants.filter(p=>p.mode==='PLAYER'))service.setReady(code,p.controller==='BOT'?service.internalBotToken(room,p):token,true);service.startTutorial(code,token,'SKIP');}

test('chosen identity follows the human through seat reorder, restore, role reveal and next game without public leakage',()=>{
 const {service,code,host}=fixture();expect(service.privateView(code,host.token).rehearsal).toEqual({eligible:true,canChooseRole:true});const oldSetup=service.find(code).setupId;
 service.changeRehearsalRole(code,host.token,'drunk');expect(service.find(code).setupId).not.toBe(oldSetup);const room=service.find(code),ids=room.participants.map(p=>p.id);service.reorderSeats(code,host.token,[...ids.slice(1),ids[0]!]);
 const restored=new RoomService({presentation:false});restored.restore([service.snapshot(code)]);expect(restored.privateView(code,host.token).rehearsal.selectedRoleId).toBe('drunk');start(restored,code,host.token);
 const gameRoom=restored.find(code),assignment=gameRoom.assignments.find(r=>r.seat===5)!;expect(assignment.roleId).toBe('drunk');expect(restored.privateView(code,host.token).role?.roleId).toBe(assignment.perceivedRoleId);expect(gameRoom.game?.rehearsalUsed).toBe(true);expect(restored.privateView(code,host.token).rehearsal.canChooseRole).toBe(false);expect(JSON.stringify(restored.publicView(code))).not.toMatch(/selectedRoleId|rehearsalRole|drunk/);
 expect(()=>restored.changeRehearsalRole(code,host.token,'spy')).toThrow(/回到大厅/);restored.abort(code,host.token);restored.reset(code,host.token);expect(restored.privateView(code,host.token).rehearsal.selectedRoleId).toBe('drunk');restored.changeRehearsalRole(code,host.token,null);expect(restored.privateView(code,host.token).rehearsal.selectedRoleId).toBeUndefined();start(restored,code,host.token);expect(restored.find(code).game?.rehearsalUsed).toBe(false);
});
test('second human or no remaining bots atomically clears the choice and invalidates prepared bot tasks',()=>{
 const {service,code,host}=fixture();service.changeRehearsalRole(code,host.token,'imp');service.changeRehearsalClock(code,host.token,'MANUAL');const other=service.join(code,'第二真人','PLAYER');expect(service.find(code).rehearsalRole).toBeUndefined();expect(service.find(code).timeline.mode).toBe('WALL');expect(service.privateView(code,host.token).rehearsal).toEqual({eligible:false,canChooseRole:false});expect(()=>service.changeRehearsalRole(code,host.token,'spy')).toThrow(/一名真人/);expect(()=>service.changeRehearsalRole(code,other.token,'spy')).toThrow(/现任房主/);
 service.leave(code,other.token);service.changeRehearsalRole(code,host.token,'spy');expect(service.privateView(code,host.token).rehearsal.eligible).toBe(true);service.changeBots(code,host.token,{clear:true});expect(service.find(code).rehearsalRole).toBeUndefined();expect(()=>service.changeRehearsalRole(code,host.token,'spy')).toThrow(/一名真人/);
});
test.each([5,6])('forcing evil in %i seats does not grant first-night team information or bluffs',count=>{
 const {service,code,host}=fixture(count);service.changeRehearsalRole(code,host.token,'imp');start(service,code,host.token);service.confirmRole(code,host.token);service.changeBotControl(code,host.token,'PAUSED');for(let i=0;i<count-1;i++)stepBot(service,code,host.token);
 expect(service.privateView(code,host.token).startInfo).toBeUndefined();expect(Object.keys(service.find(code).game!.startInfo.entries)).toHaveLength(0);
});
test('selection rolls back on storage failure and persisted selection restores without a new random draw',async()=>{
 let stored:RoomRecord[]=[],fail=false;const repository:RoomRepository={initialize:async()=>{},loadAll:async()=>structuredClone(stored),commit:async(changed)=>{if(fail)throw Error('disk');const all=new Map(stored.map(r=>[r.code,r]));for(const r of changed)all.set(r.code,structuredClone(r));stored=[...all.values()];},close:async()=>{}};const runtime=new LiveRoomRuntime(repository,{presentation:false});await runtime.initialize();let code='',token='';await runtime.execute(s=>{code=s.create(5,'真人').room.code;token=s.join(code,'真人','PLAYER').token;s.changeBots(code,token,{fill:true});});const before=runtime.service.snapshot(code);
 fail=true;await expect(runtime.execute(s=>s.changeRehearsalRole(code,token,'spy'))).rejects.toThrow(/保存/);expect(runtime.service.snapshot(code)).toEqual(before);
 fail=false;await runtime.execute(s=>s.changeRehearsalRole(code,token,'spy'));const fresh=new LiveRoomRuntime(repository,{presentation:false});await fresh.initialize();expect(fresh.service.privateView(code,token).rehearsal.selectedRoleId).toBe('spy');await fresh.execute(s=>start(s,code,token));expect(fresh.service.find(code).assignments.find(r=>r.seat===1)?.roleId).toBe('spy');await runtime.close();await fresh.close();
});
