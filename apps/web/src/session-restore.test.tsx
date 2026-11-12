// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {App,readSession,saveSession} from './App.js';
import {ApiError,getAccount,getAuthSession,getPrivateView,getRoom,getRoomSummary,joinRoom,type PrivateView,type RoomView} from './api.js';
vi.mock('./api.js',async original=>({...await original<object>(),getAuthSession:vi.fn(),getAccount:vi.fn(),getRoom:vi.fn(),getRoomSummary:vi.fn(),getPrivateView:vi.fn(),joinRoom:vi.fn()}));
vi.mock('./room-live.js',()=>({connectRoomFeed:()=>()=>{}}));
vi.mock('./components/RoomTools.js',()=>({RoomTools:()=>null}));
vi.mock('./pages/Join.js',()=>({Join:({onSubmit,error}:{onSubmit:(value:unknown)=>void;error?:string})=><><h1>加入房间</h1><p>{error}</p><button onClick={()=>onSubmit({code:'NEW456',mode:'PLAYER',nickname:'新玩家'})}>改填房间加入</button></>}));
const room:RoomView={code:'NEW456',roomInstanceId:'new-room',revision:2,state:'RUNNING',playerCount:5,participants:[{id:'me',seat:1,nickname:'原资料',mode:'PLAYER',connected:true}]};
const view:PrivateView={revision:2,state:'RUNNING',roomInstanceId:'new-room',room,participant:{id:'me',seat:1,nickname:'原资料'},role:{roleId:'soldier',name:'士兵',summary:'能力',beginnerTip:'建议',alignment:'GOOD',type:'TOWNSFOLK'},messages:[],history:[],game:{gameId:'g',phase:'DAY_DISCUSSION',day:2,aliveCount:5,readyCount:0,events:[],seats:[1,2,3,4,5].map(seat=>({seat,nickname:`成员${seat}`,alive:true,connected:true,ghostVoteAvailable:true}))}};
room.game=view.game!;
beforeEach(()=>{vi.mocked(getRoomSummary).mockResolvedValue({roomInstanceId:'new-room',state:'RUNNING',canJoin:false,willReplaceBot:false,botCount:0,activeHumanCount:1,occupiedAvatars:[]});vi.mocked(getAuthSession).mockResolvedValue({authorized:true});vi.mocked(getAccount).mockResolvedValue({signedIn:false,guestClaimAvailable:false,rooms:[]});vi.mocked(getRoom).mockResolvedValue(room);vi.mocked(getPrivateView).mockResolvedValue(view);});
afterEach(()=>{cleanup();vi.clearAllMocks();sessionStorage.clear();localStorage.clear();window.history.replaceState({},'','/');});

test('an invitation restores its saved seat ahead of another tabs session and skips the account lookup',async()=>{
 saveSession({roomCode:'NEW456',mode:'PLAYER',participantId:'me'});saveSession({roomCode:'OLD123',mode:'PLAYER',participantId:'old'});window.history.replaceState({},'','/?room=NEW456');
 let finish!:(value:PrivateView)=>void;vi.mocked(getPrivateView).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<App/>);await waitFor(()=>expect(getPrivateView).toHaveBeenCalledWith('NEW456'));expect(screen.getByLabelText('正在进入钟楼')).toBeVisible();expect(screen.queryByRole('region',{name:'公开城镇'})).not.toBeInTheDocument();
 await act(async()=>finish(view));expect(await screen.findByRole('region',{name:'公开城镇'})).toBeVisible();expect(readSession()?.participantId).toBe('me');expect(getAccount).not.toHaveBeenCalled();
});

test('explicitly joining another code replaces the old invitation before restoring the joined seat',async()=>{
 saveSession({roomCode:'OTHER2',mode:'PLAYER',participantId:'other'});window.history.replaceState({},'','/?room=OLD123');
 vi.mocked(joinRoom).mockResolvedValue({id:'me'} as Awaited<ReturnType<typeof joinRoom>>);
 render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'改填房间加入'}));
 expect(await screen.findByRole('region',{name:'公开城镇'})).toBeVisible();expect(new URLSearchParams(location.search).get('room')).toBe('NEW456');expect(readSession()?.roomCode).toBe('NEW456');
});

test('a removed seat clears its recovery record and explains where to go next',async()=>{
 saveSession({roomCode:'NEW456',mode:'PLAYER',participantId:'me'});window.history.replaceState({},'','/?room=NEW456');vi.mocked(getRoom).mockRejectedValueOnce(new ApiError('已移除',403,'SEAT_REMOVED'));
 render(<App/>);expect(await screen.findByText('你已被移出原房间，可重新加入或创建房间。')).toBeVisible();expect(readSession()).toBeUndefined();
});
