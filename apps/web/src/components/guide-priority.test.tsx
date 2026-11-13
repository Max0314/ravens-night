// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {ExperienceEvent} from '@ravens/contracts';
import type {GameView,PrivateView,RoomView} from '../api.js';
import {GuideOverlay,type GuideMode} from './GuideOverlay.js';
import {criticalGuideEvent,GuidePriorityBoundary,useGuidePriority} from './guide-priority.js';
import {PlayerGame} from '../pages/PlayerGame.js';
const privateStage=vi.hoisted(()=>vi.fn());
vi.mock('./PrivateSceneStage.js',()=>({PrivateSceneStage:(props:unknown)=>{privateStage(props);return null;}}));
vi.mock('./book-audio.js',()=>({createBookAudio:()=>({prepare:async()=>true,turn:()=>{},silence:()=>{},dispose:()=>{}})}));
vi.mock('./experience-audio.js',async original=>({...await original<typeof import('./experience-audio.js')>(),effectsAudioEnabled:()=>false,audioControlEnabled:()=>false}));
const epoch=1790500000000;
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
function event(kind:ExperienceEvent['kind']='EXECUTION'):ExperienceEvent{return{id:kind,gameId:'game',seq:1,kind,message:'公开结果',occurredAt:epoch,startsAt:epoch+1500,durationMs:6000,targetSeat:2,outcome:'DEATH',day:1};}
function game(events:ExperienceEvent[]=[],now=epoch):GameView{return{gameId:'game',phase:'DAY_DISCUSSION',day:1,serverNow:now,events,aliveCount:3,readyCount:0,seats:[1,2,3].map(seat=>({id:String(seat),seat,nickname:'名字'+seat,alive:true,connected:true,ghostVoteAvailable:true}))};}
function Book({close}:{close:()=>void}){const{suspended}=useGuidePriority();return <GuideOverlay mode="roles" onClose={close} suspended={suspended}/>;}
function Harness({current,scope='scope'}:{current:GameView;scope?:string}){
 const[mode,setMode]=useState<GuideMode|undefined>('roles');
 const room={timeline:{mode:'MANUAL',epoch:1},roomInstanceId:'room',revision:1} as RoomView;
 const view:PrivateView={state:'RUNNING',roomInstanceId:'room',participant:{id:'me',nickname:'甲',seat:1},role:{roleId:'chef',name:'厨师',type:'TOWNSFOLK',alignment:'GOOD',summary:'能力',beginnerTip:'建议'},roleConfirmed:true,history:[],messages:[],game:current,room};
 return <GuidePriorityBoundary key={scope} enabled mode={mode} game={current} room={room} onClose={()=>setMode(undefined)}><PlayerGame {...handlers} view={view} roomCode="ABCDEF" guideOpen={!!mode} onCloseGuide={()=>setMode(undefined)}/>{mode?<Book close={()=>setMode(undefined)}/>:null}</GuidePriorityBoundary>;
}
beforeEach(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});});
afterEach(async()=>{cleanup();await act(async()=>{});sessionStorage.clear();localStorage.clear();window.history.replaceState({},'','/');vi.clearAllMocks();vi.restoreAllMocks();});

test.each(['EXECUTION','GAME_OVER'] as const)('%s stows the same live book, plays public stage, then explicitly returns to the saved detail',async kind=>{
 const ui=render(<Harness current={game()}/>);fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));
 const book=screen.getByRole('dialog',{name:'游戏帮助'}),detail=screen.getByRole('article',{name:'洗衣妇详情'}),scroll=detail.closest<HTMLElement>('[data-page-scroll]')!;scroll.scrollTop=215;fireEvent.scroll(scroll);
 ui.rerender(<Harness current={game([event(kind)])}/>);await act(async()=>{});
 expect(book).not.toBeVisible();expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();expect(screen.queryByText('公开结果')).not.toBeInTheDocument();
 expect(privateStage.mock.lastCall?.[0]).toMatchObject({covered:true,reading:true});
 ui.rerender(<Harness current={game([event(kind)],epoch+8000)}/>);await act(async()=>{});
 expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();expect(book).not.toBeVisible();expect(privateStage.mock.lastCall?.[0]).toMatchObject({covered:true,reading:true});
 fireEvent.click(screen.getByRole('button',{name:'返回手册'}));expect(screen.getByRole('dialog',{name:'游戏帮助'})).toBe(book);expect(screen.getByRole('article',{name:'洗衣妇详情'})).toBe(detail);expect(scroll.scrollTop).toBe(215);expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();
});

