import {expect,test,vi} from 'vitest';
import {RoomService} from './service.js';
import {LiveRoomRuntime,type RoomRepository} from '../game/live-runtime.js';
function table(count=7,presentation=true){
  let now=1800000000000;const service=new RoomService({now:()=>now,presentation});
  const {room}=service.create(count,'房主');const players=Array.from({length:count},(_,i)=>service.join(room.code,`玩家${i+1}`,'PLAYER'));
  players.forEach(p=>service.setReady(room.code,p.token,true));service.startTutorial(room.code,players[0]!.token,'SKIP');
  return{service,room,players,advance(ms:number){now+=ms;service.advanceTime(now);},confirm(){players.forEach(p=>service.confirmRole(room.code,p.token));}};
}
test.each([7,8,10,12])('%i players receive private start information only after nightfall and cannot bypass acknowledgements',count=>{
  const t=table(count);t.advance(1000);
  expect(t.service.find(t.room.code).game!.startInfo.stage).toBe('WAIT_NIGHTFALL');
  t.players.forEach(p=>expect(t.service.privateView(t.room.code,p.token).startInfo).toBeUndefined());
  t.confirm();t.advance(6499);
  expect(t.service.find(t.room.code).game!.startInfo.stage).toBe('WAIT_NIGHTFALL');t.advance(1);
  const game=t.service.find(t.room.code).game!,entries=Object.entries(game.startInfo.entries);
  expect(entries).toHaveLength(count<10?2:3);expect(game.nightOrder).toBeUndefined();
  for(const p of t.players){
    const v=t.service.privateView(t.room.code,p.token);
    expect(v.action).toBeUndefined();expect(()=>t.service.submitAction(t.room.code,p.token,[1])).toThrow(/当前私密提示/);
    if(!v.startInfo)continue;
    expect(v.startInfo.canAcknowledge).toBe(true);expect(v.startInfo.team).toHaveLength(entries.length-1);
    expect(()=>t.service.acknowledgeStartInfo(t.room.code,p.token,'00000000-0000-0000-0000-000000000000')).toThrow(/当前没有/);
  }
  expect(JSON.stringify(t.service.publicView(t.room.code))).not.toMatch(/infoId|bluffRoleIds|startInfo/);
  const next=new RoomService();next.restore([t.service.snapshot(t.room.code)]);expect(next.snapshot(t.room.code).game!.startInfo).toEqual(game.startInfo);
  const initialize=vi.spyOn(t.service as any,'initializeNight');
  entries.forEach(([seat,entry],i)=>{t.service.acknowledgeStartInfo(t.room.code,t.players[Number(seat)-1]!.token,entry.infoId);if(i<entries.length-1)expect(game.nightOrder).toBeUndefined();});
  expect(game.startInfo.stage).toBe('COMPLETE');expect(initialize).toHaveBeenCalledOnce();
  const history=structuredClone(game.privateHistory),order=structuredClone(game.nightOrder);
  const [seat,entry]=entries[0]!;t.service.acknowledgeStartInfo(t.room.code,t.players[Number(seat)-1]!.token,entry.infoId);
  expect(game.privateHistory).toEqual(history);expect(game.nightOrder).toEqual(order);
});
test.each([5,6])('%i player small game never provides team information and releases the first night after the cinematic',count=>{
  const t=table(count);t.confirm();t.advance(6500);
  expect(t.service.find(t.room.code).game!.startInfo).toMatchObject({mode:'NONE',stage:'COMPLETE',entries:{}});
  t.players.forEach(p=>expect(t.service.privateView(t.room.code,p.token).startInfo).toBeUndefined());
});
test('abort cancels a released gate and its unacknowledged private card remains read-only after restore',()=>{
  const t=table();t.confirm();t.advance(6500);const entries=Object.entries(t.service.find(t.room.code).game!.startInfo.entries);
  t.service.abort(t.room.code,t.players[0]!.token);const next=new RoomService();next.restore([t.service.snapshot(t.room.code)]);
  for(const [seat,entry]of entries){const token=t.players[Number(seat)-1]!.token;expect(next.privateView(t.room.code,token).startInfo?.canAcknowledge).toBe(false);expect(()=>next.acknowledgeStartInfo(t.room.code,token,entry.infoId)).toThrow();}
});
test('schema3 upgrade commits exactly once and retains bots/manual time; schema4 reload is a read',async()=>{
  let now=1800000000000;const service=new RoomService({now:()=>now}),code=service.create(7,'真人').room.code,host=service.join(code,'真人','PLAYER');service.changeBots(code,host.token,{fill:true});
  const room=service.find(code),bot=room.participants.find(p=>p.controller==='BOT')!;for(const p of room.participants)service.setReady(code,p.id===host.participant.id?host.token:service.internalBotToken(room,p),true);
  service.startTutorial(code,host.token,'SKIP');service.changeRehearsalClock(code,host.token,'MANUAL');
  room.botControl.pending=[{id:'preserved-task',botId:bot.id,sequence:1,controlGeneration:room.botControl.generation,roomInstanceId:room.roomInstanceId,setupId:room.setupId,gameId:room.game!.gameId,contextId:room.game!.publicProjection!.contextId,expectedBotCommandVersion:bot.commandVersion,kind:'CONFIRM_ROLE',args:{},dueGameAt:now+1500}];
  const snapshot=service.snapshot(code),timeline=structuredClone(snapshot.timeline),pending=structuredClone(snapshot.botControl.pending);(snapshot as {schemaVersion:number}).schemaVersion=3;
  delete (snapshot.game as any).startInfo;delete (snapshot.game as any).presentationVersion;
  let stored=snapshot,commits=0;
  const repository:RoomRepository={async close(){},async initialize(){},async loadAll(){return[structuredClone(stored)];},async commit(changed){commits++;stored=structuredClone(changed[0]!);}};
  const first=new LiveRoomRuntime(repository);await first.initialize();expect(commits).toBe(1);expect(stored.schemaVersion).toBe(4);expect(stored.game!.startInfo.mode).toBe('LEGACY');expect(stored.participants.filter(p=>p.controller==='BOT')).toHaveLength(6);expect(stored.timeline).toEqual(timeline);expect(stored.botControl.pending).toEqual(pending);
  await new LiveRoomRuntime(repository).initialize();expect(commits).toBe(1);
});
