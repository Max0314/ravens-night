import {expect,test} from 'vitest';
import type {PrivateView} from '@ravens/contracts';
import {roleById} from '@ravens/game-engine';
import {RoomService,type RoomRecord} from './service.js';
import {initializePresentation} from './presentation.js';

const ORIGIN=1800000000000;
function table(options:{cinematic?:boolean;bots?:boolean;deadSeats?:number[];spentGhostSeats?:number[];butler?:boolean}={}) {
  let wall=ORIGIN;
  const settings={now:()=>wall,presentation:options.cinematic??false};
  let service=new RoomService(settings);
  const code=service.create(6,'测试房主').room.code,host=service.join(code,'玩家1','PLAYER');
  const tokens=new Map<number,string>([[1,host.token]]);
  if(options.bots){
    service.changeBots(code,host.token,{fill:true});
    for(const p of service.find(code).participants.filter(p=>p.controller==='BOT'))tokens.set(p.seat!,service.internalBotToken(service.find(code),p));
  }else for(let seat=2;seat<=6;seat++)tokens.set(seat,service.join(code,`玩家${seat}`,'PLAYER').token);
  for(const token of tokens.values())service.setReady(code,token,true);
  service.startTutorial(code,host.token,'SKIP');
  const snapshot=service.snapshot(code),g=snapshot.game!;
  const roles=['slayer',options.butler?'butler':'chef','empath','saint','baron','imp'];
  snapshot.assignments=roles.map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id,roleType:roleById(id).type,alignment:i>=4?'EVIL':'GOOD'}));
  g.presentationVersion=4;g.phase='DAY_DISCUSSION';g.day=1;
  g.startInfo={mode:'LEGACY',stage:'COMPLETE',entries:{}};
  g.confirmedRoleSeats=[1,2,3,4,5,6];g.aliveSeats=[1,2,3,4,5,6].filter(seat=>!options.deadSeats?.includes(seat));
  g.ghostVoteSeats=[1,2,3,4,5,6].filter(seat=>!options.spentGhostSeats?.includes(seat));
  g.presentationUntil=0;g.phaseDeadlineAt=wall+600000;g.events=[];g.pendingPublications=[];g.voteSubmissions={};
  if(options.butler)g.butlerMasterSeat=3;
  delete g.publicProjection;initializePresentation(g,wall);service.restore([snapshot]);
  const game=()=>service.publicView(code).game!;
  const mine=(seat:number):PrivateView=>service.privateView(code,tokens.get(seat)!) as PrivateView;
  const ballot=()=>game().nomination!;
  const result=()=>game().events.filter(event=>event.kind==='VOTE_RESULT').at(-1)!;
  const advance=(ms:number)=>{wall+=ms;service.advanceTime(wall);};
  const choose=(raisedSeats:number[]=[])=>{for(const p of game().seats.filter(p=>p.alive||p.ghostVoteAvailable))service.vote(code,tokens.get(p.seat)!,raisedSeats.includes(p.seat));};
  const nominate=(from=1,to=2)=>service.nominate(code,tokens.get(from)!,to);
  const finish=(seat=2)=>service.finishDefense(code,tokens.get(seat)!);
  const restart=()=>{const saved=JSON.parse(JSON.stringify(service.snapshot(code))) as RoomRecord;const restored=new RoomService(settings);restored.restore([saved]);service=restored;};
  return {get service(){return service;},code,tokens,host,game,mine,ballot,result,advance,choose,nominate,finish,restart,wallNow:()=>wall};
}

test('new ballots retain 20 seconds of preparation plus a common 8-second finish even with cinematics disabled',()=>{
  const t=table();t.nominate();const b=t.ballot();
  expect(b).toMatchObject({mode:'SIMULTANEOUS',defenseFinished:false,countdownStarted:false,preparationEndsAt:ORIGIN+20000,voteStartsAt:ORIGIN+20000,voteEndsAt:ORIGIN+28000});
  expect(t.mine(1).voteSubmitted).toBe(false);t.advance(20000);expect(t.ballot().countdownStarted).toBe(true);expect(t.game().phase).toBe('VOTING');
  t.advance(7999);expect(t.game().phase).toBe('VOTING');expect(t.ballot().currentVoterSeat).toBeUndefined();
  t.advance(1);expect(t.game().phase).toBe('NOMINATION');expect(t.result()).toMatchObject({votes:0,threshold:3,seats:[]});
});

