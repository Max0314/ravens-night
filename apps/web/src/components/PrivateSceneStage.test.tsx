// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {StrictMode} from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {PrivateView} from '../api.js';
import {acknowledgePresentations} from '../api.js';
import {preparePrivateArt} from './PremiumArt.js';
import {prewarmPrivateArt} from './private-art-assets.js';
import {prepareRoleAudio} from './experience-audio.js';
import {PrivateSceneStage,PrivateSceneContent} from './PrivateSceneStage.js';
vi.mock('./private-art-assets.js',async original=>({...await original<typeof import('./private-art-assets.js')>(),prewarmPrivateArt:vi.fn(async()=>({ready:[],failed:[],timedOut:[]})),readyPrivateArt:vi.fn(()=>new Set<string>())}));
vi.mock('./experience-audio.js',async original=>({...await original<typeof import('./experience-audio.js')>(),prepareRoleAudio:vi.fn(async()=>{})}));
vi.mock('../api.js',async original=>({...await original<typeof import('../api.js')>(),acknowledgePresentations:vi.fn(async()=>({acked:[],revision:2}))}));
vi.mock('./PremiumArt.js',async original=>({...await original<typeof import('./PremiumArt.js')>(),preparePrivateArt:vi.fn(async()=>({ready:[],failed:[],timedOut:[]}))}));
async function advance(ms:number){await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});await act(async()=>vi.advanceTimersByTime(ms));}
const scene={version:1 as const,id:'game:private:1:1',kind:'INFORMATION' as const,themeRoleId:'chef',shown:{type:'COUNT' as const,value:2 as const}};
const fixture=():PrivateView=>({protocolVersion:7,roomInstanceId:'room',revision:1,participant:{id:'me',nickname:'甲',seat:1},state:'RUNNING',messages:[],history:[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'厨师数字2',presentation:scene}],presentations:{version:1,pending:[{historySeq:1,scene}],hasMore:false},game:{gameId:'game',phase:'FIRST_NIGHT',day:0,events:[],seats:[],aliveCount:6,readyCount:0}});
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
test('poison separates its prop and outer atmosphere; demon screen and avatar hits arrive separately',()=>{const submitted={...scene,kind:'ACTION_SUBMITTED' as const,themeRoleId:'poisoner',shown:{type:'TARGET_SUBMITTED' as const,action:'POISON' as const,seats:[2]}};const ui=render(<PrivateSceneContent scene={submitted} view={fixture()} elapsedMs={1000}/>);expect(ui.container.querySelectorAll('[data-role="poisoner"]')).toHaveLength(1);expect(ui.container.querySelectorAll('.premium-poison-vapour')).toHaveLength(1);expect(ui.container.querySelector('.premium-poison-vapour')?.closest('.role-scene-art')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={1750}/>);expect(ui.container.querySelectorAll('.premium-demon-slashes')).toHaveLength(1);expect(ui.container.querySelector('.premium-demon-slashes')?.closest('.role-scene-art')).toBeNull();expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-left')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={2900}/>);expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-left')).not.toBeNull();expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-right')).toBeNull();ui.rerender(<PrivateSceneContent scene={{...submitted,themeRoleId:'imp',shown:{...submitted.shown,action:'KILL'}}} view={fixture()} elapsedMs={3450}/>);expect(ui.container.querySelector('.private-scene-person .premium-claw--avatar-right')).not.toBeNull();});

test('slow art never blocks the reveal clock or creates a blank loading screen; a skipped load cannot revive it',async()=>{
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise<import('./PremiumArt.js').PreparedPrivateArt>(resolve=>{ready=()=>resolve({ready:[],failed:[],timedOut:[]});}));
 const ui=render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);
 await advance(2100);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(ui.container.querySelector('.private-scene-loading')).toBeNull();expect(ui.container.querySelector('.is-art-pending .private-scene-portrait')).not.toBeNull();expect(acknowledgePresentations).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'跳过本段 ×'}));await act(async()=>ready());expect(screen.queryByRole('dialog')).toBeNull();expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
});

test('an 800ms rendering stall is caught up by the private clock instead of permanently lagging audio',async()=>{
 let tick:FrameRequestCallback=()=>{};vi.spyOn(performance,'now').mockReturnValue(1000);vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{tick=fn;return 1;});vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(0);
 act(()=>tick(1800));act(()=>tick(3200));expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(acknowledgePresentations).not.toHaveBeenCalled();
});

test('replaying the same completed entry keeps its clock independent of a slow media retry',async()=>{
 render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(4100);expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise<import('./PremiumArt.js').PreparedPrivateArt>(resolve=>{ready=()=>resolve({ready:[],failed:[],timedOut:[]});}));act(()=>window.dispatchEvent(new CustomEvent('ravens:replay-private-scene',{detail:1})));await advance(2100);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();await act(async()=>ready());await advance(2100);expect(screen.queryByRole('dialog')).toBeNull();expect(acknowledgePresentations).toHaveBeenCalledTimes(1);
});

