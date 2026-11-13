// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {PrivateView} from '../api.js';
import {acknowledgePresentations} from '../api.js';
import {preparePrivateArt} from './PremiumArt.js';
import {PrivateSceneStage,PrivateSceneContent} from './PrivateSceneStage.js';
vi.mock('./cinematic-timing.js',async original=>{const actual=await original<typeof import('./cinematic-timing.js')>();return {...actual,cinematicTiming:{...actual.cinematicTiming,demon:{...actual.cinematicTiming.demon,avatarLeft:2050,avatarRight:2350}}};});
vi.mock('../api.js',async original=>({...await original<typeof import('../api.js')>(),acknowledgePresentations:vi.fn(async()=>({acked:[],revision:2}))}));
vi.mock('./PremiumArt.js',async original=>({...await original<typeof import('./PremiumArt.js')>(),preparePrivateArt:vi.fn(async()=>({ready:[],failed:[],timedOut:[]}))}));
async function advance(ms:number){await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});await act(async()=>vi.advanceTimersByTime(ms));}
const scene={version:1 as const,id:'game:private:1:1',kind:'INFORMATION' as const,themeRoleId:'chef',shown:{type:'COUNT' as const,value:2 as const}};
const fixture=():PrivateView=>({protocolVersion:6,roomInstanceId:'room',revision:1,participant:{id:'me',nickname:'甲',seat:1},state:'RUNNING',messages:[],history:[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'厨师数字2',presentation:scene}],presentations:{version:1,pending:[{historySeq:1,scene}],hasMore:false},game:{gameId:'game',phase:'FIRST_NIGHT',day:0,events:[],seats:[],aliveCount:6,readyCount:0}});
test('poison atmosphere waits for its texture and escapes the prop viewport without claiming a result',()=>{
 const poison={version:1 as const,id:'poison',kind:'ACTION_SUBMITTED' as const,themeRoleId:'poisoner',shown:{type:'TARGET_SUBMITTED' as const,action:'POISON' as const,seats:[2]}};
 const props={scene:poison,view:fixture(),elapsedMs:1800};const ui=render(<PrivateSceneContent {...props} readyAssets={new Set()}/>);
 expect(ui.container.querySelector('.premium-poison-vapour')).toBeNull();
 ui.rerender(<PrivateSceneContent {...props} readyAssets={new Set(['/art/effects/v5/poison-vapour.webp'])}/>);
 const atmosphere=ui.container.querySelector('.premium-poison-vapour');expect(atmosphere).not.toBeNull();expect(atmosphere!.closest('.private-scene-art')).toBeNull();
 expect(screen.getByText('选择已提交，实际结果以规则结算为准。')).toBeVisible();
});
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
test('poison separates its prop and outer atmosphere; demon screen and avatar hits arrive separately',()=>{const submitted={...scene,kind:'ACTION_SUBMITTED' as const,themeRoleId:'poisoner',shown:{type:'TARGET_SUBMITTED' as const,action:'POISON' as const,seats:[2]}};const ui=render(<PrivateSceneContent scene={submitted} view={fixture()} elapsedMs={1000}/>);expect(ui.container.querySelectorAll('[data-role="poisoner"]')).toHaveLength(1);expect(ui.container.querySelectorAll('.premium-poison-vapour')).toHaveLength(1);expect(ui.container.querySelector('.premium-poison-vapour')?.closest('.role-scene-art')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={1750}/>);expect(ui.container.querySelectorAll('.premium-demon-slashes')).toHaveLength(1);expect(ui.container.querySelector('.premium-demon-slashes')?.closest('.role-scene-art')).toBeNull();expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-left')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={2050}/>);expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-left')).not.toBeNull();expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-right')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={2350}/>);expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-right')).not.toBeNull();});

test('slow preparation pauses only the private scene and a skipped load cannot revive it',async()=>{
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise<import('./PremiumArt.js').PreparedPrivateArt>(resolve=>{ready=()=>resolve({ready:[],failed:[],timedOut:[]});}));
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);
 await advance(4500);expect(screen.getByRole('status')).toHaveTextContent('正在准备');expect(screen.getByRole('status').closest('.private-scene-body')).not.toBeNull();expect(acknowledgePresentations).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'跳过本段 ×'}));await act(async()=>ready());expect(screen.queryByRole('dialog')).toBeNull();expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
});
test('an 800ms rendering stall is caught up by the private clock instead of permanently lagging audio',async()=>{
 let tick:FrameRequestCallback=()=>{};vi.spyOn(performance,'now').mockReturnValue(1000);vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{tick=fn;return 1;});vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(0);
 act(()=>tick(1800));act(()=>tick(3200));expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(acknowledgePresentations).not.toHaveBeenCalled();
});

