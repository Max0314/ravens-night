// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {App} from './App.js';
import {saveSession,readSession,readStoredRoom} from './room-session.js';
import {ApiError,getAccount,getAuthSession,getPrivateView,getRoom,getRoomSummary,joinRoom,createRoom,requestRoomSwitchTicket,switchRoom,retryPendingRoomSwitch,resetAccountContext,finishPendingRoomSwitch,type RoomView,type PrivateView} from './api.js';
vi.mock('./api.js',async original=>({...await original<object>(),getAuthSession:vi.fn(),getAccount:vi.fn(),getRoom:vi.fn(),getRoomSummary:vi.fn(),getPrivateView:vi.fn(),joinRoom:vi.fn(),createRoom:vi.fn(),requestRoomSwitchTicket:vi.fn(),switchRoom:vi.fn(),retryPendingRoomSwitch:vi.fn()}));
vi.mock('./room-live.js',()=>({connectRoomFeed:()=>()=>{}}));
vi.mock('./components/RoomTools.js',()=>({RoomTools:()=>null}));
vi.mock('./pages/Home.js',()=>({Home:({onCreate,onJoin,error,busy}:{onCreate:()=>void;onJoin:()=>void;error?:string;busy?:boolean})=><><h1>首页</h1><p>{error}</p><button disabled={busy} onClick={onCreate}>创建房间</button><button disabled={busy} onClick={onJoin}>加入房间</button></>}));
vi.mock('./pages/Create.js',()=>({Create:({onSubmit}:{onSubmit:(...args:unknown[])=>void})=><><h1>创建房间</h1><button onClick={()=>onSubmit('新昵称',5,'IN_PERSON',undefined,{nickname:'新昵称',avatar:'avatar'})}>确认创建</button></>}));
vi.mock('./pages/Join.js',()=>({Join:({onSubmit,onBack,error,previousRoom,busy}:{onSubmit:(value:unknown)=>void;onBack:()=>void;error?:string;busy:boolean;previousRoom?:{onReturn:()=>void}})=><><h1>加入房间</h1><p>{error}</p><button disabled={busy} onClick={()=>onSubmit({code:'NEWRMM',mode:'PLAYER',nickname:'新玩家',avatar:'avatar'})}>提交加入</button><button onClick={onBack}>返回首页</button>{previousRoom?<button onClick={previousRoom.onReturn}>返回保留的房间</button>:null}</>}));
vi.mock('./pages/Lobby.js',()=>({Lobby:({room}:{room:RoomView})=><h1>大厅 {room.code}</h1>}));
vi.mock('./pages/PlayerGame.js',()=>({hasPrivateTownTask:()=>false,PlayerGame:({roomCode,onBack}:{roomCode:string;onBack:()=>void})=><><h1>游戏 {roomCode}</h1><button onClick={onBack}>游戏返回首页</button></>}));
const source:RoomView={code:'OLDRMM',roomInstanceId:'old-instance',revision:1,state:'RUNNING',organizerId:'host',playerCount:5,activeHumanCount:3,self:{participantId:'host',mode:'PLAYER',commandVersion:0},participants:[{id:'host',seat:1,nickname:'房主',mode:'PLAYER',connected:true}]};
const target:RoomView={...source,code:'NEWRMM',roomInstanceId:'new-instance',state:'LOBBY',organizerId:'other',self:{participantId:'joined',mode:'PLAYER',commandVersion:0}};
const makeView=(room:RoomView):PrivateView=>({room,roomInstanceId:room.roomInstanceId!,state:room.state,participant:{id:room.self!.participantId,seat:1,nickname:'本人'},messages:[],history:[]});
beforeEach(()=>{resetAccountContext();vi.clearAllMocks();vi.mocked(getAuthSession).mockResolvedValue({authorized:true});vi.mocked(getAccount).mockResolvedValue({signedIn:false,guestClaimAvailable:false,rooms:[]});vi.mocked(getRoom).mockImplementation(async code=>code==='OLDRMM'?source:target);vi.mocked(getPrivateView).mockImplementation(async code=>makeView(code==='OLDRMM'?source:target));vi.mocked(getRoomSummary).mockResolvedValue({roomInstanceId:'new-instance',state:'LOBBY',canJoin:true,willReplaceBot:false,botCount:0,activeHumanCount:1,occupiedAvatars:[]});vi.mocked(requestRoomSwitchTicket).mockResolvedValue({switchTicket:'signed-switch',expiresAt:Date.now()+300000,source:{code:'OLDRMM',roomInstanceId:'old-instance',state:'RUNNING',activeHumanCount:3,playerCount:5}});});
afterEach(()=>{cleanup();finishPendingRoomSwitch();resetAccountContext();sessionStorage.clear();localStorage.clear();window.history.replaceState({},'','/');});
const saveHost=()=>saveSession({roomCode:'OLDRMM',mode:'PLAYER',participantId:'host',roomInstanceId:'old-instance',isHost:true});

