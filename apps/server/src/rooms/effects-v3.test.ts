import {expect,test} from 'vitest';
import {roleById} from '@ravens/game-engine';
import {experienceTiming} from '@ravens/contracts';
import {RoomService} from './service.js';
import {initializePresentation} from './presentation.js';

function table(version:1|2|3=3,successor=false){
  let now=1_800_000_000_000;
  const service=new RoomService({now:()=>now,presentation:true}),code=service.create(6,'房主').room.code;
  const players=Array.from({length:6},(_,i)=>service.join(code,`玩家${i+1}`,'PLAYER'));
  for(const p of players)service.setReady(code,p.token,true);
  service.startTutorial(code,players[0]!.token,'SKIP');
  expect(service.find(code).game!.presentationVersion).toBe(3);
  const snapshot=service.snapshot(code),game=snapshot.game!;
  snapshot.assignments=['slayer','chef','empath','saint',successor?'scarlet_woman':'baron','imp'].map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id,roleType:roleById(id).type,alignment:i>=4?'EVIL':'GOOD'}));
  game.presentationVersion=version;game.startInfo={mode:'LEGACY',stage:'COMPLETE',entries:{}};game.phase='DAY_DISCUSSION';game.day=1;game.presentationUntil=0;game.pendingPublications=[];delete game.publicProjection;initializePresentation(game,now);service.restore([snapshot]);
  return{service,code,players,now:()=>now,advance(ms:number){now+=ms;service.advanceTime(now);}};
}

test('v3 nomination commits a usable public ballot and immediate hand change survives later announcement frames',()=>{
  const t=table();t.service.nominate(t.code,t.players[0]!.token,2);
  const raw=t.service.find(t.code).game!,ballotId=raw.nomination!.ballotId;
  expect(t.service.publicView(t.code).game).toMatchObject({phase:'VOTING',nomination:{ballotId}});
  expect(t.service.privateView(t.code,t.players[2]!.token)).toMatchObject({canVote:true,canClaimSlayer:true});
  t.service.vote(t.code,t.players[2]!.token,true);t.advance(900);
  expect(t.service.privateView(t.code,t.players[2]!.token).voteRaised).toBe(true);
  expect(t.service.find(t.code).game!.nomination).toMatchObject({ballotId,countedSeats:[]});
  expect(t.service.find(t.code).game!.presentationUntil).toBe(0);
});

test('v3 nomination can be followed immediately by a public shot without resetting hands, locked seats or ballot',()=>{
  const t=table();t.service.nominate(t.code,t.players[1]!.token,3);t.service.vote(t.code,t.players[3]!.token,true);
  const before=structuredClone(t.service.find(t.code).game!.nomination!);
  t.service.useDayAbility(t.code,t.players[0]!.token,2);
  expect(t.service.find(t.code).game!.nomination!.voteStartsAt).toBe(before.voteStartsAt!+2850);
  expect(t.service.find(t.code).game!.nomination!.countedSeats).toEqual(before.countedSeats);
  t.advance(250);expect(t.service.publicView(t.code).game!.nomination!.ballotId).toBe(before.ballotId);
  t.advance(850);expect(t.service.privateView(t.code,t.players[3]!.token).voteRaised).toBe(true);
  t.advance(1750);expect(t.service.find(t.code).game!.nomination!.countedSeats).toEqual([]);
  expect(t.service.privateView(t.code,t.players[3]!.token).canVote).toBe(true);
});

test('a shot after clockwise counting keeps the already locked votes and shifts only remaining timing',()=>{
  const t=table();t.service.nominate(t.code,t.players[1]!.token,3);t.service.vote(t.code,t.players[3]!.token,true);t.advance(21_600);
  const before=structuredClone(t.service.find(t.code).game!.nomination!);
  expect(before.countedSeats).toEqual([4]);
  t.service.useDayAbility(t.code,t.players[0]!.token,2);
  expect(t.service.find(t.code).game!.nomination!.countedVotes).toEqual(before.countedVotes);
  expect(()=>t.service.vote(t.code,t.players[3]!.token,false)).toThrow();
  t.advance(2850);
  expect(t.service.find(t.code).game!.nomination!.countedSeats).toEqual([4]);
  expect(t.service.find(t.code).game!.nomination!.nextCountAt).toBe(before.nextCountAt!+2850);
});

