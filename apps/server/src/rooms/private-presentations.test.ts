import {expect,test} from 'vitest';
import {roleById} from '@ravens/game-engine';
import {experienceTiming, type PresentationAckRequest} from '@ravens/contracts';
import {RoomService,type RoomRecord} from './service.js';
import {initializePresentation} from './presentation.js';
import {LiveRoomRuntime,type RoomRepository} from '../game/live-runtime.js';
import {buildApp} from '../app.js';

function table(roles=['chef','empath','fortune_teller','soldier','baron','imp'],cinematic=false){
 let now=1_800_000_000_000;
 const service=new RoomService({now:()=>now,presentation:cinematic}),code=service.create(roles.length,'主人').room.code;
 const players=roles.map((_,i)=>service.join(code,`玩家${i+1}`,'PLAYER'));
 players.forEach(p=>service.setReady(code,p.token,true));service.startTutorial(code,players[0]!.token,'SKIP');
 const saved=service.snapshot(code),g=saved.game!;
 saved.assignments=roles.map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id,roleType:roleById(id).type,alignment:roleById(id).type==='DEMON'||roleById(id).type==='MINION'?'EVIL':'GOOD'}));
 g.startInfo={mode:'LEGACY',stage:'COMPLETE',entries:{}};g.presentationVersion=4;g.pendingPublications=[];g.presentationUntil=0;g.events=[];delete g.publicProjection;initializePresentation(g,now);service.restore([saved]);
 const view=(seat=1)=>service.privateView(code,players[seat-1]!.token);
 const scenes=(seat=1)=>view(seat).presentations.pending.map(p=>p.scene);
 return{service,code,players,view,scenes,now:()=>now,advance(ms:number){now+=ms;service.advanceTime(now);},night(){players.forEach(p=>service.confirmRole(code,p.token));},day(){const s=service.snapshot(code),g=s.game!;g.phase='DAY_DISCUSSION';g.day=1;g.confirmedRoleSeats=players.map(p=>p.participant.seat!);g.pendingPublications=[];g.presentationUntil=0;delete g.publicProjection;initializePresentation(g,now);service.restore([s]);}};
}

test('v4 has exact three/two distinct bell cues and nonblocking announcements',()=>{
 expect(experienceTiming('NIGHT_FALLS',4)).toMatchObject({duration:6200,cues:[[350,'bell'],[1900,'bell'],[3450,'bell']]});
 expect(experienceTiming('DAWN',4)).toMatchObject({duration:6600,resultOffset:1800,cues:[[350,'dawn'],[2950,'dawn']]});
 const t=table();t.day();t.service.nominate(t.code,t.players[0]!.token,2);expect(t.view(3).canVote).toBe(true);expect(t.service.find(t.code).game!.presentationUntil).toBe(0);
});

test('automatic chef/empath information produces full shown descriptors without early neighbor seats',()=>{
 const t=table();t.night();
 const chef=t.scenes(1).find(p=>p.kind==='INFORMATION')!,empath=t.scenes(2).find(p=>p.kind==='INFORMATION')!;
 expect(chef.shown.type).toBe('COUNT');expect(empath.shown.type).toBe('COUNT');
 expect(t.view(2).history.find(e=>e.presentation?.id===empath.id)?.targetSeats).toBeUndefined();
 expect(JSON.stringify(empath)).not.toMatch(/seats|poison|impaired|truth/);
 const before=empath.id;t.service.submitAction(t.code,t.players[2]!.token,[1,3]);
 expect(t.scenes(3).filter(p=>p.kind==='ACTION_SUBMITTED'||p.kind==='INFORMATION').map(p=>p.shown.type)).toEqual(['TARGET_SUBMITTED','DIVINATION']);
 expect(t.view(2).history.find(e=>e.presentation?.id===before)?.targetSeats).toEqual([1,3]);
 expect(t.scenes(2).filter(p=>p.kind==='INFORMATION')).toHaveLength(1);
});

test('all three first-night candidate emitters and no-outsider branch contain only selected shown result',()=>{
 for(const id of ['washerwoman','librarian','investigator']){
  const t=table([id,'butler','fortune_teller','soldier','baron','imp']);t.night();
  // Butler follows the first-night automatic information, so it does not delay these.
  const entry=t.view().history.find(e=>e.presentation?.kind==='INFORMATION')!;
  expect(entry.presentation!.shown).toMatchObject({type:'CANDIDATES',seats:entry.candidateGroup!.seats});
  expect(roleById((entry.presentation!.shown as {roleId:string}).roleId).name).toBe(entry.candidateGroup!.roleName);
  expect(JSON.stringify(entry.presentation)).not.toMatch(/decoy|targetSeat|impaired|truth/);
 }
 const t=table(['librarian','fortune_teller','chef','soldier','baron','imp']);t.night();expect(t.scenes().find(p=>p.kind==='INFORMATION')?.shown).toEqual({type:'NO_OUTSIDER'});
});

