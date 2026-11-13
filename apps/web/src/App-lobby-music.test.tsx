// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {App,saveSession} from './App.js';
import {getAccount,getRoomSummary,getAuthSession,getRoom,getPrivateView,resetAccountContext,type PrivateView,type RoomView} from './api.js';
const feed=vi.hoisted(()=>({receive:undefined as undefined|((packet:{room:RoomView;privateView:PrivateView})=>void)}));
vi.mock('./api.js',async original=>({...await original<object>(),getAccount:vi.fn(),getRoomSummary:vi.fn(),getAuthSession:vi.fn(),getRoom:vi.fn(),getPrivateView:vi.fn()}));
vi.mock('./room-live.js',()=>({connectRoomFeed:(_code:string,_mode:string,receive:typeof feed.receive)=>{feed.receive=receive;return()=>{};}}));
vi.mock('./components/RoomTools.js',()=>({RoomTools:()=>null}));
vi.mock('./components/experience-audio.js',async original=>({...await original<object>(),unlockEffectsAudio:vi.fn(async()=>{})}));
const tracks:Track[]=[];
class Track {paused=true;loop=false;preload='';volume=1;play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){tracks.push(this);}}
function fixture(phase:'ROLE_REVEAL'|'FIRST_NIGHT',confirmed:boolean,revision:number){
 const game={gameId:'music-game',phase,day:0,readyCount:0,aliveCount:5,events:[],seats:[1,2,3,4,5].map(seat=>({seat,nickname:`成员${seat}`,alive:true,connected:true,ghostVoteAvailable:true}))};
 const room:RoomView={code:'ABCDEF',roomInstanceId:'music-room',revision,state:'RUNNING',playerCount:5,participants:[{id:'me',seat:1,nickname:'本人',mode:'PLAYER',connected:true}],game};
 const view:PrivateView={...room,room,participant:{id:'me',seat:1,nickname:'本人'},role:{roleId:'soldier',name:'士兵',summary:'能力',beginnerTip:'建议',alignment:'GOOD',type:'TOWNSFOLK'},roleConfirmed:confirmed,messages:[],history:[],game};
 return {room,privateView:view};
}
beforeEach(()=>{resetAccountContext();tracks.length=0;feed.receive=undefined;localStorage.clear();sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('Audio',Track);vi.mocked(getAuthSession).mockResolvedValue({authorized:true});vi.mocked(getAccount).mockResolvedValue({signedIn:false,guestClaimAvailable:false,rooms:[]});vi.mocked(getRoomSummary).mockResolvedValue({roomInstanceId:'music-room',state:'RUNNING',canJoin:false,willReplaceBot:false,botCount:0,activeHumanCount:1,occupiedAvatars:[]});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();sessionStorage.clear();resetAccountContext();window.history.replaceState({},'','/');});
test('the room keeps one M19 track after my confirmation and stops it when everyone enters first night',async()=>{
 const initial=fixture('ROLE_REVEAL',false,1);vi.mocked(getRoom).mockResolvedValue(initial.room);vi.mocked(getPrivateView).mockResolvedValue(initial.privateView);
 saveSession({roomCode:'ABCDEF',mode:'PLAYER',participantId:'me'});window.history.replaceState({},'','/?room=ABCDEF');render(<App/>);
 await screen.findByRole('heading',{name:'身份确认'});await waitFor(()=>expect(tracks[0]?.paused).toBe(false));const track=tracks[0]!;expect(track.src).toContain('/M19.mp3');
 const mine=fixture('ROLE_REVEAL',true,2);vi.mocked(getRoom).mockResolvedValue(mine.room);vi.mocked(getPrivateView).mockResolvedValue(mine.privateView);
 await act(async()=>feed.receive?.(mine));expect(tracks).toHaveLength(1);expect(track.paused).toBe(false);
 const night=fixture('FIRST_NIGHT',true,3);vi.mocked(getRoom).mockResolvedValue(night.room);vi.mocked(getPrivateView).mockResolvedValue(night.privateView);
 await act(async()=>feed.receive?.(night));await waitFor(()=>expect(track.paused).toBe(true));expect(screen.queryByRole('complementary',{name:'大厅音乐'})).toBeNull();
});
