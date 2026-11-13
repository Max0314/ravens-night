// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {ExperienceEvent} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {EventStage} from './EventStage.js';
const epoch=1790500000000;
afterEach(()=>{cleanup();vi.restoreAllMocks();sessionStorage.clear();vi.useRealTimers();});
function event(kind:ExperienceEvent['kind'],patch:Partial<ExperienceEvent>={}):ExperienceEvent{return{id:kind,seq:1,gameId:'critical',kind,timingVersion:4,startsAt:epoch,occurredAt:epoch,durationMs:kind==='EXECUTION'?3200:kind==='DAWN'?6600:5200,message:'等待公布',day:1,...patch};}
function game(events:ExperienceEvent[],patch:Partial<GameView>={}):GameView{return{gameId:'critical',phase:'DAY_DISCUSSION',day:1,serverNow:epoch,readyCount:0,aliveCount:5,seats:[1,2,3,4,5].map(seat=>({seat,nickname:`玩家${seat}`,avatar:`/avatars/${seat}.webp`,alive:true,connected:true,ghostVoteAvailable:true})),events,...patch};}
test.each([['saint-executed','EVIL','saint'],['mayor-final-three','GOOD','mayor'],['demon-dead','GOOD','demon']] as const)('real %s publicly selects the right finale after its reveal and takes priority over reading',(reason,winner,cause)=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const ui=render(<EventStage reading game={game([event('GAME_OVER',{outcome:winner})],{phase:'GAME_OVER',winner,winReason:reason})}/>);
 expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();expect(ui.container.querySelector('.victory-tableau')).toBeNull();expect(screen.queryByRole('status',{name:'阶段变化'})).toBeNull();
 act(()=>vi.advanceTimersByTime(960));expect(ui.container.querySelector(`.victory-cause--${cause}`)).not.toBeNull();expect(screen.getByText(reason==='saint-executed'?'圣徒因处决死亡，邪恶阵营获胜。':reason==='mayor-final-three'?'镇长达成三人存活且无人处决，善良阵营获胜。':'恶魔已经死亡，善良阵营获胜。')).toBeVisible();
});
test('Virgin names the actual trigger and nominator only after the public execution result',()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const nomination=event('NOMINATION',{actorSeat:1,targetSeat:2,durationMs:800}),execution=event('EXECUTION',{id:'virgin-execution',seq:2,targetSeat:1,seats:[1],outcome:'DEATH',message:'处女的能力触发：[玩家1] 被处决。'});
 const ui=render(<EventStage game={game([nomination,execution])}/>);expect(ui.container.querySelector('.event-stage__virgin-trigger')).toBeNull();act(()=>vi.advanceTimersByTime(1280));expect(ui.container.querySelector('.event-stage__virgin-trigger')).toHaveTextContent('[玩家2] · 处女能力触发');expect(ui.container.querySelector('.event-stage__virgin-trigger img')).toHaveAttribute('src','/avatars/2.webp');expect(screen.getByText('提名者立即被处决，今日提名结束。')).toBeVisible();
});
test('a deferred dawn cannot hide a later execution for its whole duration',()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const dawn=event('DAWN',{outcome:'NO_DEATH',seats:[]}),ui=render(<EventStage blocked game={game([dawn])}/>);act(()=>vi.advanceTimersByTime(7000));ui.rerender(<EventStage game={game([dawn],{serverNow:epoch+7000})}/>);expect(ui.container.querySelector('.event-stage--dawn')).not.toBeNull();
 const execution=event('EXECUTION',{id:'later-execution',seq:2,startsAt:epoch+7200,occurredAt:epoch+7000,targetSeat:3,outcome:'DEATH',seats:[3]});ui.rerender(<EventStage game={game([dawn,execution],{serverNow:epoch+7200})}/>);expect(ui.container.querySelector('.event-stage--execution')).not.toBeNull();expect(ui.container.querySelector('.event-stage--dawn')).toBeNull();expect(JSON.parse(sessionStorage.getItem('ravens_events_critical')??'[]')).toContain(dawn.id);
});

test('skipping a manual critical event signals page completion even when storage cannot be written',()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage unavailable');});
 const completed:unknown[]=[],receive=(notification:Event)=>completed.push((notification as CustomEvent).detail);
 window.addEventListener('ravens:public-event-seen',receive);
 try{
  const execution=event('EXECUTION',{id:'manual-execution',targetSeat:1,outcome:'DEATH',seats:[1]});
  const ui=render(<EventStage game={game([execution])} playback={{now:epoch,paused:true,rate:1,epoch:1}}/>);
  act(()=>screen.getByRole('button',{name:'跳过演出'}).click());expect(completed).toEqual([{gameId:'critical',eventId:'manual-execution'}]);expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();
  ui.rerender(<EventStage game={game([execution])} playback={{now:epoch,paused:true,rate:1,epoch:1}}/>);expect(completed).toHaveLength(1);
 }finally{window.removeEventListener('ravens:public-event-seen',receive);}
});
