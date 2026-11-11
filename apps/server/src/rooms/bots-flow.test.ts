import {expect,test} from 'vitest';
import {ROLE_CATALOG} from '@ravens/game-engine';
import type {PrivateView} from '@ravens/contracts';
import {RoomService} from './service.js';
import {runBots,stepBot} from './bot-scheduler.js';
import {bots,type BotMemory} from './bot-types.js';
import {chooseBotAction,type BotIntent} from './bot-policy.js';
import {initializePresentation} from './presentation.js';
import {inviteWhisper,leaveWhisper,socialView,sendWhisper} from './social.js';
import {LiveRoomRuntime,type CommandReceipt} from '../game/live-runtime.js';

function fixture(count=5){let now=1800000000000;const service=new RoomService({now:()=>now,presentation:true});const code=service.create(count,'真人').room.code,host=service.join(code,'真人','PLAYER');service.changeBots(code,host.token,{fill:true});return{service,code,host,now:()=>now,tick(ms=500){now+=ms;service.pulse(code,host.token,now);service.advanceTime(now);runBots(service);},day(){const room=service.find(code),g=room.game!;g.phase='DAY_DISCUSSION';g.day=1;g.presentationUntil=0;delete g.publicProjection;g.pendingPublications=[];initializePresentation(g,now);}};}
function apply(s:RoomService,code:string,token:string,intent:BotIntent){switch(intent.kind){case'READY':s.setReady(code,token,true);break;case'TUTORIAL_COMPLETE':s.completeTutorial(code,token);break;case'CONFIRM_ROLE':s.confirmRole(code,token);break;case'NIGHT_ACTION':s.submitAction(code,token,intent.args.targets!);break;case'NOMINATE':s.nominate(code,token,intent.args.targets![0]!);break;case'VOTE':s.vote(code,token,intent.args.raised!);break;case'DAY_READY':s.readyToEndDay(code,token);break;case'SLAYER':s.useDayAbility(code,token,intent.args.targets![0]!);break;}}

test.each([5,6,12])('one human plus bots completes a genuine %i-seat game and resets to the same lobby',count=>{
 const t=fixture(count),s=t.service,m:BotMemory={knownTeamSeats:[],ackedHumanMessageIds:[]};for(let i=0;i<24;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'OPTIONAL');
 let finished=false;
 for(let tick=0;tick<12000;tick++){
  const room=s.find(t.code),v={...s.privateView(t.code,t.host.token),room:s.publicView(t.code),...socialView(room,t.host.token)} as unknown as PrivateView;
  const intent=chooseBotAction({view:v,memory:m,seed:'human-test-policy',now:s.gameNow(room),slow:false});
  if(intent){apply(s,t.code,t.host.token,intent);if(intent.kind==='VOTE'){const id=v.game!.nomination!.ballotId!;m.ballot={ballotId:id,initialSubmitted:true,correctionCount:0,lastRaised:intent.args.raised!};}}
  if(v.game?.phase==='GAME_OVER'&&v.game.revealComplete){finished=true;break;}
  t.tick();
 }
 expect(finished,`stuck in ${s.publicView(t.code).game?.phase}`).toBe(true);expect(s.snapshot(t.code).lastResult?.hadBots).toBe(true);
 s.reset(t.code,t.host.token);const next=s.snapshot(t.code);expect(next.state).toBe('LOBBY');expect(bots(next)).toHaveLength(count-1);expect(next.botControl.memory).toEqual({});expect(next.botControl.pending).toEqual([]);expect(next.game).toBeUndefined();
},20000);