test('information candidates keep their reveal gate; spy grimoire playback points to town without reproducing its snapshot',()=>{
 const view=fixture();view.game!.seats=[{seat:2,nickname:'现在的昵称',avatar:'/current-avatar.webp',alive:true,connected:true,ghostVoteAvailable:true}];
 const candidates={...scene,themeRoleId:'librarian',shown:{type:'CANDIDATES' as const,roleId:'saint',seats:[2,3] as [number,number]}};
 const ui=render(<PrivateSceneContent scene={candidates} view={view} elapsedMs={1899}/>);expect(ui.container.textContent).not.toContain('圣徒');expect(ui.container.querySelector('.private-scene-person')).toBeNull();expect(ui.container.querySelector('[data-projection]')).toBeNull();
 ui.rerender(<PrivateSceneContent scene={candidates} view={view} elapsedMs={1900}/>);expect(ui.container.textContent).toContain('二人中有一位是圣徒');expect(ui.container.querySelectorAll('.private-scene-person')).toHaveLength(2);
 view.history[0]!.grimoire={entries:[{seat:2,nickname:'当夜的昵称',avatar:'/night-avatar.webp',roleName:'士兵',alive:true,reminders:['保护']}]};const spy={...scene,themeRoleId:'spy',shown:{type:'GRIMOIRE' as const,historySeq:1}};
 ui.rerender(<PrivateSceneContent scene={spy} view={view} elapsedMs={2199}/>);expect(ui.container.textContent).not.toContain('当夜的昵称');expect(ui.container.querySelector('image[href="/night-avatar.webp"]')).toBeNull();
 ui.rerender(<PrivateSceneContent scene={spy} view={view} elapsedMs={2200}/>);expect(ui.container.textContent).toContain('可在城镇查看魔典');expect(ui.container.textContent).not.toContain('当夜的昵称');expect(ui.container.querySelector('.private-grimoire')).toBeNull();expect(view.history[0]!.grimoire!.entries[0]!.nickname).toBe('当夜的昵称');
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
 expect(ui.container.querySelectorAll('[data-washer-strip]')).toHaveLength(10);expect(ui.container.querySelectorAll('[data-washer-strip] use')).toHaveLength(20);
});
test('demon decals are anchored inside the avatar box, separately from a long nickname',()=>{
 const view=fixture();view.game!.seats=[{seat:2,nickname:'很长昵称'.repeat(6),avatar:'/shown.webp',alive:true,connected:true,ghostVoteAvailable:true}];
 const demon={...scene,kind:'ACTION_SUBMITTED' as const,themeRoleId:'imp',shown:{type:'TARGET_SUBMITTED' as const,action:'KILL' as const,seats:[2]}};
 const ui=render(<PrivateSceneContent scene={demon} view={view} elapsedMs={3450}/>),box=ui.container.querySelector('.private-scene-avatar')!;
 expect(box.querySelector('.player-avatar')).not.toBeNull();expect(box.querySelectorAll('.private-avatar-claw')).toHaveLength(2);
 expect(box.textContent).not.toContain('很长昵称');expect(box.nextElementSibling).toHaveTextContent('很长昵称');
 ui.rerender(<PrivateSceneContent scene={demon} view={view} elapsedMs={2900} readyAssets={new Set()}/>);expect(ui.container.querySelector('.private-avatar-claw')).toBeNull();
});

