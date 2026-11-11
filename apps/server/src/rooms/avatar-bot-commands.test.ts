import {expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {avatarChoices,avatarIdentity,avatarSelectionUrl,type RoomCommandContext} from '@ravens/contracts';
import {roleById} from '@ravens/game-engine';
import {RoomService} from './service.js';
import {bots} from './bot-types.js';
import {runBotCommand} from './bot-commands.js';
import {initializePresentation} from './presentation.js';
import {LiveRoomRuntime} from '../game/live-runtime.js';
import {buildApp} from '../app.js';
const now=1800000000000,botSecret=process.env.SESSION_SECRET??"development-only-session-secret-change-me";
function mixedTable(){
 const service=new RoomService({now:()=>now,presentation:false,botSecret}),code=service.create(5,'本人').room.code,host=service.join(code,'本人','PLAYER');service.changeBots(code,host.token,{fill:true});
 for(const p of service.find(code).participants)service.setReady(code,p.controller==='BOT'?service.internalBotToken(service.find(code),p):host.token,true);
 service.startTutorial(code,host.token,'OPTIONAL');const room=service.find(code);room.assignments=['chef','empath','saint','monk','imp'].map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id,roleType:roleById(id).type,alignment:roleById(id).type==='DEMON'?'EVIL':'GOOD'}));
 for(const p of room.participants)service.completeTutorial(code,p.controller==='BOT'?service.internalBotToken(room,p):host.token);
 const game=room.game!;game.phase='DAY_DISCUSSION';game.day=1;game.presentationUntil=0;game.pendingPublications=[];game.startInfo={mode:'LEGACY',stage:'COMPLETE',entries:{}};delete game.publicProjection;initializePresentation(game,now);
 return{service,code,host};
}

test('human and bot random avatars are unique from lobby, including after human replacement',()=>{
 const s=new RoomService(),code=s.create(12,'房主').room.code,host=s.join(code,'房主','PLAYER');s.changeBots(code,host.token,{fill:true});
 let avatars=s.find(code).participants.map(p=>avatarIdentity(p.avatarSnapshot));expect(avatars.every(Boolean)).toBe(true);expect(new Set(avatars).size).toBe(12);
 const highest=bots(s.find(code)).find(p=>p.seat===12)!,kept=s.find(code).participants.filter(p=>p.id!==highest.id).map(p=>p.avatarSnapshot);
 const joined=s.join(code,'后来者','PLAYER');expect(joined.participant.seat).toBe(12);expect(s.find(code).participants.filter(p=>p.id!==joined.participant.id).map(p=>p.avatarSnapshot)).toEqual(kept);
 avatars=s.find(code).participants.map(p=>avatarIdentity(p.avatarSnapshot));expect(new Set(avatars).size).toBe(12);
});

test('concurrent hand selections have one winner and the rejected profile stays unchanged',async()=>{
 const runtime=new LiveRoomRuntime(undefined,{now:()=>now});let code='',one='',two='',target='';
 await runtime.execute(s=>{code=s.create(5,'甲').room.code;one=s.join(code,'甲','PLAYER',avatarChoices[0]!.url).token;two=s.join(code,'乙','PLAYER',avatarChoices[1]!.url).token;target=avatarChoices[2]!.url;});
 const results=await Promise.allSettled([runtime.execute(s=>s.updateGuestProfile(code,one,'甲改',target)),runtime.execute(s=>s.updateGuestProfile(code,two,'乙改',target))]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{errorCode:'AVATAR_TAKEN'}});expect(runtime.service.find(code).participants.find(p=>p.nickname==='乙')?.avatarSnapshot).toBe(avatarChoices[1]!.url);await runtime.close();
});

test('legacy duplicates and reconnect preserve the current avatar; old version identity is still reserved',()=>{
 const s=new RoomService(),code=s.create(5,'甲').room.code,host=s.join(code,'甲','PLAYER',avatarChoices[0]!.url),other=s.join(code,'乙','PLAYER',avatarChoices[1]!.url),room=s.find(code);
 room.participants[1]!.avatarSnapshot=room.participants[0]!.avatarSnapshot!;
 s.syncAccountProfile(room,room.participants[0]!,{sub:'user',name:'甲',picture:avatarChoices[2]!.url});expect(room.participants[0]!.avatarSnapshot).toBe(avatarChoices[0]!.url);
 s.updateGuestProfile(code,host.token,'甲改',avatarChoices[0]!.url);expect(room.participants[1]!.avatarSnapshot).toBe(avatarChoices[0]!.url);
 const old=avatarChoices[0]!.url.replace('/v3/','/v1/');expect(avatarSelectionUrl(old)).toBe(avatarChoices[0]!.url);expect(()=>s.updateGuestProfile(code,other.token,'乙改',old)).toThrow(/头像已被/);
});

