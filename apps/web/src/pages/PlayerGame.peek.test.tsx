// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {PlayerGame} from './PlayerGame.js';
import {enableEffectsAudio} from '../components/experience-audio.js';
import {roleArt} from '../role-art.js';
import type {PrivateView} from '../api.js';
vi.mock('../components/PrivateSceneStage.js',()=>({PrivateSceneStage:()=>null}));
vi.mock('../components/experience-audio.js',async original=>({...await original<typeof import('../components/experience-audio.js')>(),effectsAudioEnabled:()=>false,audioControlEnabled:()=>false,audioChannelsSilent:()=>false,effectsAudioStatus:()=>'',enableEffectsAudio:vi.fn(async()=>{})}));
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
function fixture():PrivateView{return {state:'RUNNING',roomInstanceId:'room',participant:{id:'me',nickname:'甲',seat:1},role:{roleId:'chef',name:'厨师',type:'TOWNSFOLK',alignment:'GOOD',summary:'能力',beginnerTip:'建议',perceivedAs:'不应读取此字段的图'},roleConfirmed:true,history:[],messages:[],game:{phase:'DAY_DISCUSSION',gameId:'g',day:1,aliveCount:3,readyCount:0,events:[],seats:[1,2,3].map(seat=>({id:String(seat),seat,nickname:'名字'+seat,alive:true,connected:true,ghostVoteAvailable:true}))}};}
const open=()=>fireEvent.click(screen.getByRole('button',{name:'查看我的角色立绘'}));
beforeEach(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});localStorage.clear();});
afterEach(async()=>{cleanup();await new Promise(r=>setTimeout(r,20));window.history.replaceState({},'','/');vi.clearAllMocks();});
test('role chip opens only its perceived art without classification framing and image click or Escape closes',()=>{
 const ui=render(<PlayerGame {...handlers} view={fixture()}/>),chip=screen.getByRole('button',{name:'查看我的角色立绘'});chip.focus();open();
 const dialog=screen.getByRole('dialog',{name:'我的角色立绘'}),image=within(dialog).getByRole('img',{name:'厨师立绘'});expect(ui.container.contains(dialog)).toBe(false);expect(image).toHaveAttribute('src',roleArt('chef').portraitUrl);expect(dialog.querySelector('[data-role-type],.role-portrait-frame,.rn-role-portrait-frame')).toBeNull();expect(chip).toHaveAttribute('aria-expanded','true');
 fireEvent.click(image);expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();expect(chip).toHaveFocus();open();fireEvent.keyDown(window,{key:'Escape'});expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();
});
test('phone back closes the peek instead of issuing a game navigation command',()=>{
 render(<PlayerGame {...handlers} view={fixture()}/>);open();act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:null})));expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();expect(handlers.onBack).not.toHaveBeenCalled();
});
test('a privacy cover and a hidden document remove the portal and restoring privacy never revives it',()=>{
 render(<PlayerGame {...handlers} view={fixture()}/>);open();fireEvent(window,new Event('ravens:cover-private'));expect(screen.queryByRole('img',{name:'厨师立绘'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();
 open();Object.defineProperty(document,'hidden',{configurable:true,value:true});fireEvent(document,new Event('visibilitychange'));expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();Object.defineProperty(document,'hidden',{configurable:true,value:false});fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();
});
test('identity, player, room and game changes synchronously remove old art; opening a guide closes it too',()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>);
 for(const next of [{...view,role:{...view.role!,roleId:'imp',name:'小恶魔'}},{...view,participant:{...view.participant,id:'other'}},{...view,roomInstanceId:'other-room'},{...view,game:{...view.game!,gameId:'other-game'}}]){
  open();ui.rerender(<PlayerGame {...handlers} view={next}/>);expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();ui.rerender(<PlayerGame {...handlers} view={view}/>);expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();
 }
 open();ui.rerender(<PlayerGame {...handlers} view={view} guideOpen/>);expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();ui.rerender(<PlayerGame {...handlers} view={view}/>);expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();
});
test('peek yields to an existing interaction layer and preserves public ballot controls while viewing',async()=>{
 const view=fixture();view.game!.phase='VOTING';view.canVote=true;view.voteRaised=false;view.game!.nomination={nominatorSeat:1,nomineeSeat:2,votesRaised:0,votesReceived:0,threshold:2};render(<PlayerGame {...handlers} view={view}/>);open();
 const notice=await screen.findByLabelText('提名提醒');fireEvent.keyDown(document,{key:'Tab'});expect(document.activeElement?.closest('.nomination-notice')).toBe(notice);fireEvent.click(within(notice).getByRole('button',{name:'举手'}));expect(handlers.onVote).toHaveBeenCalledWith(true);expect(screen.getByRole('dialog',{name:'我的角色立绘'})).toBeVisible();
 const wheel=document.createElement('div');wheel.className='player-wheel-backdrop';const control=document.createElement('button');control.textContent='后续轮盘操作';wheel.append(control);document.body.append(wheel);control.focus();await waitFor(()=>expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument());expect(control).toHaveFocus();wheel.remove();
});
test('shared audio control precedes my role chip and its same node survives Town/Record switching',()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>),nav=screen.getByRole('navigation',{name:'游戏分区'}),sound=ui.container.querySelector<HTMLButtonElement>('.game-header [data-global-audio-control]')!;
 expect(nav.querySelector('[data-global-audio-control]')).toBeNull();expect(sound.nextElementSibling).toBe(screen.getByRole('button',{name:'查看我的角色立绘'}));expect(sound).toHaveClass('global-audio-button','game-header__sound');expect(sound.textContent).toBe('♩');expect(ui.container.querySelectorAll('[data-global-audio-control]')).toHaveLength(1);fireEvent.click(sound);expect(enableEffectsAudio).toHaveBeenCalledExactlyOnceWith(true);
 fireEvent.click(screen.getByRole('button',{name:'记录'}));expect(ui.container.querySelector('.game-header [data-global-audio-control]')).toBe(sound);expect(screen.getByRole('button',{name:'记录'})).toHaveAttribute('aria-pressed','true');
 for(const phase of ['ABORTED','GAME_OVER'] as const){ui.rerender(<PlayerGame {...handlers} view={{...view,game:{...view.game!,phase,revealComplete:true}}}/>);expect(ui.container.querySelector('.game-tabs')).toBeNull();expect(ui.container.querySelectorAll('[data-global-audio-control]')).toHaveLength(1);expect(ui.container.querySelector('.room-page__audio [data-global-audio-control]')).not.toBeNull();}
});