function evil():PrivateView{
 const view=fixture();view.roleConfirmed=true;view.role={roleId:'spy',name:'间谍',alignment:'EVIL',type:'MINION',summary:'能力',beginnerTip:'建议'};view.startInfo={infoId:'team',gameId:'game',team:[{seat:2,nickname:'同伴',kind:'DEMON'}],bluffs:[],acknowledged:false,canAcknowledge:true};
 const start={version:1 as const,id:'start',kind:'EVIL_START' as const,themeRoleId:'spy',shown:{type:'EVIL_START' as const,infoId:'team'}};view.presentations!.pending=[{historySeq:2,scene:start}];view.history=[{seq:2,kind:'INFORMATION',phase:'FIRST_NIGHT',day:0,text:'阵营信息',presentation:start}];return view;
}
test('evil-start holds at its end for an explicit business acknowledgement, failure retries, and server success alone advances it',async()=>{
 const view=evil(),confirm=vi.fn(),props={view,code:'ABCDEF',reading:false,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn(),onConfirmStartInfo:confirm};const ui=render(<PrivateSceneStage {...props}/>);await advance(5000);
 expect(screen.getByRole('button',{name:'已知晓'})).toBeEnabled();expect(confirm).not.toHaveBeenCalled();expect(acknowledgePresentations).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'已知晓'}));expect(confirm).toHaveBeenCalledWith('team');
 ui.rerender(<PrivateSceneStage {...props} busy/>);expect(screen.getByRole('button',{name:'正在确认…'})).toBeDisabled();ui.rerender(<PrivateSceneStage {...props} error="确认失败，请重试"/>);expect(screen.getByRole('alert')).toHaveTextContent('确认失败');fireEvent.click(screen.getByRole('button',{name:'已知晓'}));expect(confirm).toHaveBeenCalledTimes(2);expect(screen.getByRole('dialog')).toBeVisible();
 ui.rerender(<PrivateSceneStage {...props} view={{...view,startInfo:{...view.startInfo!,acknowledged:true}}}/>);expect(screen.queryByRole('dialog')).toBeNull();expect(acknowledgePresentations).toHaveBeenCalledTimes(1);expect(vi.mocked(acknowledgePresentations).mock.calls[0]![1].entries).toEqual([{historySeq:2,disposition:'COMPLETE'}]);
});
test('skipping evil motion and privacy covering cannot acknowledge companions, and town can resume the same reveal',async()=>{
 const view=evil(),confirm=vi.fn(),props={view,code:'ABCDEF',reading:false,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn(),onConfirmStartInfo:confirm};const ui=render(<PrivateSceneStage {...props}/>);await advance(0);fireEvent.click(screen.getByRole('button',{name:'跳过动画'}));expect(screen.getByRole('button',{name:'已知晓'})).toBeVisible();expect(confirm).not.toHaveBeenCalled();expect(acknowledgePresentations).not.toHaveBeenCalled();
 ui.rerender(<PrivateSceneStage {...props} covered/>);await advance(5000);expect(screen.queryByRole('dialog')).toBeNull();ui.rerender(<PrivateSceneStage {...props}/>);act(()=>window.dispatchEvent(new Event('ravens:return-town')));expect(screen.queryByRole('dialog')).toBeNull();act(()=>window.dispatchEvent(new CustomEvent('ravens:show-start-info',{detail:'team'})));expect(screen.getByRole('button',{name:'已知晓'})).toBeVisible();expect(confirm).not.toHaveBeenCalled();
});
test('legacy startInfo gets one local reveal without inventing an art ACK, and absence of authorized startInfo never invents teammates',async()=>{
 const view=evil();delete view.presentations;view.history=[];const confirm=vi.fn(),props={view,code:'ABCDEF',reading:false,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn(),onConfirmStartInfo:confirm};const ui=render(<PrivateSceneStage {...props}/>);await advance(5000);expect(ui.container.querySelector('[data-kind="EVIL_START"]')).toHaveTextContent('同伴');expect(ui.container.querySelector('.private-start-cards')).toBeNull();expect(ui.container.querySelector('[data-start-info-fallback]')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'已知晓'}));
 ui.rerender(<PrivateSceneStage {...props} view={{...view,startInfo:{...view.startInfo!,acknowledged:true}}}/>);expect(acknowledgePresentations).not.toHaveBeenCalled();ui.unmount();const small=fixture();small.presentations!.pending=[];small.history=[];render(<PrivateSceneStage {...props} view={small}/>);expect(screen.queryByRole('dialog')).toBeNull();
});
test('spy grimoire auto segments are skipped as art only while identity, companions and other roles keep their actual queues',async()=>{
 const view=evil(),identity={version:1 as const,id:'identity-spy',kind:'IDENTITY' as const,themeRoleId:'spy',shown:{type:'IDENTITY' as const,roleId:'spy',summary:'不应展开的能力大段'}};
 const grimoire={version:1 as const,id:'grimoire',kind:'INFORMATION' as const,themeRoleId:'spy',shown:{type:'GRIMOIRE' as const,historySeq:3}};view.presentations!.pending.unshift({historySeq:1,scene:identity});view.presentations!.pending.push({historySeq:3,scene:grimoire},{historySeq:4,scene});view.history.push({seq:3,kind:'INFORMATION',phase:'FIRST_NIGHT',day:0,text:'魔典快照',presentation:grimoire,grimoire:{entries:[]}});
 const confirm=vi.fn(),props={view,code:'ABCDEF',reading:false,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn(),onConfirmStartInfo:confirm};const ui=render(<PrivateSceneStage {...props}/>);await advance(2200);expect(screen.getByText('可在城镇查看魔典')).toBeVisible();expect(screen.queryByText('不应展开的能力大段')).toBeNull();expect(vi.mocked(acknowledgePresentations).mock.calls.flatMap(call=>call[1].entries)).toContainEqual({historySeq:3,disposition:'SKIP'});expect(confirm).not.toHaveBeenCalled();
 await advance(1700);expect(ui.container.querySelector('[data-kind="EVIL_START"]')).not.toBeNull();await advance(5000);fireEvent.click(screen.getByRole('button',{name:'已知晓'}));ui.rerender(<PrivateSceneStage {...props} view={{...view,startInfo:{...view.startInfo!,acknowledged:true}}}/>);await advance(2200);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(view.history.find(entry=>entry.seq===3)?.grimoire).toBeDefined();
});

