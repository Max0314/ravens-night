// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {PrivateView} from '../api.js';
import {acknowledgePresentations} from '../api.js';
import {preparePrivateArt} from './PremiumArt.js';
import {PrivateSceneStage,PrivateSceneContent} from './PrivateSceneStage.js';
vi.mock('../api.js',async original=>({...await original<typeof import('../api.js')>(),acknowledgePresentations:vi.fn(async()=>({acked:[],revision:2}))}));
vi.mock('./PremiumArt.js',async original=>({...await original<typeof import('./PremiumArt.js')>(),preparePrivateArt:vi.fn(async()=>{})}));
async function advance(ms:number){await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});await act(async()=>vi.advanceTimersByTime(ms));}
const scene={version:1 as const,id:'game:private:1:1',kind:'INFORMATION' as const,themeRoleId:'chef',shown:{type:'COUNT' as const,value:2 as const}};
const fixture=():PrivateView=>({protocolVersion:6,roomInstanceId:'room',revision:1,participant:{id:'me',nickname:'甲',seat:1},state:'RUNNING',messages:[],history:[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'厨师数字2',presentation:scene}],presentations:{version:1,pending:[{historySeq:1,scene}],hasMore:false},game:{gameId:'game',phase:'FIRST_NIGHT',day:0,events:[],seats:[],aliveCount:6,readyCount:0}});
beforeEach(()=>{vi.useFakeTimers();vi.mocked(acknowledgePresentations).mockClear();Object.defineProperty(document,'hidden',{configurable:true,value:false});localStorage.clear();});
afterEach(()=>{cleanup();delete document.documentElement.dataset.keyboard;vi.useRealTimers();vi.restoreAllMocks();});
test('reading defers the complete scene; phase updates cannot truncate it and paused time never ACKs',async()=>{
 const props={view:fixture(),code:'ABCDEF',reading:true,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn()};const ui=render(<PrivateSceneStage {...props}/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'查看'}));expect(screen.getByRole('dialog')).toBeInTheDocument();await advance(2100);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();const next=fixture();next.game!.phase='DAY_DISCUSSION';next.revision=2;ui.rerender(<PrivateSceneStage {...props} view={next}/>);fireEvent.click(screen.getByRole('button',{name:'稍后继续'}));await advance(6000);expect(acknowledgePresentations).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'继续演出'}));await advance(1900);expect(acknowledgePresentations).toHaveBeenCalledTimes(1);expect(vi.mocked(acknowledgePresentations).mock.calls[0]![1].entries).toEqual([{historySeq:1,disposition:'COMPLETE'}]);
});
test('explicit skip ACKs only the art record, while privacy covering pauses without dropping the queue',async()=>{
 const props={view:fixture(),code:'ABCDEF',reading:false,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn()};const ui=render(<PrivateSceneStage {...props}/>);expect(screen.getByRole('dialog')).toBeInTheDocument();ui.rerender(<PrivateSceneStage {...props} covered/>);await advance(6000);expect(acknowledgePresentations).not.toHaveBeenCalled();ui.rerender(<PrivateSceneStage {...props}/>);fireEvent.click(screen.getByRole('button',{name:'跳过本段 ×'}));expect(vi.mocked(acknowledgePresentations).mock.calls[0]![1].entries[0]!.disposition).toBe('SKIP');expect(props.onHandleTask).not.toHaveBeenCalled();
});

test('return-town pauses a full scene so the nomination and action shortcuts can reveal the board',async()=>{render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);expect(screen.getByRole('dialog')).toBeInTheDocument();act(()=>window.dispatchEvent(new Event('ravens:return-town')));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();await advance(6000);expect(acknowledgePresentations).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'继续演出'})).toBeVisible();});

test('a higher room sheet pauses the art clock and cannot mark unread information complete',async()=>{render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(500);const sheet=document.createElement('div');sheet.className='room-sheet-backdrop';await act(async()=>document.body.append(sheet));await advance(7000);expect(acknowledgePresentations).not.toHaveBeenCalled();await act(async()=>sheet.remove());await advance(3500);expect(acknowledgePresentations).toHaveBeenCalledTimes(1);});

test('new information waits for an already open keyboard instead of creating a covering dialog',()=>{document.documentElement.dataset.keyboard='open';render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();act(()=>window.dispatchEvent(new CustomEvent('ravens:keyboard',{detail:{open:false}})));expect(screen.getByRole('dialog')).toBeInTheDocument();});
test('private submitted poison and demon screens live outside the bounded art; identity does not emit them',()=>{const submitted={...scene,kind:'ACTION_SUBMITTED' as const,themeRoleId:'poisoner',shown:{type:'TARGET_SUBMITTED' as const,action:'POISON' as const,seats:[2]}};const ui=render(<PrivateSceneContent scene={submitted} view={fixture()} elapsedMs={1900}/>);expect(ui.container.querySelector('.premium-poison-vapour:not(.is-compact)')).not.toBeNull();expect(ui.container.querySelector('.premium-poison-vapour:not(.is-compact)')?.closest('.role-scene-art')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={1900}/>);expect(ui.container.querySelectorAll('.premium-demon-slashes')).toHaveLength(1);expect(ui.container.querySelector('.premium-demon-slashes')?.closest('.role-scene-art')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,kind:'IDENTITY',shown:{type:'IDENTITY',roleId:'poisoner',summary:'演示'}}} view={fixture()} elapsedMs={1900}/>);expect(ui.container.querySelector('.premium-poison-vapour:not(.is-compact)')).toBeNull();});

test('slow preparation pauses only the private scene and a skipped load cannot revive it',async()=>{
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise<void>(resolve=>{ready=resolve;}));
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);
 await advance(4500);expect(screen.getByRole('status')).toHaveTextContent('正在准备');expect(acknowledgePresentations).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'跳过本段 ×'}));await act(async()=>ready());expect(screen.queryByRole('dialog')).toBeNull();expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
});
test('an 800ms rendering stall is caught up by the private clock instead of permanently lagging audio',async()=>{
 let tick:FrameRequestCallback=()=>{};vi.spyOn(performance,'now').mockReturnValue(1000);vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{tick=fn;return 1;});vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(0);
 act(()=>tick(1800));act(()=>tick(3200));expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(acknowledgePresentations).not.toHaveBeenCalled();
});

test('replaying the same completed history entry waits for media preparation again',async()=>{
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(4100);expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise<void>(resolve=>{ready=resolve;}));act(()=>window.dispatchEvent(new CustomEvent('ravens:replay-private-scene',{detail:1})));await advance(3000);expect(screen.getByRole('status')).toHaveTextContent('正在准备');expect(screen.getByText('相邻邪恶玩家的对数：2')).not.toBeVisible();await act(async()=>ready());await advance(2100);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();
});