test('a foreground refresh must finish before old private art can be opened again',async()=>{
 let release:()=>void=()=>{};const refresh=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));render(<PlayerGame {...handlers} view={fixture()} onRefresh={refresh}/>);open();
 Object.defineProperty(document,'hidden',{configurable:true,value:true});fireEvent(document,new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});fireEvent(document,new Event('visibilitychange'));fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));expect(screen.getByRole('button',{name:'查看我的角色立绘'})).toBeDisabled();expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();await act(async()=>release());expect(screen.getByRole('button',{name:'查看我的角色立绘'})).toBeEnabled();open();expect(screen.getByRole('dialog',{name:'我的角色立绘'})).toBeVisible();
});

test('local audio disappears for identity, my peek, a normal sheet and a guide, then returns',async()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>);
 const audio=()=>ui.container.querySelector('.game-header [data-global-audio-control]');expect(audio()).not.toBeNull();
 const external=document.createElement('section');external.setAttribute('role','dialog');document.body.append(external);await waitFor(()=>expect(audio()).toBeNull());external.remove();await waitFor(()=>expect(audio()).not.toBeNull());
 open();expect(audio()).toBeNull();fireEvent.click(screen.getByRole('img',{name:'厨师立绘'}));await waitFor(()=>expect(audio()).not.toBeNull());
 const voting={...view,game:{...view.game!,phase:'VOTING' as const,nomination:{nominatorSeat:1,nomineeSeat:2,votesRaised:0,votesReceived:0,threshold:2}}};ui.rerender(<PlayerGame {...handlers} view={voting}/>);
 fireEvent.click(screen.getByRole('button',{name:'查看本轮表决规则'}));expect(audio()).toBeNull();fireEvent.click(screen.getByRole('button',{name:'关闭本轮表决'}));await waitFor(()=>expect(audio()).not.toBeNull());
 ui.rerender(<PlayerGame {...handlers} view={view} guideOpen/>);expect(audio()).toBeNull();ui.rerender(<PlayerGame {...handlers} view={view}/>);expect(audio()).not.toBeNull();
 ui.rerender(<PlayerGame {...handlers} view={{...view,roleConfirmed:false,game:{...view.game!,phase:'ROLE_REVEAL'}}}/>);expect(audio()).toBeNull();
 ui.rerender(<PlayerGame {...handlers} view={{...view,game:{...view.game!,phase:'ROLE_REVEAL'}}}/>);expect(audio()).toBeNull();expect(screen.getByRole('status')).toHaveTextContent('身份已确认');
});

test('a restored opening-night lock removes a role peek and never revives it at the deadline',()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>);open();const locked={...view,game:{...view.game!,phase:'ROLE_REVEAL' as const,serverNow:1000,presentationUntil:7200}};
 ui.rerender(<PlayerGame {...handlers} view={locked}/>);expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'查看我的角色立绘'})).not.toBeInTheDocument();expect(screen.queryByText('厨师')).not.toBeInTheDocument();
 ui.rerender(<PlayerGame {...handlers} view={{...locked,game:{...locked.game!,serverNow:7200}}}/>);expect(screen.getByRole('button',{name:'查看我的角色立绘'})).toBeVisible();expect(screen.queryByRole('dialog',{name:'我的角色立绘'})).not.toBeInTheDocument();
});

test('town header keeps day and alive counts while only avatar seats retain seat numbers',()=>{
 const ui=render(<PlayerGame {...handlers} view={fixture()}/>),header=ui.container.querySelector('.game-header')!;expect(header).toHaveTextContent('第1天');expect(header).toHaveTextContent('存 3');expect(header).not.toHaveTextContent('我 1');expect(header.querySelector('[aria-label="你是1号"]')).toBeNull();expect(ui.container.querySelector('[data-seat-number="1"]')).not.toBeNull();
});