test.each(ROLE_CATALOG.map(role=>role.id))('policy selects only distinct legitimate targets for self-perceived %s',roleId=>{
 const t=fixture(),s=t.service;for(let i=0;i<16;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'SKIP');const v=s.privateView(t.code,s.internalBotToken(s.find(t.code),bots(s.find(t.code))[0]!)) as unknown as PrivateView;
 v.role={...v.role!,roleId};v.game!.phase='OTHER_NIGHT';v.game!.presentationUntil=0;v.action={kind:'SELECT_TWO',legalSeats:[1,3,5],minTargets:2,maxTargets:2,prompt:'选择目标'};
 const observation={view:v,memory:{knownTeamSeats:[],ackedHumanMessageIds:[]},seed:'same-observation',now:t.now(),slow:false};const result=chooseBotAction(observation)!;expect(result.kind).toBe('NIGHT_ACTION');expect(result.args.targets).toHaveLength(2);expect(new Set(result.args.targets).size).toBe(2);expect(result.args.targets!.every(seat=>v.action!.legalSeats.includes(seat))).toBe(true);
 const before=JSON.stringify(observation);s.find(t.code).assignments.reverse();expect(chooseBotAction(observation)).toEqual(result);expect(JSON.stringify(observation)).toBe(before);
});

test('withdrawn invitation and ended conversation drop pending bot work without pausing the room',()=>{
 const t=fixture(),s=t.service;for(let i=0;i<16;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'SKIP');t.day();
 inviteWhisper(s.find(t.code),t.host.token,2);runBots(s);expect(s.find(t.code).botControl.pending.some(task=>task.kind==='WHISPER_ACCEPT')).toBe(true);leaveWhisper(s.find(t.code),t.host.token);t.tick(1000);expect(s.find(t.code).botControl.attentionRequired).toBe(false);expect(s.find(t.code).botControl.mode).toBe('RUNNING');
 inviteWhisper(s.find(t.code),t.host.token,2);t.tick();t.tick(1000);expect(socialView(s.find(t.code),t.host.token).social.activeWhisper).toBeDefined();const active=socialView(s.find(t.code),t.host.token).social.activeWhisper!;sendWhisper(s.find(t.code),t.host.token,active.id,'测试');runBots(s);expect(s.find(t.code).botControl.pending.some(task=>task.kind==='WHISPER_REPLY')).toBe(true);leaveWhisper(s.find(t.code),t.host.token);t.tick(1000);expect(s.find(t.code).botControl.attentionRequired).toBe(false);
});

test('manual shooting pauses ballot in game time and each advance counts at most one new seat',()=>{
 const t=fixture(),s=t.service;for(let i=0;i<16;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'SKIP');t.day();s.changeRehearsalClock(t.code,t.host.token,'MANUAL');s.nominate(t.code,t.host.token,2);while((s.find(t.code).game!.presentationUntil??0)>s.gameNow(s.find(t.code)))s.advanceRehearsal(t.code,t.host.token);
 t.tick(60000);const before=s.find(t.code).game!.nomination!.voteEndsAt!;s.useDayAbility(t.code,t.host.token,3);expect(s.find(t.code).game!.nomination!.voteEndsAt).toBeGreaterThan(before);
 for(let i=0;i<15&&s.find(t.code).game!.nomination;i++){const count=s.find(t.code).game!.nomination?.countedSeats?.length??0;s.advanceRehearsal(t.code,t.host.token);if(s.find(t.code).game!.nomination)expect((s.find(t.code).game!.nomination!.countedSeats?.length??0)-count).toBeLessThanOrEqual(1);}
});

test('WAITING step receipts survive a failed bot command rollback and replay once',async()=>{
 const t=fixture(),s=t.service;for(let i=0;i<16;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'SKIP');t.day();s.changeBotControl(t.code,t.host.token,'PAUSED');const room=s.find(t.code),bot=bots(room)[0]!;
 // Structurally valid stale business target reaches the ordinary error/rollback path.
 room.botControl.pending=[{id:'rollback-task',botId:bot.id,sequence:1,controlGeneration:room.botControl.generation,roomInstanceId:room.roomInstanceId,setupId:room.setupId,gameId:room.game!.gameId,contextId:room.game!.publicProjection!.contextId,expectedBotCommandVersion:bot.commandVersion,kind:'NOMINATE',args:{targets:[12]},dueGameAt:t.now()}];
 const runtime=new LiveRoomRuntime(undefined,{now:t.now,presentation:true});runtime.service.restore([s.snapshot(t.code)]);const v=runtime.service.privateView(t.code,t.host.token),context={roomInstanceId:v.roomInstanceId,setupId:v.setupId,expectedCommandVersion:v.self.commandVersion};const receipt:CommandReceipt={code:t.code,id:'single-step-retry',actor:t.host.token,fingerprint:'single-step',requireHost:true,context};
 const result=await runtime.execute(stage=>stepBot(stage,t.code,t.host.token),receipt);expect(result.status).toBe('WAITING');const revision=runtime.service.find(t.code).revision;expect(await runtime.execute(()=>{throw Error('duplicate execution');},receipt)).toEqual(result);expect(runtime.service.find(t.code).revision).toBe(revision);await runtime.close();
});