test('an expired invitation reaches home and can create a fresh room with a fresh invitation URL',async()=>{
 window.history.replaceState({},'','/?room=GONERM&display=1');vi.mocked(getRoomSummary).mockRejectedValueOnce(new ApiError('房间不存在',404,'ROOM_NOT_FOUND'));vi.mocked(createRoom).mockResolvedValue({code:'NEWRMM',organizerToken:'opaque'});vi.mocked(joinRoom).mockResolvedValue({id:'joined',nickname:'我',mode:'PLAYER',token:'opaque'});
 render(<App/>);expect(await screen.findByRole('heading',{name:'首页'})).toBeVisible();expect(location.search).toBe('');expect(screen.getByText('邀请房间已结束，可创建或加入其他房间。')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'创建房间'}));fireEvent.click(screen.getByRole('button',{name:'确认创建'}));expect(await screen.findByRole('heading',{name:'大厅 NEWRMM'})).toBeVisible();expect(new URLSearchParams(location.search).get('room')).toBe('NEWRMM');expect(location.search).not.toContain('display');
});
test('a dead invitation restores the verified original host room and does not join the dead code',async()=>{
 saveHost();window.history.replaceState({},'','/?room=GONERM');vi.mocked(getRoomSummary).mockRejectedValueOnce(new ApiError('房间不存在',404,'ROOM_NOT_FOUND'));
 render(<App/>);expect(await screen.findByRole('heading',{name:'游戏 OLDRMM'})).toBeVisible();expect(location.search).toBe('?room=OLDRMM');expect(readSession()?.isHost).toBe(true);expect(joinRoom).not.toHaveBeenCalled();expect(switchRoom).not.toHaveBeenCalled();
});
test('valid other-room invitations ask before changing the original host room',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');render(<App/>);const choice=await screen.findByRole('dialog',{name:'选择房间'});expect(within(choice).getByText(/OLDRMM/)).toBeVisible();expect(joinRoom).not.toHaveBeenCalled();expect(switchRoom).not.toHaveBeenCalled();
 fireEvent.click(within(choice).getByRole('button',{name:'回到我的房间'}));expect(await screen.findByRole('heading',{name:'游戏 OLDRMM'})).toBeVisible();expect(location.search).toBe('?room=OLDRMM');
});
test('a running room with other humans is closed only after the explicit second confirmation',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');vi.mocked(switchRoom).mockResolvedValue({id:'joined',nickname:'我',mode:'PLAYER',token:'opaque',closedRoomCode:'OLDRMM'});render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'继续加入新房间'}));fireEvent.click(screen.getByRole('button',{name:'提交加入'}));const confirmation=await screen.findByRole('alertdialog',{name:'加入新房间并关闭旧房间'});expect(confirmation).toHaveTextContent('已经开局');expect(confirmation).toHaveTextContent('3 名真人');expect(switchRoom).not.toHaveBeenCalled();
 fireEvent.click(within(confirmation).getByRole('button',{name:'加入并关闭旧房间'}));expect(await screen.findByRole('heading',{name:'大厅 NEWRMM'})).toBeVisible();expect(switchRoom).toHaveBeenCalledOnce();expect(readStoredRoom('OLDRMM')).toBeUndefined();expect(readSession()?.roomCode).toBe('NEWRMM');
});
test('a failed target join keeps the original host seat and offers a direct way back',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');vi.mocked(switchRoom).mockRejectedValue(new ApiError('目标房间已满',409,'ROOM_FULL'));render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'继续加入新房间'}));fireEvent.click(screen.getByRole('button',{name:'提交加入'}));const dialog=await screen.findByRole('alertdialog',{name:'加入新房间并关闭旧房间'});fireEvent.click(within(dialog).getByRole('button',{name:'加入并关闭旧房间'}));await waitFor(()=>expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());expect(screen.getByText('目标房间已满')).toBeVisible();expect(readStoredRoom('OLDRMM')?.participantId).toBe('host');
 fireEvent.click(screen.getByRole('button',{name:'返回保留的房间'}));expect(await screen.findByRole('heading',{name:'游戏 OLDRMM'})).toBeVisible();
});
test('temporary invitation errors preserve the original session and require retry instead of destroying it',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');vi.mocked(getRoomSummary).mockRejectedValue(new ApiError('暂时不可用',503,'SERVER_UNAVAILABLE'));render(<App/>);expect(await screen.findByRole('button',{name:'重试房间核对'})).toBeVisible();expect(readStoredRoom('OLDRMM')?.participantId).toBe('host');expect(screen.getByRole('button',{name:'提交加入'})).toBeDisabled();expect(switchRoom).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'返回首页'}));expect(await screen.findByRole('heading',{name:'首页'})).toBeVisible();expect(location.search).toBe('');expect(readStoredRoom('OLDRMM')).toBeDefined();
});
test('a stale local host flag cannot offer destruction after ownership changed',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');vi.mocked(getRoom).mockImplementation(async code=>code==='OLDRMM'?{...source,organizerId:'new-host'}:target);render(<App/>);await screen.findByRole('heading',{name:'加入房间'});expect(screen.queryByRole('dialog',{name:'选择房间'})).not.toBeInTheDocument();expect(requestRoomSwitchTicket).not.toHaveBeenCalled();
});