test('every explicit false is submitted, but all choices alone cannot terminate the defense',()=>{
  const t=table();t.nominate();t.choose();
  expect(t.ballot().votesReceived).toBe(6);for(let seat=1;seat<=6;seat++){expect(t.mine(seat).voteSubmitted).toBe(true);expect(t.mine(seat).voteRaised).toBe(false);}
  expect(t.ballot().defenseFinished).toBe(false);expect(t.ballot().countdownStarted).toBe(false);expect(t.ballot().voteStartsAt).toBe(ORIGIN+20000);
  t.advance(19999);expect(t.ballot().countdownStarted).toBe(false);t.advance(1);expect(t.ballot().countdownStarted).toBe(true);
});

test('finishing defense first waits for the last explicit choice, including false, before starting 8 seconds',()=>{
  const t=table();t.nominate();t.finish();expect(t.ballot().defenseFinished).toBe(true);expect(t.ballot().countdownStarted).toBe(false);
  for(let seat=1;seat<6;seat++)t.service.vote(t.code,t.tokens.get(seat)!,false);
  t.advance(4000);expect(t.ballot().countdownStarted).toBe(false);t.service.vote(t.code,t.tokens.get(6)!,false);
  expect(t.ballot()).toMatchObject({countdownStarted:true,voteStartsAt:ORIGIN+4000,voteEndsAt:ORIGIN+12000});
  t.advance(8000);expect(t.result().votes).toBe(0);
});

test('all choices first can start early only when the actual nominee finishes defense',()=>{
  const t=table();t.nominate();t.choose([1,2,3]);t.advance(3000);
  expect(()=>t.finish(1)).toThrow(/被提名者/);expect(t.ballot().countdownStarted).toBe(false);t.finish(2);
  expect(t.ballot()).toMatchObject({defenseFinished:true,countdownStarted:true,voteStartsAt:ORIGIN+3000,voteEndsAt:ORIGIN+11000});
  expect(t.mine(2).canFinishDefense).toBe(false);
});

test('missing choices still enter the last 8 seconds exactly at the original 20-second fallback',()=>{
  const t=table();t.nominate();t.finish();t.service.vote(t.code,t.tokens.get(1)!,true);t.advance(19999);
  expect(t.ballot().countdownStarted).toBe(false);t.advance(1);expect(t.ballot()).toMatchObject({countdownStarted:true,voteStartsAt:ORIGIN+20000,voteEndsAt:ORIGIN+28000});
  t.advance(8000);expect(t.result()).toMatchObject({votes:1,seats:[1]});
});

test('last-second edits do not restart 8 seconds and every seat locks at the same absolute millisecond',()=>{
  const t=table();t.nominate();t.choose();t.finish();const end=t.ballot().voteEndsAt!;
  t.advance(3500);t.service.vote(t.code,t.tokens.get(1)!,true);expect(t.ballot().voteEndsAt).toBe(end);
  t.advance(4499);for(let seat=1;seat<=6;seat++){expect(t.mine(seat).canVote).toBe(true);t.service.vote(t.code,t.tokens.get(seat)!,seat<=3);}
  expect(t.ballot().currentVoterSeat).toBeUndefined();expect(t.ballot().voteEndsAt).toBe(end);t.advance(1);
  for(let seat=1;seat<=6;seat++){expect(t.mine(seat).canVote).toBe(false);expect(()=>t.service.vote(t.code,t.tokens.get(seat)!,false)).toThrow();}
  expect(t.result()).toMatchObject({votes:3,seats:[1,2,3],threshold:3});
});

