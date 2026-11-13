// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {App,saveSession} from './App.js';
import {getAccount,getAuthSession,getPrivateView,getRoom,type PrivateView,type RoomView} from './api.js';
import type {RoomPacket} from './room-live.js';
const feed=vi.hoisted(()=>({receive:undefined as ((packet:RoomPacket)=>void)|undefined}));
vi.mock('./api.js',async original=>({...await original<object>(),getAuthSession:vi.fn(),getAccount:vi.fn(),getRoom:vi.fn(),getPrivateView:vi.fn()}));
vi.mock('./room-live.js',()=>({connectRoomFeed:(_code:string,_mode:string,receive:(packet:RoomPacket)=>void)=>{feed.receive=receive;return()=>{};}}));
vi.mock('./components/RoomTools.js',()=>({RoomTools:({onGuide}:{onGuide:(mode:'roles')=>void})=><button onClick={()=>onGuide('roles')}>打开手册</button>}));
vi.mock('./components/PrivateSceneStage.js',()=>({PrivateSceneStage:()=>null}));
vi.mock('./components/book-audio.js',()=>({createBookAudio:()=>({prepare:async()=>true,turn:()=>{},silence:()=>{},dispose:()=>{}})}));
vi.mock('./components/experience-audio.js',async original=>({...await original<typeof import('./components/experience-audio.js')>(),effectsAudioEnabled:()=>false,audioControlEnabled:()=>false}));
const epoch=1790500000000;
function snapshot(revision=1,gameId='g',critical=false):PrivateView{
 const game={gameId,phase:'DAY_DISCUSSION' as const,day:1,serverNow:epoch,events:critical?[{id:'execution',gameId,seq:1,kind:'EXECUTION' as const,message:'已公开结果',occurredAt:epoch,startsAt:epoch+1500,durationMs:6000,targetSeat:2,outcome:'DEATH' as const}]:[],aliveCount:5,readyCount:0,seats:[1,2,3,4,5].map(seat=>({seat,nickname:'成员'+seat,alive:true,connected:true,ghostVoteAvailable:true}))};
 const room:RoomView={code:'NEW456',roomInstanceId:'room',revision,state:'RUNNING',playerCount:5,participants:[{id:'me',seat:1,nickname:'甲',mode:'PLAYER',connected:true}],timeline:{mode:'MANUAL',epoch:1},game};
 return{revision,state:'RUNNING',roomInstanceId:'room',room,participant:{id:'me',seat:1,nickname:'甲'},roleConfirmed:true,role:{roleId:'soldier',name:'士兵',summary:'能力',beginnerTip:'建议',alignment:'GOOD',type:'TOWNSFOLK'},messages:[],history:[],game};
}
beforeEach(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.mocked(getAuthSession).mockResolvedValue({authorized:true});vi.mocked(getAccount).mockResolvedValue({signedIn:false,guestClaimAvailable:false,rooms:[]});const mine=snapshot();vi.mocked(getRoom).mockResolvedValue(mine.room!);vi.mocked(getPrivateView).mockResolvedValue(mine);saveSession({roomCode:'NEW456',mode:'PLAYER',participantId:'me'});});
afterEach(async()=>{cleanup();await act(async()=>{});sessionStorage.clear();localStorage.clear();window.history.replaceState({},'','/');vi.clearAllMocks();feed.receive=undefined;});

test('App wiring yields on a published snapshot and a new game discards the old stowed book',async()=>{
 render(<App/>);await screen.findByRole('region',{name:'公开城镇'});await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'打开手册'}));fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));
 const book=screen.getByRole('dialog',{name:'游戏帮助'});await waitFor(()=>expect(feed.receive).toBeTypeOf('function'));
 const execution=snapshot(2,'g',true);vi.mocked(getPrivateView).mockResolvedValue(execution);
 act(()=>feed.receive!({type:'view',room:execution.room!,privateView:execution,serverNow:epoch}));await act(async()=>{});
 expect(book).not.toBeVisible();expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));expect(screen.getByRole('button',{name:'返回手册'})).toBeVisible();
 const restarted=snapshot(3,'next');vi.mocked(getPrivateView).mockResolvedValue(restarted);act(()=>feed.receive!({type:'view',room:restarted.room!,privateView:restarted,serverNow:epoch}));await act(async()=>{});
 expect(screen.queryByRole('button',{name:'返回手册'})).toBeNull();expect(document.contains(book)).toBe(false);expect(screen.queryByRole('dialog',{name:'游戏帮助',hidden:true})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'打开手册'}));expect(screen.getByRole('button',{name:'查看洗衣妇详情'})).toBeVisible();
});
