// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {EffectsPreview,effectsScenarios} from './EffectsPreview.js';
import {EventStage,eventAt} from '../components/EventStage.js';
import type {GameView} from '../api.js';
import type {ExperienceEvent} from '@ravens/contracts';
afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});
const epoch=1800000000000;
function view(events:ExperienceEvent[]):GameView{return{gameId:'new-effects',serverNow:epoch,phase:'DAY_DISCUSSION',day:2,seats:[1,2,3].map(seat=>({seat,nickname:`人${seat}`,alive:true,connected:true,ghostVoteAvailable:true})),events,readyCount:0,aliveCount:3};}
function event(kind:ExperienceEvent['kind'],rest:Partial<ExperienceEvent>={}):ExperienceEvent{return{id:`fx-${kind}`,gameId:'new-effects',seq:1,kind,startsAt:epoch,occurredAt:epoch,durationMs:2600,timingVersion:3,message:'公开结果',actorSeat:1,targetSeat:3,...rest};}
test('an overlapping announcement never occupies the shot cinematic channel',()=>{
 const nomination=event('NOMINATION',{durationMs:800}),shot=event('SHOT',{seq:2});expect(eventAt([nomination,shot],epoch+300,new Set())?.kind).toBe('SHOT');
 render(<EventStage game={view([nomination])}/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('提名');
});
test('new death and victory effects remain gated by the actual reveal point',()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const shot=event('SHOT',{outcome:'DEATH',seats:[3]});const ui=render(<EventStage game={view([shot])}/>);expect(ui.container.querySelector('.has-death')).toBeNull();act(()=>vi.advanceTimersByTime(880));expect(ui.container.querySelector('.has-death')).not.toBeNull();
 ui.rerender(<EventStage game={view([event('GAME_OVER',{id:'finale',startsAt:epoch+880,durationMs:5200,outcome:'EVIL'})])}/>);expect(ui.container.querySelector('.victory-tableau')).toBeNull();expect(ui.container.textContent).not.toContain('暗夜属于邪恶');act(()=>vi.advanceTimersByTime(960));expect(ui.container.querySelector('.victory-tableau--evil')).not.toBeNull();
});
test('a shot while reading preserves the reader focus and offers a nonmodal result',()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const ui=render(<><button>原阅读位置</button><EventStage reading game={view([event('SHOT')])}/></>);const anchor=screen.getByRole('button',{name:'原阅读位置'});anchor.focus();act(()=>vi.advanceTimersByTime(1000));expect(anchor).toHaveFocus();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'知道了'})).toBeVisible();ui.unmount();
});
test('laboratory drives private and public frames with pause, seek and new replay ids without room writes',()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<EffectsPreview/>);
 expect(effectsScenarios).toHaveLength(19);fireEvent.click(screen.getByRole('button',{name:/恶魔攻击/}));expect(screen.getByLabelText('仅你可见的行动回执')).toHaveTextContent('选择已提交');
 act(()=>vi.advanceTimersByTime(500));fireEvent.click(screen.getByRole('button',{name:'暂停'}));const control=screen.getByLabelText('演出播放控制'),before=within(control).getByRole('slider').getAttribute('value');act(()=>vi.advanceTimersByTime(1000));expect(within(control).getByRole('slider')).toHaveAttribute('value',before);
 fireEvent.change(screen.getByRole('slider',{name:'演出进度'}),{target:{value:'3000'}});expect(screen.queryByLabelText('仅你可见的行动回执')).not.toBeInTheDocument();fireEvent.change(screen.getByRole('slider',{name:'演出进度'}),{target:{value:'1000'}});expect(screen.getByLabelText('仅你可见的行动回执')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'重播'}));expect(screen.getByRole('slider',{name:'演出进度'})).toHaveValue('0');fireEvent.click(screen.getByRole('button',{name:'返回目录'}));expect(screen.queryByLabelText('演出播放控制')).toBeNull();expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();
});


test('a deferred audio unlock cannot revive a skipped public event',async()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);let finish:()=>void=()=>{};const start=vi.fn();
 class Audio{state='suspended';currentTime=0;destination={};resume(){return new Promise<void>(resolve=>{finish=()=>{this.state='running';resolve();};});}async decodeAudioData(){return{duration:1};}createGain(){return{gain:{value:0},connect(){}};}createBufferSource(){return{buffer:undefined,playbackRate:{value:1},connect(){},disconnect(){},start,stop(){}};}}
 vi.stubGlobal('AudioContext',Audio);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})));
 render(<EventStage game={view([event('SHOT')])}/>);fireEvent.click(screen.getByRole('button',{name:'启用音效'}));fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));await act(async()=>{finish();for(let i=0;i<8;i++)await Promise.resolve();});expect(start).not.toHaveBeenCalled();
});