test('spy animation points to the received immutable snapshot, never a live truth projection',()=>{
 const t=table(['spy','fortune_teller','chef','soldier','baron','imp']);t.night();t.service.submitAction(t.code,t.players[1]!.token,[1,2]);
 const entry=t.view().history.find(e=>e.presentation?.shown.type==='GRIMOIRE')!;
 expect(entry.presentation!.shown).toEqual({type:'GRIMOIRE',historySeq:entry.seq});const snapshot=structuredClone(entry.grimoire);
 t.service.find(t.code).assignments[1]!.roleId='mayor';expect(t.view().history.find(e=>e.seq===entry.seq)!.grimoire).toEqual(snapshot);
 expect(JSON.stringify(t.service.publicView(t.code))).not.toMatch(/presentationSeen|roleNotifications|GRIMOIRE|privateHistory/);
});

test('receipt is idempotent, validates whole batch, and cannot alter ballot or actor versions',()=>{
 const t=table();t.day();t.service.nominate(t.code,t.players[0]!.token,2);
 const g=t.service.find(t.code).game!,before=structuredClone(g.nomination),view=t.view();
 const seq=view.presentations.pending[0]!.historySeq,request:PresentationAckRequest={roomInstanceId:view.roomInstanceId,gameId:g.gameId,entries:[{historySeq:seq,disposition:'COMPLETE'}]};
 const revision=t.service.find(t.code).revision,commandVersion=view.self.commandVersion;
 expect(()=>t.service.acknowledgePresentations(t.code,t.players[0]!.token,{...request,entries:[...request.entries,{historySeq:999,disposition:'SKIP'}]})).toThrow('当前没有');
 expect(t.service.find(t.code).revision).toBe(revision);
 const a=t.service.acknowledgePresentations(t.code,t.players[0]!.token,request);expect(a.revision).toBe(revision+1);
 expect(t.service.acknowledgePresentations(t.code,t.players[0]!.token,{...request,entries:[{historySeq:seq,disposition:'SKIP'}]})).toEqual(a);
 expect(t.view().self.commandVersion).toBe(commandVersion);expect(g.nomination).toEqual(before);
 expect(t.view().presentations.pending.some(p=>p.historySeq===seq)).toBe(false);
 expect(()=>t.service.acknowledgePresentations(t.code,t.players[0]!.token,{...request,gameId:'other-game'})).toThrow('对局已经变化');
});

test('schema4 migration preserves v3 and LEGACY start information; schema5 staging is stable',()=>{
 const t=table();const saved=t.service.snapshot(t.code);saved.schemaVersion=4;saved.game!.presentationVersion=3;
 const before=structuredClone(saved.game!.startInfo),restored=new RoomService();restored.restore([saved]);
 const next=restored.snapshot(t.code);expect(next.schemaVersion).toBe(5);expect(next.game!.presentationVersion).toBe(3);expect(next.game!.startInfo).toEqual(before);
 restored.restore([next]);expect(restored.snapshot(t.code)).toEqual(next);
});