test('spy auto-art SKIP survives the actual StrictMode lifecycle without acknowledging gameplay or showing a second book',async()=>{
 const view=fixture();view.history=[];view.presentations!.pending=[{historySeq:3,scene:{version:1,id:'spy-only',kind:'INFORMATION',themeRoleId:'spy',shown:{type:'GRIMOIRE',historySeq:3}}}];const confirm=vi.fn();
 render(<StrictMode><PrivateSceneStage view={view} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()} onConfirmStartInfo={confirm}/></StrictMode>);await advance(0);
 expect(screen.queryByRole('dialog')).toBeNull();expect(vi.mocked(acknowledgePresentations).mock.calls.flatMap(call=>call[1].entries)).toContainEqual({historySeq:3,disposition:'SKIP'});expect(confirm).not.toHaveBeenCalled();
});

test('companions appear only on the prepared envelope, with a readable sole fallback if the paper cannot load',()=>{
 const view=evil(),scene=view.presentations!.pending[0]!.scene,ready=new Set(['envelope-back','envelope-front','envelope-flap-front','envelope-flap-back','envelope-paper'].map(name=>`/art/effects/v8/${name}.webp`));
 const ui=render(<PrivateSceneContent scene={scene} view={view} elapsedMs={4600} readyAssets={ready}/>);expect(ui.container.querySelector('[data-envelope-paper]')).toHaveTextContent('同伴');expect(ui.container.querySelector('.private-start-cards,.private-scene-result,h2')).toBeNull();
 ui.rerender(<PrivateSceneContent scene={scene} view={view} elapsedMs={4600} readyAssets={new Set()}/>);expect(ui.container.querySelector('[data-envelope-paper]')).toBeNull();expect(ui.container.querySelector('[data-start-info-fallback]')).toHaveTextContent('同伴');expect(ui.container.querySelector('.private-start-cards')).toBeNull();
});

test('only two already authorized pending scenes warm while reading, before playback opens',()=>{
 vi.mocked(prewarmPrivateArt).mockClear();const view=fixture();view.presentations!.pending=[0,1,2,3].map(i=>({historySeq:i+1,scene:{...scene,id:`warm-${i}`}}));
 const props={view,code:'ABCDEF',reading:true,covered:false,onActivityChange:vi.fn(),onHandleTask:vi.fn()};const ui=render(<PrivateSceneStage {...props}/>);expect(screen.queryByRole('dialog')).toBeNull();expect(vi.mocked(prewarmPrivateArt).mock.calls.map(([s])=>s.id)).toEqual(['warm-0','warm-1']);
 ui.rerender(<PrivateSceneStage {...props} view={{...view,revision:2}}/>);expect(vi.mocked(prewarmPrivateArt)).toHaveBeenCalledTimes(2);
});
test('unresolved audio cannot hold the private reveal clock',async()=>{
 vi.mocked(prepareRoleAudio).mockImplementationOnce(()=>new Promise<void>(()=>{}));render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(2100);expect(screen.getByText('相邻邪恶玩家的对数：2')).toBeVisible();expect(screen.queryByText('正在准备画面与声音…')).toBeNull();
});
test('ready layers can appear before another request settles and fallback bluffs still obey 2400ms',async()=>{
 vi.mocked(preparePrivateArt).mockImplementationOnce((_scene,update)=>{update?.({ready:['/art/effects/v4/chef-board-clean.webp'],failed:[],timedOut:[]});return new Promise(()=>{});});const ui=render(<PrivateSceneStage view={fixture()} code="ABCDEF" reading={false} covered={false} onActivityChange={vi.fn()} onHandleTask={vi.fn()}/>);await advance(0);expect(ui.container.querySelector('image[href="/art/effects/v4/chef-board-clean.webp"]')).not.toBeNull();expect(ui.container.querySelector('.is-art-pending .private-scene-portrait')).not.toBeNull();ui.unmount();
 const view=evil();view.startInfo!.bluffs=[{roleId:'saint',name:'圣徒',summary:''}];const letter=view.presentations!.pending[0]!.scene,rendered=render(<PrivateSceneContent scene={letter} view={view} elapsedMs={1900} readyAssets={new Set()}/>);expect(rendered.container.querySelector('[data-start-info-fallback]')).toHaveTextContent('同伴');expect(rendered.container).not.toHaveTextContent('未在场角色');rendered.rerender(<PrivateSceneContent scene={letter} view={view} elapsedMs={2400} readyAssets={new Set()}/>);expect(rendered.container).toHaveTextContent('未在场角色');
});