test('a reloaded pending transfer is recovered before probing the now-closed source or invitation',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');sessionStorage.setItem('ravens_room_switch:ravens_room_session',JSON.stringify({sourceCode:'OLDRMM',sourceInstance:'old-instance',targetCode:'NEWRMM',targetInstance:'new-instance',switchTicket:'original-switch',joinTicket:'original-join',profile:{nickname:'原提交',avatar:'avatar'},fingerprint:'original-intent',createdAt:Date.now()}));
 vi.mocked(retryPendingRoomSwitch).mockResolvedValue({id:'joined',nickname:'原提交',mode:'PLAYER',token:'opaque',closedRoomCode:'OLDRMM'});render(<App/>);expect(await screen.findByRole('heading',{name:'大厅 NEWRMM'})).toBeVisible();expect(retryPendingRoomSwitch).toHaveBeenCalledOnce();expect(getRoomSummary).not.toHaveBeenCalled();expect(getRoom).not.toHaveBeenCalledWith('OLDRMM','PLAYER');expect(readStoredRoom('OLDRMM')).toBeUndefined();expect(readSession()?.roomCode).toBe('NEWRMM');expect(sessionStorage.getItem('ravens_room_switch:ravens_room_session')).toBeNull();
});
test('a host handoff between confirmation and commit preserves the original participant recovery record',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');vi.mocked(switchRoom).mockRejectedValue(new ApiError('房主已变更',409,'HOST_CHANGED'));render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'继续加入新房间'}));fireEvent.click(screen.getByRole('button',{name:'提交加入'}));const dialog=await screen.findByRole('alertdialog',{name:'加入新房间并关闭旧房间'});fireEvent.click(within(dialog).getByRole('button',{name:'加入并关闭旧房间'}));await waitFor(()=>expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());expect(readStoredRoom('OLDRMM')).toMatchObject({participantId:'host',isHost:false});expect(screen.getByText('房主已变更')).toBeVisible();
});

test('an expired invitation with its own stale seat record still falls back to the other verified host room',async()=>{
 saveHost();saveSession({roomCode:'GONERM',mode:'PLAYER',participantId:'stale'});window.history.replaceState({},'','/?room=GONERM');vi.mocked(getRoom).mockImplementation(async code=>{if(code==='GONERM')throw new ApiError('房间不存在',404,'ROOM_NOT_FOUND');return source;});vi.mocked(getRoomSummary).mockRejectedValueOnce(new ApiError('房间不存在',404,'ROOM_NOT_FOUND'));
 render(<App/>);await waitFor(()=>expect(screen.getByRole('heading',{name:'游戏 OLDRMM'})).toBeVisible());expect(location.search).toBe('?room=OLDRMM');expect(readStoredRoom('GONERM')).toBeUndefined();expect(readStoredRoom('OLDRMM')).toBeDefined();
});