test('runtime schema4 REQUIRED WAIT_ACK migration preserves team/bluffs and partially acknowledged gates exactly once',async()=>{
 let now=1_800_000_000_000;
 const service=new RoomService({now:()=>now,presentation:true}),code=service.create(7,'首夜迁移').room.code;
 const players=Array.from({length:7},(_,i)=>service.join(code,`首夜玩家${i+1}`,'PLAYER'));
 players.forEach(p=>service.setReady(code,p.token,true));service.startTutorial(code,players[0]!.token,'SKIP');
 const v3=service.snapshot(code);v3.game!.presentationVersion=3;delete v3.game!.openingNightVersion;v3.game!.presentationUntil=0;v3.game!.events=[];v3.game!.pendingPublications=[];delete v3.game!.publicProjection;initializePresentation(v3.game!,now);if(v3.metadata)delete v3.metadata.openingNightRulesVersion;service.restore([v3]);
 players.forEach(p=>service.confirmRole(code,p.token));now+=3850;service.advanceTime(now);
 const g=service.find(code).game!,entries=Object.entries(g.startInfo.entries);
 expect(g.startInfo).toMatchObject({mode:'REQUIRED',stage:'WAIT_ACK'});expect(entries).toHaveLength(2);
 const [acknowledgedSeat,acknowledgedInfo]=entries[0]!;
 service.acknowledgeStartInfo(code,players[Number(acknowledgedSeat)-1]!.token,acknowledgedInfo.infoId);
 const old=service.snapshot(code);old.schemaVersion=4;
 delete (old.game as Partial<typeof g>).presentationSeen;delete (old.game as Partial<typeof g>).roleNotifications;
 for(const history of Object.values(old.game!.privateHistory))for(const e of history)delete e.presentation;
 const before=structuredClone(old.game!.startInfo);let stored=structuredClone(old),commits=0;
 const repository:RoomRepository={async initialize(){},async loadAll(){return[structuredClone(stored)];},async commit(changed){commits++;stored=structuredClone(changed[0]!);},async close(){}};
 const runtime=new LiveRoomRuntime(repository,{now:()=>now,presentation:true});await runtime.initialize();
 expect(commits).toBe(1);expect(stored.schemaVersion).toBe(5);expect(stored.game!.presentationVersion).toBe(3);expect(stored.game!.startInfo).toEqual(before);
 const descriptorIds:string[]=[];
 for(const [seat,info]of Object.entries(before.entries)){
  const view=runtime.service.privateView(code,players[Number(seat)-1]!.token);
  expect(view.startInfo).toMatchObject({infoId:info.infoId,team:info.team,acknowledged:info.acknowledged});
  expect(view.startInfo!.bluffs.map(r=>r.roleId)).toEqual(info.bluffRoleIds);
  const scenes=view.history.filter(e=>e.presentation?.kind==='EVIL_START');
  expect(scenes).toHaveLength(info.acknowledged?0:1);
  if(!info.acknowledged){expect(scenes[0]!.presentation!.shown).toEqual({type:'EVIL_START',infoId:info.infoId});descriptorIds.push(scenes[0]!.presentation!.id);}
 }
 const second=new LiveRoomRuntime(repository,{now:()=>now,presentation:true});await second.initialize();
 expect(commits).toBe(1);expect(second.service.snapshot(code).game!.startInfo).toEqual(before);
 const nextIds=players.flatMap(p=>second.service.privateView(code,p.token).history.flatMap(e=>e.presentation?.kind==='EVIL_START'?[e.presentation.id]:[]));
 expect(nextIds).toEqual(descriptorIds);expect(nextIds).toHaveLength(1);
});

test('day succession changes rules immediately, tells successor at night end, and old demon only after public death',()=>{
 const t=table(['slayer','monk','chef','empath','scarlet_woman','imp'],true);t.day();
 t.service.useDayAbility(t.code,t.players[0]!.token,6);
 expect(t.service.find(t.code).assignments[4]!.roleId).toBe('imp');
 expect(t.view(5).role!.roleId).toBe('scarlet_woman');expect(t.scenes(5).some(p=>p.kind==='ROLE_CHANGE')).toBe(false);
 expect(t.scenes(6).some(p=>p.kind==='OLD_DEMON_CONTINUATION')).toBe(false);
 t.advance(1100);expect(t.view(5).role!.roleId).toBe('scarlet_woman');
 const own=t.scenes(6).find(p=>p.kind==='OLD_DEMON_CONTINUATION')!;expect(own.shown).toEqual({type:'CONTINUATION'});expect(JSON.stringify(own)).not.toMatch(/seat|changeId|scarlet|玩家5/);
 t.advance(2150);for(const seat of [1,2,3,4,5])t.service.readyToEndDay(t.code,t.players[seat-1]!.token,true);
 const night=t.service.find(t.code).game!.events.filter(e=>e.kind==='NIGHT_FALLS').at(-1)!;
 t.advance(night.startsAt+night.durationMs-t.now()-1);expect(t.view(5).role!.roleId).toBe('scarlet_woman');
 t.advance(1);expect(t.view(5).role!.roleId).toBe('imp');expect(t.scenes(5).filter(p=>p.kind==='ROLE_CHANGE')).toHaveLength(1);
 expect(t.view(5).action?.prompt).toContain('袭击');
});

test('other minion receives no automatic succession notification and no refreshed evil team',()=>{
 const t=table(['slayer','chef','empath','fortune_teller','monk','baron','scarlet_woman','imp'],true);t.day();const before=t.view(6).history;
 t.service.useDayAbility(t.code,t.players[0]!.token,8);t.advance(4000);
 expect(t.view(6).history).toEqual(before);expect(t.scenes(6).some(p=>['ROLE_CHANGE','OLD_DEMON_CONTINUATION'].includes(p.kind))).toBe(false);
});