test.each(['click','Escape'] as const)('%s skip updates a manual-clock handoff immediately and returning never replays that event',async method=>{
 const ui=render(<Harness current={game()}/>),book=screen.getByRole('dialog',{name:'游戏帮助'});ui.rerender(<Harness current={game([event()])}/>);await act(async()=>{});
 if(method==='click')fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));else fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('button',{name:'返回手册'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'返回手册'}));expect(screen.getByRole('dialog',{name:'游戏帮助'})).toBe(book);expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();
 ui.rerender(<Harness current={game([{...event()}])}/>);expect(book).toBeVisible();expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();
});

test.each(['NIGHT_FALLS','DAWN','NOMINATION'] as const)('%s keeps ordinary reading in place',async kind=>{
 const ui=render(<Harness current={game()}/>),book=screen.getByRole('dialog',{name:'游戏帮助'});ui.rerender(<Harness current={game([event(kind)])}/>);await act(async()=>{});
 expect(book).toBeVisible();expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();
});

test('only current unviewed public critical events can yield the book',()=>{
 const e=event();expect(criticalGuideEvent(game([e]),epoch,new Set<string>())?.id).toBe(e.id);
 for(const[current,now,seen]of [[game([e]),epoch,new Set([e.id])],[game([e]),epoch-1,new Set<string>()],[game([e]),epoch+8000,new Set<string>()],[game([{...e,gameId:'old'}]),epoch,new Set<string>()],[game([event('DAWN')]),epoch,new Set<string>()]] as const)expect(criticalGuideEvent(current,now,seen)).toBeUndefined();
});

test.each(['background','privacy'] as const)('%s discards the stowed book and never opens it again on foreground',async reason=>{
 const ui=render(<Harness current={game([event()])}/>);await act(async()=>{});
 if(reason==='background'){Object.defineProperty(document,'hidden',{configurable:true,value:true});fireEvent(document,new Event('visibilitychange'));}else fireEvent(window,new Event('ravens:cover-private'));
 Object.defineProperty(document,'hidden',{configurable:true,value:false});fireEvent(document,new Event('visibilitychange'));
 ui.rerender(<Harness current={game([],epoch+8000)}/>);expect(screen.queryByRole('dialog',{name:'游戏帮助',hidden:true})).toBeNull();expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();
});


test('Root-owned completion signal restores a manual-clock book when storage writes fail, and ignores other games',async()=>{
 const ui=render(<Harness current={game()}/>),book=screen.getByRole('dialog',{name:'游戏帮助'});
 ui.rerender(<Harness current={game([event()])}/>);await act(async()=>{});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage disabled');});
 fireEvent(window,new CustomEvent('ravens:public-event-seen',{detail:{gameId:'other',eventId:'EXECUTION'}}));expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));
 // This worktree keeps Root's EventStage untouched: reproduce its documented page-local completion contract.
 fireEvent(window,new CustomEvent('ravens:public-event-seen',{detail:{gameId:'game',eventId:'EXECUTION'}}));
 expect(screen.getByRole('button',{name:'返回手册'})).toHaveFocus();fireEvent.click(screen.getByRole('button',{name:'返回手册'}));expect(book).toBeVisible();
 ui.rerender(<Harness current={game([{...event()}])}/>);expect(book).toBeVisible();expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();
});