test('Butler initial vote and one correction survive pause, pace generation changes and restart',()=>{
 const t=fixture(),s=t.service;for(let i=0;i<16;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'SKIP');t.day();const room=s.find(t.code),bot=bots(room).find(p=>p.seat===2)!;Object.assign(room.assignments.find(a=>a.seat===2)!,{roleId:'butler',perceivedRoleId:'butler',roleType:'OUTSIDER',alignment:'GOOD'});room.game!.butlerMasterSeat=1;s.nominate(t.code,s.internalBotToken(room,bot),3);
 for(let i=0;i<14;i++)t.tick();expect(room.botControl.memory[bot.id]!.ballot?.initialSubmitted).toBe(true);expect(room.botControl.memory[bot.id]!.ballot?.lastRaised).toBe(false);s.changeBotControl(t.code,t.host.token,'PAUSED');s.changeBotControl(t.code,t.host.token,undefined,'SLOW');const restored=new RoomService({now:t.now,presentation:true});restored.restore([s.snapshot(t.code)]);restored.vote(t.code,t.host.token,true);expect(stepBot(restored,t.code,t.host.token).status).toBe('APPLIED');const prior=restored.find(t.code).botControl.memory[bot.id]!.ballot!;expect(prior.correctionCount).toBe(1);expect(prior.lastRaised).toBe(true);restored.changeBotControl(t.code,t.host.token,'RUNNING');restored.changeBotControl(t.code,t.host.token,'PAUSED');restored.vote(t.code,t.host.token,false);expect(stepBot(restored,t.code,t.host.token).status).toBe('WAITING');expect(restored.find(t.code).botControl.memory[bot.id]!.ballot!.correctionCount).toBe(1);
});

test('night target tiers outrank accumulated public scores and Imp self-sacrifice stays the last fallback',()=>{
 const t=fixture(),s=t.service;for(let i=0;i<16;i++)t.tick();s.setReady(t.code,t.host.token,true);s.startTutorial(t.code,t.host.token,'SKIP');const bot=bots(s.find(t.code)).find(p=>p.seat===2)!,v=s.privateView(t.code,s.internalBotToken(s.find(t.code),bot)) as unknown as PrivateView;v.role={...v.role!,roleId:'imp'};v.game!.phase='OTHER_NIGHT';v.game!.presentationUntil=0;v.game!.seats=v.game!.seats.map(p=>({...p,alive:[2,3,4].includes(p.seat)}));v.action={kind:'SELECT_ONE',legalSeats:[1,2,3,4,5],minTargets:1,maxTargets:1,prompt:'选择目标'};const o={view:v,memory:{knownTeamSeats:[3,4],ackedHumanMessageIds:[]},seed:'tier-test',now:t.now(),slow:false};expect(chooseBotAction(o)!.args.targets).not.toContain(2);v.game!.events=Array.from({length:50},(_,i)=>({seq:i,message:'公开提名',kind:'NOMINATION' as const,actorSeat:1,targetSeat:2}));o.memory.knownTeamSeats=[];expect([3,4]).toContain(chooseBotAction(o)!.args.targets![0]);v.action.legalSeats=[2];expect(chooseBotAction(o)!.args.targets).toEqual([2]);
});