test('v3 vote result cannot overwrite a subsequent immediate nomination',()=>{
  const t=table();t.service.nominate(t.code,t.players[0]!.token,2);t.advance(29_000);
  expect(t.service.publicView(t.code).game!.phase).toBe('NOMINATION');
  t.service.nominate(t.code,t.players[1]!.token,3);
  const next=structuredClone(t.service.find(t.code).game!.nomination!);t.service.vote(t.code,t.players[3]!.token,true);t.advance(1300);
  expect(t.service.publicView(t.code).game!.nomination!.ballotId).toBe(next.ballotId);
  expect(t.service.privateView(t.code,t.players[3]!.token).voteRaised).toBe(true);
});

test('v3 vote result cannot rewind the next night when all players immediately end the day',()=>{
  const t=table();t.service.nominate(t.code,t.players[0]!.token,2);t.advance(29_000);
  for(const p of t.players)t.service.readyToEndDay(t.code,p.token,true);
  const night=[...t.service.find(t.code).game!.events].reverse().find(e=>e.kind==='NIGHT_FALLS')!;
  t.advance(Math.max(1300,night.startsAt-t.now()+1));expect(t.service.publicView(t.code).game!.phase).toBe('OTHER_NIGHT');
  expect(t.service.publicView(t.code).game!.nomination).toBeUndefined();
});

test('v3 death, winner and identities remain behind their independent committed publication points',()=>{
  const t=table();t.service.useDayAbility(t.code,t.players[0]!.token,6);
  expect(t.service.publicView(t.code).game!.aliveCount).toBe(6);
  t.advance(250);expect(t.service.publicView(t.code).game!.events.at(-1)).toMatchObject({kind:'SHOT',timingVersion:3});
  expect(t.service.publicView(t.code).game!.events.at(-1)!.outcome).toBeUndefined();
  t.advance(849);expect(t.service.publicView(t.code).game!.aliveCount).toBe(6);
  t.advance(1);expect(t.service.publicView(t.code).game!.aliveCount).toBe(5);expect(t.service.publicView(t.code).game!.winner).toBeUndefined();
  t.advance(1750);expect(t.service.publicView(t.code).state).toBe('GAME_OVER');expect(t.service.publicView(t.code).game!.winner).toBeUndefined();
  t.advance(899);expect(t.service.privateView(t.code,t.players[1]!.token).storytellerDecisions).toBeUndefined();
  t.advance(1);expect(t.service.publicView(t.code).game!.winner).toBe('GOOD');expect(t.service.privateView(t.code,t.players[1]!.token).storytellerDecisions).toBeUndefined();
  t.advance(4300);expect(t.service.privateView(t.code,t.players[1]!.token).storytellerDecisions).toBeDefined();
});

test.each([1,2] as const)('restored v%s keeps the old blocking nomination and timing interpretation',version=>{
  const t=table(version);t.service.nominate(t.code,t.players[0]!.token,2);
  expect(t.service.find(t.code).game!.presentationUntil).toBe(t.now()+1500+experienceTiming('NOMINATION',version).duration);
  expect(()=>t.service.vote(t.code,t.players[2]!.token,true)).toThrow(/演出/);
  const saved=t.service.snapshot(t.code),restored=new RoomService({now:t.now,presentation:true});restored.restore([saved]);expect(restored.find(t.code).game!.presentationVersion).toBe(version);
});


test('an unknown persisted event timing version fails restore instead of being interpreted as legacy',()=>{
  const t=table();t.service.useDayAbility(t.code,t.players[0]!.token,2);const saved=t.service.snapshot(t.code);
  (saved.game!.events.at(-1)! as {timingVersion:number}).timingVersion=4;
  expect(()=>new RoomService({presentation:true}).restore([saved])).toThrow('Unsupported presentation version');
});