test.each([false,true])('a dead player explicitly choosing %s spends a ghost vote only if finally counted as raised',raised=>{
  const t=table({deadSeats:[4,5],spentGhostSeats:[4]});t.nominate();
  expect(()=>t.service.vote(t.code,t.tokens.get(4)!,true)).toThrow(/ghost|鬼/i);
  t.choose(raised?[5]:[]);expect(t.ballot().votesReceived).toBe(5);expect(t.mine(5).voteSubmitted).toBe(true);t.finish();
  t.advance(7999);expect(t.game().seats.find(p=>p.seat===5)!.ghostVoteAvailable).toBe(true);t.advance(1);
  expect(t.game().seats.find(p=>p.seat===5)!.ghostVoteAvailable).toBe(!raised);expect(t.result()).toMatchObject({votes:raised?1:0,threshold:2,seats:raised?[5]:[]});
});

test('Butler reminders stay private and the same public raised hand earns the same vote as another role',()=>{
  const butler=table({butler:true}),ordinary=table();
  for(const t of [butler,ordinary]){t.nominate();t.choose([2]);t.finish();t.advance(8000);}
  for(const t of [butler,ordinary])expect(t.result()).toMatchObject({votes:1,seats:[2],threshold:3,outcome:'NONE'});
  expect(butler.mine(2).history.some(entry=>entry.text.includes('按管家规则'))).toBe(true);expect(butler.mine(1).history.some(entry=>entry.text.includes('按管家规则'))).toBe(false);
  expect(JSON.stringify(butler.service.publicView(butler.code))).not.toContain('管家');
});

test('a shot during preparation immediately publishes shifted ballot clocks while its real death and victory stay hidden',()=>{
  const t=table({cinematic:true});t.nominate();t.advance(5000);const before={...t.ballot()};t.service.useDayAbility(t.code,t.tokens.get(1)!,6);
  const shot=t.service.snapshot(t.code).game!.events.find(event=>event.kind==='SHOT')!,delay=shot.startsAt+shot.durationMs-shot.occurredAt;
  expect(t.service.snapshot(t.code).game!.aliveSeats).not.toContain(6);
  expect(t.ballot()).toMatchObject({mode:'SIMULTANEOUS',countdownStarted:false,preparationEndsAt:before.preparationEndsAt!+delay,voteStartsAt:before.voteStartsAt!+delay,voteEndsAt:before.voteEndsAt!+delay});
  expect(t.game().presentationUntil).toBe(shot.startsAt+shot.durationMs);expect(t.game().phase).toBe('VOTING');expect(t.game().aliveCount).toBe(6);expect(t.game().winner).toBeUndefined();expect(t.game().events.some(event=>event.kind==='SHOT')).toBe(false);
});

test('a shot during the last 8 seconds pauses the public anchors and survives restart without restarting the countdown',()=>{
  const t=table({cinematic:true});t.nominate();t.choose();t.finish();t.advance(3000);const before={...t.ballot()};t.service.useDayAbility(t.code,t.tokens.get(1)!,3);
  const shot=t.service.snapshot(t.code).game!.events.find(event=>event.kind==='SHOT')!,delay=shot.startsAt+shot.durationMs-shot.occurredAt,newEnd=before.voteEndsAt!+delay;
  expect(t.ballot()).toMatchObject({countdownStarted:true,voteStartsAt:before.voteStartsAt!+delay,voteEndsAt:newEnd});expect(t.game().presentationUntil).toBe(shot.startsAt+shot.durationMs);
  t.restart();expect(t.ballot().voteEndsAt).toBe(newEnd);t.advance(delay);expect(t.game().phase).toBe('VOTING');expect(t.ballot().voteEndsAt!-t.game().serverNow!).toBe(5000);
  t.advance(4999);expect(t.game().phase).toBe('VOTING');t.advance(1);expect(t.game().phase).toBe('NOMINATION');expect(t.result().votes).toBe(0);
});

