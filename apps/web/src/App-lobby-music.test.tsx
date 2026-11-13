// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {App,saveSession} from './App.js';
import {getAccount,getRoomSummary,getAuthSession,getRoom,getPrivateView,resetAccountContext,type PrivateView,type RoomView} from './api.js';
const feed=vi.hoisted(()=>({receive:undefined as undefined|((packet:{room:RoomView;privateView:PrivateView})=>void)}));
const scoreSound=vi.hoisted(()=>({context:undefined as unknown as AudioContext}));
vi.mock('./api.js',async original=>({...await original<object>(),getAccount:vi.fn(),getRoomSummary:vi.fn(),getAuthSession:vi.fn(),getRoom:vi.fn(),getPrivateView:vi.fn()}));
vi.mock('./room-live.js',()=>({connectRoomFeed:(_code:string,_mode:string,receive:typeof feed.receive)=>{feed.receive=receive;return()=>{};}}));
vi.mock('./components/RoomTools.js',()=>({RoomTools:()=>null}));
vi.mock('./components/experience-audio.js',async original=>({...await original<object>(),getEffectsAudioContext:()=>scoreSound.context,unlockEffectsAudio:vi.fn(async()=>{})}));
const tracks:Track[]=[];
class Track extends EventTarget {paused=true;loop=false;preload='';volume=1;scoreGain:{value:number}|undefined;muted=false;readyState=4;currentTime=0;error=null;load=vi.fn();play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){super();tracks.push(this);}}
function fixture(phase:'ROLE_REVEAL'|'FIRST_NIGHT'|'DAY_DISCUSSION',confirmed:boolean,revision:number){
 const game={gameId:'music-game',phase,day:0,readyCount:0,aliveCount:5,events:[],seats:[1,2,3,4,5].map(seat=>({seat,nickname:`成员${seat}`,alive:true,connected:true,ghostVoteAvailable:true}))};
 const room:RoomView={code:'ABCDEF',roomInstanceId:'music-room',revision,state:'RUNNING',playerCount:5,participants:[{id:'me',seat:1,nickname:'本人',mode:'PLAYER',connected:true}],game};
 const view:PrivateView={...room,room,participant:{id:'me',seat:1,nickname:'本人'},role:{roleId:'soldier',name:'士兵',summary:'能力',beginnerTip:'建议',alignment:'GOOD',type:'TOWNSFOLK'},roleConfirmed:confirmed,messages:[],history:[],game};
 return {room,privateView:view};
}
beforeEach(()=>{scoreSound.context=Object.assign(new EventTarget(),{state:'running',destination:{},createGain:()=>({gain:{value:0},connect:()=>{},disconnect:()=>{}}),createMediaElementSource:(audio:Track)=>({connect:(gain:{gain:{value:number}})=>{audio.scoreGain=gain.gain;},disconnect:()=>{}})}) as unknown as AudioContext;resetAccountContext();tracks.length=0;feed.receive=undefined;localStorage.clear();sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('Audio',Track);vi.mocked(getAuthSession).mockResolvedValue({authorized:true});vi.mocked(getAccount).mockResolvedValue({signedIn:false,guestClaimAvailable:false,rooms:[]});vi.mocked(getRoomSummary).mockResolvedValue({roomInstanceId:'music-room',state:'RUNNING',canJoin:false,willReplaceBot:false,botCount:0,activeHumanCount:1,occupiedAvatars:[]});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();sessionStorage.clear();resetAccountContext();window.history.replaceState({},'','/');});
test('an already open private handbook cannot reveal a role through the opening-night gate',async()=>{
 const initial=fixture('DAY_DISCUSSION',true,1);vi.mocked(getRoom).mockResolvedValue(initial.room);vi.mocked(getPrivateView).mockResolvedValue(initial.privateView);saveSession({roomCode:'ABCDEF',mode:'PLAYER',participantId:'me'});window.history.replaceState({},'','/?room=ABCDEF');render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'记录'}));fireEvent.click(screen.getByRole('button',{name:'我的角色'}));expect(document.querySelector('.own-role-guide h1')).toHaveTextContent('士兵');
 const locked=fixture('ROLE_REVEAL',false,2),end=Date.now()+20000;locked.room.game!.serverNow=Date.now();locked.room.game!.presentationUntil=end;vi.mocked(getRoom).mockResolvedValue(locked.room);vi.mocked(getPrivateView).mockResolvedValue(locked.privateView);await act(async()=>feed.receive?.(locked));
 expect(document.querySelector('.own-role-guide')).toBeNull();expect(screen.queryByRole('button',{name:'确认身份'})).toBeNull();expect(screen.queryByRole('img',{name:'士兵角色立绘'})).toBeNull();expect(screen.getByRole('heading',{name:'阵营与胜负'})).toBeVisible();
 const ready=fixture('ROLE_REVEAL',false,3);ready.room.game!.serverNow=end;ready.room.game!.presentationUntil=end;await act(async()=>feed.receive?.(ready));expect(document.querySelector('.own-role-guide h1')).toHaveTextContent('士兵');
});
test('M19 survives role confirmation and first night, then crossfades to M15 at the published first dawn',async()=>{
 const initial=fixture('ROLE_REVEAL',false,1);vi.mocked(getRoom).mockResolvedValue(initial.room);vi.mocked(getPrivateView).mockResolvedValue(initial.privateView);
 saveSession({roomCode:'ABCDEF',mode:'PLAYER',participantId:'me'});window.history.replaceState({},'','/?room=ABCDEF');render(<App/>);
 await screen.findByRole('heading',{name:'身份确认'});expect(screen.queryByRole('button',{name:'房间菜单'})).toBeNull();expect(screen.queryByRole('button',{name:'关闭声音'})).toBeNull();await waitFor(()=>expect(tracks[0]?.paused).toBe(false));const track=tracks[0]!;expect(track.src).toContain('/lobby-m19.mp3');track.currentTime=43;
 const mine=fixture('ROLE_REVEAL',true,2);vi.mocked(getRoom).mockResolvedValue(mine.room);vi.mocked(getPrivateView).mockResolvedValue(mine.privateView);
 await act(async()=>feed.receive?.(mine));expect(screen.queryByRole('button',{name:'房间菜单'})).toBeNull();expect(tracks).toHaveLength(1);expect(track.paused).toBe(false);
 const night=fixture('FIRST_NIGHT',true,3);vi.mocked(getRoom).mockResolvedValue(night.room);vi.mocked(getPrivateView).mockResolvedValue(night.privateView);
 await act(async()=>feed.receive?.(night));expect(track.paused).toBe(false);expect(track.currentTime).toBe(43);expect(tracks).toHaveLength(1);
 const dawn=fixture('DAY_DISCUSSION',true,4);const startsAt=Date.now()+10_000;
 dawn.room.game!.serverNow=startsAt-5000;dawn.room.game!.day=1;
 dawn.room.game!.events=[{seq:1,id:'night',kind:'NIGHT_FALLS',day:0,startsAt:startsAt-60000,durationMs:6200,message:'入夜'},{seq:2,id:'dawn',kind:'DAWN',day:1,startsAt,durationMs:5000,message:'天亮'}];
 await act(async()=>feed.receive?.(dawn));expect(track.paused).toBe(false);
 const started=fixture('DAY_DISCUSSION',true,5);started.room.game!.serverNow=startsAt;started.room.game!.day=1;started.room.game!.events=dawn.room.game!.events;
 await act(async()=>feed.receive?.(started));await waitFor(()=>expect(track.paused).toBe(true),{timeout:3000});expect(track.currentTime).toBe(43);expect(tracks).toHaveLength(2);expect(tracks[1]!.src).toContain('/background-m15.mp3');expect(tracks[1]!.paused).toBe(false);expect(tracks[1]!.scoreGain?.value).toBeCloseTo(.8);
 expect(screen.queryByRole('button',{name:/大厅音乐/})).toBeNull();
});

test('home, create and join reuse one music owner and one compact global header control',async()=>{
 render(<App/>);await screen.findByRole('heading',{name:'鸦钟夜话'});await waitFor(()=>expect(tracks[0]?.paused).toBe(false));const track=tracks[0]!;track.currentTime=28;
 expect(screen.getAllByRole('button',{name:/关闭声音/})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'创建房间'}));await screen.findByRole('heading',{name:'创建房间'});expect(screen.getByRole('button',{name:'关闭声音'}).closest('.room-page__header')).not.toBeNull();expect(tracks).toHaveLength(1);expect(track.paused).toBe(false);expect(track.currentTime).toBe(28);
 fireEvent.click(screen.getByRole('button',{name:'返回首页'}));await screen.findByRole('heading',{name:'鸦钟夜话'});
 fireEvent.click(screen.getByRole('button',{name:'加入房间'}));await screen.findByRole('heading',{name:'加入房间'});expect(screen.getByRole('button',{name:'关闭声音'}).closest('.room-page__header')).not.toBeNull();expect(tracks).toHaveLength(1);expect(track.paused).toBe(false);expect(track.currentTime).toBe(28);
});
