import {expect,test} from 'vitest';
import {roleById} from '@ravens/game-engine';
import {RoomService} from './service.js';
import {initializePresentation} from './presentation.js';
function table(){let now=1800000000000;const service=new RoomService({now:()=>now}),code=service.create(6,'时序验证').room.code,players=Array.from({length:6},(_,i)=>service.join(code,`玩家${i+1}`,'PLAYER'));players.forEach(p=>service.setReady(code,p.token,true));service.startTutorial(code,players[0]!.token,'SKIP');const snapshot=service.snapshot(code),g=snapshot.game!;snapshot.assignments=['slayer','chef','empath','saint','baron','imp'].map((id,i)=>({seat:i+1,roleId:id,perceivedRoleId:id,roleType:roleById(id).type,alignment:i>=4?'EVIL':'GOOD'}));g.presentationVersion=2;g.phase='DAY_DISCUSSION';g.day=1;g.startInfo.stage='COMPLETE';g.confirmedRoleSeats=[1,2,3,4,5,6];delete g.publicProjection;g.pendingPublications=[];initializePresentation(g,now);service.restore([snapshot]);return{service,code,players,advance(ms:number){now+=ms;service.advanceTime(now);}};}
test('v2 shot, winner and full-role publication respect the new immutable result/end boundaries',()=>{
 const t=table();t.service.useDayAbility(t.code,t.players[0]!.token,6);const game=()=>t.service.publicView(t.code).game!,mine=()=>t.service.privateView(t.code,t.players[0]!.token);
 t.advance(1500);expect(game().events.at(-1)).toMatchObject({kind:'SHOT',timingVersion:2,durationMs:6000});expect(game().events.at(-1)?.outcome).toBeUndefined();
 t.advance(3599);expect(game().aliveCount).toBe(6);t.advance(1);expect(game().aliveCount).toBe(5);expect(game().winner).toBeUndefined();
 t.advance(2399);expect(t.service.publicView(t.code).state).toBe('RUNNING');t.advance(1);expect(t.service.publicView(t.code).state).toBe('GAME_OVER');
 t.advance(2799);expect(game().winner).toBeUndefined();t.advance(1);expect(game().winner).toBe('GOOD');expect(mine().storytellerDecisions).toBeUndefined();
 t.advance(4199);expect(mine().canRestart).toBe(false);t.advance(1);expect(mine().storytellerDecisions).toBeDefined();expect(mine().canRestart).toBe(true);
});
test('v2 nomination holds the presentation first, then preserves full 20 second defense and 1500ms seat slots',()=>{
 const t=table();t.service.nominate(t.code,t.players[0]!.token,3);t.advance(3300);const g=()=>t.service.publicView(t.code).game!;
 expect(g().nomination!.voteStartsAt!-g().serverNow!).toBe(20000);t.players.forEach(p=>t.service.vote(t.code,p.token,true));t.advance(20000);expect(g().nomination!.countedSeats).toEqual([]);t.advance(1499);expect(g().nomination!.countedSeats).toEqual([]);t.advance(1);expect(g().nomination!.countedSeats).toEqual([4]);
});