test('night starpass informs successor immediately without a second kill or early old-demon receipt',()=>{
 const t=table(undefined,true);const saved=t.service.snapshot(t.code),g=saved.game!;
 g.phase='OTHER_NIGHT';g.day=1;g.confirmedRoleSeats=t.players.map(p=>p.participant.seat!);g.presentationUntil=0;g.pendingPublications=[];delete g.publicProjection;initializePresentation(g,t.now());t.service.restore([saved]);
 t.service.submitAction(t.code,t.players[5]!.token,[6]);
 expect(t.view(5).role!.roleId).toBe('imp');expect(t.scenes(5).some(p=>p.kind==='ROLE_CHANGE')).toBe(true);
 expect(t.view(5).action).toBeUndefined();expect(()=>t.service.submitAction(t.code,t.players[4]!.token,[1])).toThrow('no pending action');
 expect(t.scenes(6).some(p=>p.kind==='OLD_DEMON_CONTINUATION')).toBe(false);
 t.service.submitAction(t.code,t.players[2]!.token,[1,3]);
 const dawn=t.service.find(t.code).game!.events.find(e=>e.kind==='DAWN')!;
 t.advance(dawn.startsAt+1800-t.now()-1);expect(t.scenes(6).some(p=>p.kind==='OLD_DEMON_CONTINUATION')).toBe(false);
 t.advance(1);expect(t.scenes(6).some(p=>p.kind==='OLD_DEMON_CONTINUATION')).toBe(true);
});

test('ACK API uses current trusted seat, independent of gameplay context, and rejects old protocol and cross-origin',async()=>{
 const t=table(),display=t.service.join(t.code,'屏幕','DISPLAY');const saved=t.service.snapshot(t.code);let account:{sub:string;name:string}|null=null;
 saved.participants[0]!.accountId='trusted';
 const app=buildApp({timers:false,resolveAccount:async()=>account,repository:{async initialize(){},async loadAll(){return [saved];},async commit(){},async close(){}}});
 const seq=t.view().presentations.pending[0]!.historySeq,payload={token:t.players[0]!.token,roomInstanceId:saved.roomInstanceId,gameId:saved.game!.gameId,entries:[{historySeq:seq,disposition:'COMPLETE'}]},url=`/api/rooms/${t.code}/presentations/ack`;
 try{
  expect((await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'5'},payload})).statusCode).toBe(426);
  expect((await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'7'},payload})).statusCode).toBe(403);
  account={sub:'trusted',name:'账号'};
  expect((await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'7',origin:'https://evil.test'},payload})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'7'},payload:{...payload,token:display.token}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'7'},payload:{...payload,expectedCommandVersion:0}})).statusCode).toBe(400);
  const result=await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'7'},payload});expect(result.statusCode).toBe(200);expect(result.json().acked).toEqual(payload.entries);
  const repeat=await app.inject({method:'POST',url,headers:{'x-ravens-protocol':'7'},payload});expect(repeat.json()).toEqual(result.json());
 }finally{await app.close();}
});

test('receipt commit failure rolls back Seen and revision; exact retry persists once',async()=>{
 const t=table(),initial=t.service.snapshot(t.code);let stored:RoomRecord[]=[initial],fail=false,commits=0;
 const repo:RoomRepository={async initialize(){},async loadAll(){return structuredClone(stored);},async commit(changed){if(fail)throw Error('disk');commits++;stored=structuredClone(changed);},async close(){}};
 const runtime=new LiveRoomRuntime(repo,{presentation:false,now:t.now});await runtime.initialize();
 const view=runtime.service.privateView(t.code,t.players[0]!.token),request:PresentationAckRequest={roomInstanceId:view.roomInstanceId,gameId:initial.game!.gameId,entries:[{historySeq:view.presentations.pending[0]!.historySeq,disposition:'COMPLETE'}]};
 fail=true;await expect(runtime.execute(s=>s.acknowledgePresentations(t.code,t.players[0]!.token,request))).rejects.toThrow('暂时无法保存');
 expect(runtime.service.privateView(t.code,t.players[0]!.token).presentations.pending).toEqual(view.presentations.pending);
 fail=false;await runtime.execute(s=>s.acknowledgePresentations(t.code,t.players[0]!.token,request));const count=commits;
 await runtime.execute(s=>s.acknowledgePresentations(t.code,t.players[0]!.token,request));expect(commits).toBe(count);
});