test('a saved ordinary target seat still asks before leaving another valid owned room',async()=>{
 saveSession({roomCode:'NEWRMM',mode:'PLAYER',participantId:'joined',roomInstanceId:'new-instance',isHost:false});saveHost();window.history.replaceState({},'','/?room=NEWRMM');render(<App/>);expect(await screen.findByRole('dialog',{name:'选择房间'})).toBeVisible();expect(switchRoom).not.toHaveBeenCalled();expect(joinRoom).not.toHaveBeenCalled();expect(getPrivateView).not.toHaveBeenCalledWith('NEWRMM');
});

test('a late invitation summary cannot pull a player back after home and create navigation',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');let finish!:(value:Awaited<ReturnType<typeof getRoomSummary>>)=>void;vi.mocked(getRoomSummary).mockRejectedValueOnce(new ApiError('暂时不可用',503)).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'重试房间核对'}));await waitFor(()=>expect(getRoomSummary).toHaveBeenCalledTimes(2));fireEvent.click(screen.getByRole('button',{name:'返回首页'}));fireEvent.click(screen.getByRole('button',{name:'创建房间'}));
 await act(async()=>finish({roomInstanceId:'new-instance',state:'LOBBY',canJoin:true,willReplaceBot:false,botCount:0,activeHumanCount:1,occupiedAvatars:[]}));expect(screen.getByRole('heading',{name:'创建房间'})).toBeVisible();expect(getRoom).not.toHaveBeenCalled();expect(screen.queryByRole('dialog',{name:'选择房间'})).not.toBeInTheDocument();
});
test('a late source-room probe cannot override browser back and a new create screen',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');let finish!:(value:RoomView)=>void;vi.mocked(getRoom).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<App/>);await waitFor(()=>expect(getRoom).toHaveBeenCalledWith('OLDRMM','PLAYER'));fireEvent(window,new PopStateEvent('popstate',{state:{ravensScreen:'HOME'}}));fireEvent.click(screen.getByRole('button',{name:'创建房间'}));await act(async()=>finish(source));expect(screen.getByRole('heading',{name:'创建房间'})).toBeVisible();expect(screen.queryByRole('dialog',{name:'选择房间'})).not.toBeInTheDocument();expect(getPrivateView).not.toHaveBeenCalled();
});
test('explicit switch capacity rejection preserves the source and leaves the confirmation cancellable',async()=>{
 saveHost();window.history.replaceState({},'','/?room=NEWRMM');vi.mocked(switchRoom).mockRejectedValue(new ApiError('换房恢复操作较多，请稍后再试',429,'JOIN_TRANSFER_CAPACITY'));render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'继续加入新房间'}));fireEvent.click(screen.getByRole('button',{name:'提交加入'}));const dialog=await screen.findByRole('alertdialog',{name:'加入新房间并关闭旧房间'});fireEvent.click(within(dialog).getByRole('button',{name:'加入并关闭旧房间'}));await waitFor(()=>expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());expect(readStoredRoom('OLDRMM')?.participantId).toBe('host');expect(screen.getByRole('button',{name:'返回保留的房间'})).toBeEnabled();expect(screen.queryByRole('button',{name:'重试原换房操作'})).not.toBeInTheDocument();
});

test('returning home during a slow join releases the old entry busy state and ignores its eventual response',async()=>{
 let finish!:(value:Awaited<ReturnType<typeof joinRoom>>)=>void;vi.mocked(joinRoom).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'加入房间'}));fireEvent.click(screen.getByRole('button',{name:'提交加入'}));await waitFor(()=>expect(joinRoom).toHaveBeenCalledOnce());expect(screen.getByRole('button',{name:'提交加入'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'返回首页'}));expect(screen.getByRole('button',{name:'创建房间'})).toBeEnabled();expect(screen.getByRole('button',{name:'加入房间'})).toBeEnabled();
 await act(async()=>finish({id:'joined',nickname:'新玩家',mode:'PLAYER',token:'opaque'}));expect(screen.getByRole('heading',{name:'首页'})).toBeVisible();expect(screen.getByRole('button',{name:'创建房间'})).toBeEnabled();expect(screen.getByRole('button',{name:'加入房间'})).toBeEnabled();expect(getPrivateView).not.toHaveBeenCalled();
});