test('account profile conflict is rejected before profile revision or any room changes',()=>{
 const s=new RoomService(),code=s.create(5,'甲').room.code,host=s.join(code,'甲','PLAYER',avatarChoices[0]!.url);s.join(code,'乙','PLAYER',avatarChoices[1]!.url);s.bindAccount(code,host.token,'owner','account-token');
 expect(()=>s.updateAccountProfile({sub:'owner',name:'甲'},'甲改',avatarChoices[1]!.url,0)).toThrow(/头像已被/);expect(s.accountProfile('owner')).toBeUndefined();expect(s.find(code).participants[0]!.nickname).toBe('甲');
});

test('END_DAY applies only eligible bots and never silently readies the human',()=>{
 const t=mixedTable(),result=runBotCommand(t.service,t.code,t.host.token,'END_DAY');expect(result).toMatchObject({status:'APPLIED',executedCount:4});expect(t.service.find(t.code).game!.readySeats.sort()).toEqual([2,3,4,5]);expect(t.service.find(t.code).game!.phase).toBe('DAY_DISCUSSION');expect(runBotCommand(t.service,t.code,t.host.token,'END_DAY')).toMatchObject({status:'UNCHANGED',executedCount:0});
 expect(()=>runBotCommand(t.service,t.code,t.host.token,'END_DAY',2)).toThrow(/无需选择目标/);
});

test('one nomination follows the legal actor/target rules and same command id only executes once',async()=>{
 const t=mixedTable(),runtime=new LiveRoomRuntime(undefined,{now:()=>now,presentation:false,botSecret});runtime.service.restore([t.service.snapshot(t.code)]);const v=runtime.service.privateView(t.code,t.host.token),context:RoomCommandContext={roomInstanceId:v.roomInstanceId,setupId:v.setupId,expectedCommandVersion:v.self.commandVersion,gameId:v.game!.gameId,contextId:v.contextId!};
 const receipt={code:t.code,id:randomUUID(),actor:t.host.token,fingerprint:'nominate-test',requireHost:true,context};
 const execute=()=>runtime.execute(s=>{s.validateControlCommand(t.code,t.host.token,context,t.service.find(t.code).botControl.version,true);return runBotCommand(s,t.code,t.host.token,'NOMINATE_ONCE',1);},receipt);
 const first=await execute();expect(first).toMatchObject({actorSeat:2,actorNickname:'人机·01',executedCount:1});expect(first.message).toContain('【玩家2-人机·01】');expect(await execute()).toEqual(first);expect(runtime.service.find(t.code).game!.events.filter(e=>e.kind==='NOMINATION')).toHaveLength(1);
 expect(()=>runBotCommand(runtime.service,t.code,t.host.token,'NOMINATE_ONCE')).toThrow(/提名资格/);expect(()=>runBotCommand(runtime.service,t.code,t.host.token,'END_DAY')).toThrow(/完成当前表决/);await runtime.close();
});

test('shooting is a public legal claim, selects no secret Slayer and returns no unpublished outcome',()=>{
 const t=mixedTable(),result=runBotCommand(t.service,t.code,t.host.token,'SHOOT_ONCE',1);expect(result.actorSeat).toBe(2);expect(t.service.find(t.code).assignments.find(p=>p.seat===2)!.roleId).toBe('empath');expect(t.service.find(t.code).game!.claimDayBySeat[2]).toBe(1);
 expect(Object.keys(result).sort()).toEqual(['actorNickname','actorSeat','executedCount','message','status']);expect(JSON.stringify(result)).not.toMatch(/empath|imp|DEATH|NO_DEATH|targetSeat|roleId/);
 expect(()=>runBotCommand(t.service,t.code,t.service.internalBotToken(t.service.find(t.code),bots(t.service.find(t.code))[0]!), 'SHOOT_ONCE',1)).toThrow(/现任房主/);
});