test('replaying the same completed history entry waits for media preparation again',async()=>{
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(4100);expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise<import('./PremiumArt.js').PreparedPrivateArt>(resolve=>{ready=()=>resolve({ready:[],failed:[],timedOut:[]});}));act(()=>window.dispatchEvent(new CustomEvent('ravens:replay-private-scene',{detail:1})));await advance(3000);expect(screen.getByRole('status')).toHaveTextContent('正在准备');expect(screen.queryByText('相邻邪恶玩家的对数：2')).not.toBeInTheDocument();await act(async()=>ready());await advance(2100);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();
});

test('information candidates are not mounted before 1900; grimoire waits until 2200 and uses the recorded snapshot',()=>{
 const view=fixture();view.game!.seats=[{seat:2,nickname:'现在的昵称',avatar:'/current-avatar.webp',alive:true,connected:true,ghostVoteAvailable:true}];
 const candidates={...scene,themeRoleId:'librarian',shown:{type:'CANDIDATES' as const,roleId:'saint',seats:[2,3] as [number,number]}};
 const ui=render(<PrivateSceneContent scene={candidates} view={view} elapsedMs={1899}/>);expect(ui.container.textContent).not.toContain('圣徒');expect(ui.container.querySelector('.private-scene-person')).toBeNull();expect(ui.container.querySelector('[data-projection]')).toBeNull();
 ui.rerender(<PrivateSceneContent scene={candidates} view={view} elapsedMs={1900}/>);expect(ui.container.textContent).toContain('二人中有一位是圣徒');expect(ui.container.querySelectorAll('.private-scene-person')).toHaveLength(2);
 view.history[0]!.grimoire={entries:[{seat:2,nickname:'当夜的昵称',avatar:'/night-avatar.webp',roleName:'士兵',alive:true,reminders:['保护']}]};const spy={...scene,themeRoleId:'spy',shown:{type:'GRIMOIRE' as const,historySeq:1}};
 ui.rerender(<PrivateSceneContent scene={spy} view={view} elapsedMs={2199}/>);expect(ui.container.textContent).not.toContain('当夜的昵称');expect(ui.container.querySelector('image[href="/night-avatar.webp"]')).toBeNull();
 ui.rerender(<PrivateSceneContent scene={spy} view={view} elapsedMs={2200}/>);expect(ui.container.textContent).toContain('当夜的昵称');expect(ui.container.textContent).not.toContain('现在的昵称');expect(ui.container.querySelector('image[href="/night-avatar.webp"]')).not.toBeNull();
});

test('failed layers stay absent for the playback and audio setting changes do not replace its frozen ready set',async()=>{
 vi.mocked(preparePrivateArt).mockResolvedValueOnce({ready:['/art/effects/v4/chef-board-clean.webp'],failed:['/art/effects/v3/chef-cleaver.webp'],timedOut:['/art/effects/v4/chef-carrot.webp']});const calls=vi.mocked(preparePrivateArt).mock.calls.length;
 const ui=render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(1000);expect(ui.container.querySelector('image[href="/art/effects/v4/chef-board-clean.webp"]')).not.toBeNull();expect(ui.container.querySelector('image[href="/art/effects/v3/chef-cleaver.webp"]')).toBeNull();
 act(()=>window.dispatchEvent(new Event('ravens-effects-audio')));await advance(1100);expect(vi.mocked(preparePrivateArt).mock.calls.length).toBe(calls+1);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(ui.container.querySelector('image[href="/art/effects/v3/chef-cleaver.webp"]')).toBeNull();
});

test('identity summaries stay in the readable result panel and are never printed across a prop',()=>{const summary='每个夜晚，你可以选择一名玩家并获知其身份，此处仅为身份介绍。';const ui=render(<PrivateSceneContent scene={{...scene,kind:'IDENTITY',themeRoleId:'ravenkeeper',shown:{type:'IDENTITY',roleId:'ravenkeeper',summary}}} view={fixture()} elapsedMs={2400}/>);expect(ui.container.querySelector('.private-scene-result')).toHaveTextContent(summary);expect(ui.container.querySelector('.layered-scene-art')).not.toHaveTextContent(summary);expect(ui.container.querySelector('[data-projection]')).toBeNull();});


