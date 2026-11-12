// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import * as audio from '../components/experience-audio.js';
import {EffectsPreview,effectsScenarios,rolePreviewScenarios} from './EffectsPreview.js';
import {EventStage,eventAt} from '../components/EventStage.js';
import type {GameView} from '../api.js';
import type {ExperienceEvent} from '@ravens/contracts';
vi.mock('../components/PremiumArt.js',async original=>({...await original<typeof import('../components/PremiumArt.js')>(),preparePrivateArt:vi.fn(async()=>({ready:[],failed:[],timedOut:[]}))}));
afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
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
test('laboratory drives private and public frames with pause, seek and new replay ids without room writes',async()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<EffectsPreview/>);
 expect(effectsScenarios.some(s=>s.id==='evil-saint')).toBe(true);expect(rolePreviewScenarios.filter(s=>s.scene?.kind==='IDENTITY')).toHaveLength(22);fireEvent.click(screen.getByRole('button',{name:/恶魔攻击/}));expect(screen.getByLabelText('仅本人可见的演示')).toHaveTextContent('选择已提交');
 await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});act(()=>vi.advanceTimersByTime(500));fireEvent.click(screen.getByRole('button',{name:'暂停'}));const control=screen.getByLabelText('演出播放控制'),before=within(control).getByRole('slider').getAttribute('value');act(()=>vi.advanceTimersByTime(1000));expect(within(control).getByRole('slider')).toHaveAttribute('value',before);
 fireEvent.change(screen.getByRole('slider',{name:'演出进度'}),{target:{value:'3000'}});expect(screen.getByLabelText('仅本人可见的演示')).toBeVisible();fireEvent.change(screen.getByRole('slider',{name:'演出进度'}),{target:{value:'1000'}});expect(screen.getByLabelText('仅本人可见的演示')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'重播'}));expect(screen.getByRole('slider',{name:'演出进度'})).toHaveValue('0');fireEvent.click(screen.getByRole('button',{name:'返回目录'}));expect(screen.queryByLabelText('演出播放控制')).toBeNull();expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();
});


test('a deferred audio unlock cannot revive a skipped public event',async()=>{
 vi.useFakeTimers();vi.setSystemTime(epoch);let finish:()=>void=()=>{};const start=vi.fn();
 class Audio{state='suspended';currentTime=0;destination={};resume(){return new Promise<void>(resolve=>{finish=()=>{this.state='running';resolve();};});}async decodeAudioData(){return{duration:1};}createGain(){return{gain:{value:0},connect(){}};}createBufferSource(){return{buffer:undefined,playbackRate:{value:1},connect(){},disconnect(){},start,stop(){}};}}
 vi.stubGlobal('AudioContext',Audio);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})));
 render(<EventStage game={view([event('SHOT')])}/>);fireEvent.click(screen.getByRole('button',{name:'启用音效'}));fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));await act(async()=>{finish();for(let i=0;i<8;i++)await Promise.resolve();});expect(start).not.toHaveBeenCalled();
});

test('private preview seek uses future-only audio, then an ordinary pause resumes its current stem',async()=>{vi.useFakeTimers();const cue=vi.spyOn(audio,'scheduleRoleCue');render(<EffectsPreview/>);fireEvent.click(screen.getByRole('button',{name:/管家认主/}));await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});expect(cue.mock.calls.at(-1)?.[2]?.mode).toBe('START');fireEvent.click(screen.getByRole('button',{name:'暂停'}));fireEvent.change(screen.getByRole('slider',{name:'演出进度'}),{target:{value:'1500'}});fireEvent.click(screen.getByRole('button',{name:'继续'}));expect(cue.mock.calls.at(-1)?.[2]?.mode).toBe('SEEK');fireEvent.click(screen.getByRole('button',{name:'暂停'}));fireEvent.click(screen.getByRole('button',{name:'继续'}));expect(cue.mock.calls.at(-1)?.[2]?.mode).toBe('RESUME');});

test('private preview freezes its anchor while hidden and resumes from the same frame',async()=>{vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});const cue=vi.spyOn(audio,'scheduleRoleCue');render(<EffectsPreview/>);fireEvent.click(screen.getByRole('button',{name:/管家认主/}));await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});act(()=>vi.advanceTimersByTime(600));Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));const at=Number(screen.getByRole('slider',{name:'演出进度'}).getAttribute('value'));act(()=>vi.advanceTimersByTime(5000));expect(Number(screen.getByRole('slider',{name:'演出进度'}).getAttribute('value'))).toBe(at);Object.defineProperty(document,'hidden',{configurable:true,value:false});act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(cue.mock.calls.at(-1)?.[2]?.mode).toBe('RESUME');act(()=>vi.advanceTimersByTime(200));expect(Number(screen.getByRole('slider',{name:'演出进度'}).getAttribute('value'))).toBeGreaterThan(at);});