test('new summary reserves current avatar identities and external commands enforce the ordinary control context',async()=>{
 const t=mixedTable(),snapshot=t.service.snapshot(t.code),app=buildApp({timers:false,presentation:false,repository:{initialize:async()=>{},loadAll:async()=>[snapshot],commit:async()=>{},close:async()=>{}}});
 try{
 const summary=(await app.inject({url:`/api/rooms/${t.code}/summary`})).json();expect(summary.occupiedAvatars).toHaveLength(5);expect(JSON.stringify(summary)).not.toMatch(/tokenHash|roleId|nickname|participants/);
 const protocol={'x-ravens-protocol':'4'},v=(await app.inject({url:`/api/rooms/${t.code}/me?token=${t.host.token}`,headers:protocol})).json(),payload={token:t.host.token,roomInstanceId:v.roomInstanceId,setupId:v.setupId,expectedCommandVersion:v.self.commandVersion,expectedControlVersion:v.room.botControl.version,gameId:v.game.gameId,contextId:v.contextId,command:'NOMINATE_ONCE',targetSeat:1},id=randomUUID();
 const request={method:'POST' as const,url:`/api/rooms/${t.code}/bots/command`,headers:{...protocol,'x-command-id':id},payload};const first=await app.inject(request);expect(first.statusCode,first.json().error).toBe(200);expect(first.json().controlResult.executedCount).toBe(1);expect((await app.inject(request)).json().controlResult).toEqual(first.json().controlResult);
 const invalid=await app.inject({...request,headers:{...protocol,'x-command-id':randomUUID()}});expect(invalid.statusCode).toBe(409);
 }finally{await app.close();}
});


test.each([['washerwoman',false],['librarian',false],['investigator',false],['washerwoman',true],['librarian',true],['investigator',true],['drunk',true]] as const)('structured %s clues preserve the exact shown candidate group, impaired=%s', (ownRole,impaired)=>{
 const s=new RoomService({presentation:false,now:()=>now}),code=s.create(6,'线索测试').room.code,players=Array.from({length:6},(_,i)=>s.join(code,`昵称${i+1}`,'PLAYER'));
 for(const p of players)s.setReady(code,p.token,true);s.startTutorial(code,players[0]!.token,'OPTIONAL');
 const room=s.find(code),ids=[ownRole,'monk','saint','butler','poisoner','imp'];room.assignments=ids.map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id==='drunk'?'investigator':id,roleType:roleById(id).type,alignment:['MINION','DEMON'].includes(roleById(id).type)?'EVIL':'GOOD'}));
 for(const p of players)s.completeTutorial(code,p.token);room.game!.storytellerSeed='structured-shown-fixture';for(const p of players)s.confirmRole(code,p.token);
 s.submitAction(code,players[4]!.token,[impaired?1:2]);s.submitAction(code,players[3]!.token,[2]);
 const own=s.privateView(code,players[0]!.token),entry=own.history.find(e=>e.candidateGroup)!;expect(entry).toBeDefined();const group=entry.candidateGroup!;
 expect(group.kind).toBe('ONE_OF');expect(group.seats).toHaveLength(2);expect(group.seats).toEqual(entry.targetSeats);expect(entry.text).toContain(`有一位是${group.roleName}`);for(const seat of group.seats)expect(entry.text).toContain(`【玩家${seat}-昵称${seat}】`);
 expect(s.privateView(code,players[1]!.token).history.some(e=>e.candidateGroup)).toBe(false);expect(JSON.stringify(group)).not.toMatch(/truthful|impaired|roleId|targetSeat|decoySeat/);
 const shown=JSON.stringify(group);for(const a of room.assignments.filter(a=>a.seat!==1)){a.roleId='imp';a.roleType='DEMON';a.alignment='EVIL';}expect(JSON.stringify(s.privateView(code,players[0]!.token).history.find(e=>e.candidateGroup)!.candidateGroup)).toBe(shown);
 const legacy=s.snapshot(code);for(const e of legacy.game!.privateHistory[1]!)delete e.candidateGroup;const restored=new RoomService({now:()=>now,presentation:false,botSecret});restored.restore([legacy]);expect(restored.privateView(code,players[0]!.token).history.some(e=>e.candidateGroup)).toBe(false);
});


test('legacy pending avatar cannot overwrite a new join reservation or alter existing duplicate avatars',()=>{
 const s=new RoomService(),code=s.create(5,'甲').room.code,host=s.join(code,'甲','PLAYER',avatarChoices[0]!.url);s.join(code,'乙','PLAYER',avatarChoices[1]!.url);
 const legacy=s.snapshot(code);legacy.participants[1]!.avatarSnapshot=avatarChoices[0]!.url;legacy.participants[0]!.pendingProfile={nickname:'旧待应用昵称',avatar:avatarChoices[2]!.url};s.restore([legacy]);
 const joined=s.join(code,'新玩家','PLAYER',avatarChoices[2]!.url),room=s.find(code),owner=room.participants.find(p=>p.id===host.participant.id)!;
 expect(owner.avatarSnapshot).toBe(avatarChoices[0]!.url);expect(owner.pendingProfile).toBeUndefined();expect(owner.nickname).toBe('旧待应用昵称');expect(room.organizerName).toBe('旧待应用昵称');
 expect(room.participants.filter(p=>p.avatarSnapshot===avatarChoices[0]!.url)).toHaveLength(2);expect(room.participants.filter(p=>p.avatarSnapshot===avatarChoices[2]!.url).map(p=>p.id)).toEqual([joined.participant.id]);
});