test('identity playback waits for authoritative confirmation, including the last-player first-night transition',async()=>{
 const view=fixture();const identity={version:1 as const,id:'identity',kind:'IDENTITY' as const,themeRoleId:'chef',shown:{type:'IDENTITY' as const,roleId:'chef',summary:'身份介绍'}};
 view.history[0]!.presentation=identity;view.game!.phase='ROLE_REVEAL';view.roleConfirmed=false;view.presentations!.pending=[{historySeq:1,scene:identity}];
 const props={view,code:'ABCDEF',reading:false,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn()};const ui=render(<PrivateSceneStage {...props}/>);
 act(()=>window.dispatchEvent(new CustomEvent('ravens:replay-private-scene',{detail:1})));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'查看'})).not.toBeInTheDocument();await advance(5000);expect(acknowledgePresentations).not.toHaveBeenCalled();
 ui.rerender(<PrivateSceneStage {...props} view={{...view,revision:2,roleConfirmed:true,game:{...view.game!,phase:'FIRST_NIGHT'}}}/>);
 expect(screen.getByRole('dialog')).toBeInTheDocument();await advance(3800);expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
});

test('washer linen prints only the actual shown candidates, including a default avatar, after the reveal',()=>{
 const view=fixture();view.game!.seats=[
  {seat:2,nickname:'未获知对象',avatar:'/other.webp',alive:true,connected:true,ghostVoteAvailable:true},
  {seat:3,nickname:'已获知甲',avatar:'/shown-three.webp',alive:true,connected:true,ghostVoteAvailable:true},
  {seat:5,nickname:'已获知乙',alive:true,connected:true,ghostVoteAvailable:true}];
 const washer={...scene,themeRoleId:'washerwoman',shown:{type:'CANDIDATES' as const,roleId:'saint',seats:[3,5] as [number,number]}};
 const ui=render(<PrivateSceneContent scene={washer} view={view} elapsedMs={1899}/>);
 expect(ui.container.querySelector('.washer-imprints')).toBeNull();
 ui.rerender(<PrivateSceneContent scene={washer} view={view} elapsedMs={1900}/>);
 const prints=ui.container.querySelector('.washer-imprints')!;
 expect(prints.querySelectorAll('[data-washer-candidate]')).toHaveLength(2);
 expect(prints.querySelector('image')?.getAttribute('href')).toBe('/shown-three.webp');
 expect(prints.textContent).toContain('已获知甲');expect(prints.textContent).toContain('已获知乙');
 expect(prints.textContent).not.toContain('未获知对象');expect(prints.querySelector('image[href="/other.webp"]')).toBeNull();
 expect(prints.querySelector('[data-washer-candidate="1"] text')).toHaveTextContent('已');
 expect(ui.container.querySelector('.private-scene-result')).toHaveTextContent('二人中有一位是圣徒');
 expect(ui.container.querySelectorAll('[data-washer-strip] use')).toHaveLength(10);
});
test('demon decals are anchored inside the avatar box, separately from a long nickname',()=>{
 const view=fixture();view.game!.seats=[{seat:2,nickname:'很长昵称'.repeat(6),avatar:'/shown.webp',alive:true,connected:true,ghostVoteAvailable:true}];
 const demon={...scene,kind:'ACTION_SUBMITTED' as const,themeRoleId:'imp',shown:{type:'TARGET_SUBMITTED' as const,action:'KILL' as const,seats:[2]}};
 const ui=render(<PrivateSceneContent scene={demon} view={view} elapsedMs={2350}/>),box=ui.container.querySelector('.private-scene-avatar')!;
 expect(box.querySelector('.player-avatar')).not.toBeNull();expect(box.querySelectorAll('.private-avatar-claw')).toHaveLength(2);
 expect(box.textContent).not.toContain('很长昵称');expect(box.nextElementSibling).toHaveTextContent('很长昵称');
 ui.rerender(<PrivateSceneContent scene={demon} view={view} elapsedMs={2050} readyAssets={new Set()}/>);expect(ui.container.querySelector('.private-avatar-claw')).toBeNull();
});
