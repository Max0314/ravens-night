// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {ExperienceEvent} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {EventStage} from './EventStage.js';
const epoch=1_790_500_000_000;
afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();vi.useRealTimers();});
function event(kind:ExperienceEvent['kind'],rest:Partial<ExperienceEvent>={}):ExperienceEvent{return{id:kind,kind,gameId:'portraits',seq:1,message:'等待公布',occurredAt:epoch,startsAt:epoch,durationMs:6000,timingVersion:2,...rest};}
function game(events:ExperienceEvent[]):GameView{return{gameId:'portraits',serverNow:epoch,phase:'DAY_DISCUSSION',day:2,events,readyCount:0,aliveCount:3,seats:[1,2,3].map(seat=>({seat,nickname:`玩家${seat}`,avatar:`/avatars/${seat}.webp`,alive:true,connected:true,ghostVoteAvailable:true}))};}
function clock(){vi.useFakeTimers();vi.setSystemTime(epoch);}

test('an empty execution has a wind-blown empty guillotine and never invents an undefined victim',()=>{
 clock();const scene=event('EXECUTION',{outcome:'NONE',message:'今天无人被处决。'});const ui=render(<EventStage game={game([scene])}/>);
 expect(ui.container.querySelector('.guillotine-scene.is-empty')).not.toBeNull();expect(ui.container.querySelector('.execution-blade')).toBeNull();expect(ui.container.querySelector('.event-token')).toBeNull();expect(ui.container.textContent).not.toMatch(/undefined|未定义|被处决者/);expect(screen.queryByRole('heading',{name:'今天无人被处决'})).not.toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(3600));expect(screen.getByRole('heading',{name:'今天无人被处决'})).toBeVisible();
});

test('an execution without a new death still shows its real target instead of the empty guillotine',()=>{
 clock();const ui=render(<EventStage game={game([event('EXECUTION',{targetSeat:2,outcome:'NO_DEATH',message:'玩家2被处决，该玩家已经死亡。'})])}/>);
 expect(ui.container.querySelector('.guillotine-scene.is-empty')).toBeNull();expect(ui.container.querySelector('.guillotine-scene img')).toHaveAttribute('src','/avatars/2.webp');act(()=>vi.advanceTimersByTime(3600));expect(screen.getByRole('heading',{name:'处决结束，无人死亡'})).toBeVisible();
});

test.each(['NOMINATION','SHOT'] as const)('%s identifies both the actor and target by their public avatars',kind=>{
 clock();const ui=render(<EventStage game={game([event(kind,{actorSeat:1,targetSeat:3,message:'玩家1对玩家3采取行动。'})])}/>);expect([...ui.container.querySelectorAll(kind==='NOMINATION'?'.event-notice img':'.event-stage__theatre img')].map(img=>img.getAttribute('src')).sort()).toEqual(['/avatars/1.webp','/avatars/3.webp']);expect(ui.container.querySelector(kind==='NOMINATION'?'.event-notice':'.cinematic-rifle')).not.toBeNull();
});

test('dawn waits for the public result before displaying the deceased and never adds a protection explanation',()=>{
 clock();const before=event('DAWN');const ui=render(<EventStage game={game([before])}/>);expect(ui.container.querySelector('.dawn-memorial')).toBeNull();act(()=>vi.advanceTimersByTime(2800));expect(ui.container.querySelector('.dawn-memorial')).toBeNull();
 ui.rerender(<EventStage game={{...game([{...before,outcome:'DEATH',seats:[2],message:'昨夜玩家2死亡。'}]),serverNow:epoch+2800}}/>);expect(ui.container.querySelector('.dawn-memorial .player-avatar img')).toHaveAttribute('src','/avatars/2.webp');expect(ui.container.querySelectorAll('.dawn-memorial .player-avatar img')).toHaveLength(1);
 ui.rerender(<EventStage game={{...game([{...before,outcome:'NO_DEATH',seats:[],message:'昨夜无人死亡。'}]),serverNow:epoch+2800}}/>);expect(ui.container.querySelector('.dawn-memorial img')).toBeNull();expect(ui.container.textContent).not.toMatch(/保护|士兵|袭击|下毒/);expect(screen.getByRole('heading',{name:'今夜，无人死亡'})).toBeVisible();
});

test('a private receipt shows only the submitted target avatars and clears when the receipt is removed',()=>{
 clock();const view=game([]),ui=render(<EventStage game={view} receipt={{id:'private',kind:'POISON',target:'玩家2',targetSeats:[2]}}/>);expect(screen.getByRole('status',{name:'仅你可见的行动回执'})).toBeVisible();expect(ui.container.querySelector('.private-ritual__players img')).toHaveAttribute('src','/avatars/2.webp');expect(ui.container.querySelectorAll('.private-ritual__players img')).toHaveLength(1);ui.rerender(<EventStage game={view}/>);expect(screen.queryByRole('status',{name:'仅你可见的行动回执'})).not.toBeInTheDocument();
});