test('restoring a genuine old mode-less ballot preserves its original 20-second defense and 1500ms seat clocks',()=>{
  const t=table({cinematic:true});t.nominate();const old=t.service.snapshot(t.code),g=old.game!,voterOrder=[3,4,5,6,1,2];
  const legacy={ballotId:g.nomination!.ballotId,nominatorSeat:1,nomineeSeat:2,defenseUntil:ORIGIN+20000,voteStartsAt:ORIGIN+20000,voteEndsAt:ORIGIN+29000,nextCountAt:ORIGIN+21500,voteStarted:false,voterOrder,countedSeats:[] as number[],countedVotes:{} as Record<number,boolean>};
  g.nomination=legacy;g.voteSubmissions={};g.phaseDeadlineAt=legacy.voteEndsAt;g.pendingPublications=[];g.publicProjection!.nomination=structuredClone(legacy);g.publicProjection!.voteSubmissions={};g.publicProjection!.phaseDeadlineAt=legacy.voteEndsAt;
  if(old.metadata)delete old.metadata.ballotRulesVersion;t.service.restore([JSON.parse(JSON.stringify(old)) as RoomRecord]);t.choose([1,2,3,4,5,6]);
  expect(t.ballot().mode).toBeUndefined();expect(t.ballot().voteStartsAt).toBe(ORIGIN+20000);expect(t.ballot().voteEndsAt).toBe(ORIGIN+29000);
  t.advance(20000);expect(t.ballot().countedSeats).toEqual([]);t.advance(1499);expect(t.ballot().countedSeats).toEqual([]);t.advance(1);expect(t.ballot().countedSeats).toEqual([3]);
  expect(t.service.snapshot(t.code).metadata?.ballotRulesVersion).toBeUndefined();
});

test('MANUAL restore stays frozen and an early countdown advances to its real end rather than the obsolete defense boundary',()=>{
  const t=table({bots:true});t.nominate();t.advance(15000);t.service.changeRehearsalClock(t.code,t.host.token,'MANUAL');t.choose();t.finish();
  expect(t.ballot()).toMatchObject({voteStartsAt:ORIGIN+15000,voteEndsAt:ORIGIN+23000});t.restart();t.advance(60000);expect(t.game().serverNow).toBe(ORIGIN+15000);expect(t.game().phase).toBe('VOTING');
  expect(t.service.advanceRehearsal(t.code,t.host.token).status).toBe('ADVANCED');expect(t.game().serverNow).toBe(ORIGIN+23000);expect(t.game().phase).toBe('NOMINATION');expect(t.result().votes).toBe(0);
});

test('simultaneous tallies retain ceil(alive/2), the daily maximum and a tie at that maximum',()=>{
  const t=table();
  const round=(from:number,to:number,raised:number[])=>{t.nominate(from,to);t.choose(raised);t.finish(to);t.advance(8000);};
  round(1,4,[1,2]);expect(t.result()).toMatchObject({votes:2,threshold:3,outcome:'NONE'});expect(t.game().onBlock).toBeUndefined();
  round(2,5,[1,2,3]);expect(t.game().onBlock).toEqual({seat:5,votes:3});expect(t.game().executionTied).toBe(false);
  round(3,6,[1,2,3]);expect(t.game().executionTied).toBe(true);expect(t.result()).toMatchObject({votes:3,threshold:3,outcome:'TIED'});
});

test('the forward-only ballot capability marker is persisted before settlement and survives settlement, restore and reset',()=>{
  const t=table();t.nominate();expect(t.service.snapshot(t.code).metadata?.ballotRulesVersion).toBe(2);t.choose();t.finish();t.advance(8000);
  expect(t.game().nomination).toBeUndefined();expect(t.service.snapshot(t.code).metadata?.ballotRulesVersion).toBe(2);t.restart();expect(t.service.snapshot(t.code).metadata?.ballotRulesVersion).toBe(2);
  t.service.abort(t.code,t.host.token);t.service.reset(t.code,t.host.token);expect(t.service.publicView(t.code).state).toBe('LOBBY');expect(t.service.snapshot(t.code).metadata?.ballotRulesVersion).toBe(2);
});
