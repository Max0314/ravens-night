// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Home} from './pages/Home.js';
import {AccountPanel} from './components/AccountPanel.js';
import {HomePortrait} from './components/HomePortrait.js';
import {getAccount,getAvatarChoices,saveGameProfile} from './api.js';
vi.mock('./api.js',async original=>({...await original<object>(),getAccount:vi.fn(),getAvatarChoices:vi.fn(),saveGameProfile:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();vi.useRealTimers();window.history.replaceState({},'','/');});
const profile={revision:0,nickname:'默认昵称',avatar:null,nicknameOverride:null,avatarOverride:null,defaultNickname:'默认昵称',defaultAvatar:null};
test('portrait follows the finger and snaps on release; interruption returns to the same role',()=>{
  vi.useFakeTimers();class Pointer extends MouseEvent{pointerId:number;constructor(type:string,init:MouseEventInit&{pointerId?:number}={}){super(type,init);this.pointerId=init.pointerId??1;}}vi.stubGlobal('PointerEvent',Pointer);
  const ui=render(<HomePortrait/>),art=screen.getByLabelText('左右滑动切换角色'),track=ui.container.querySelector('.home-portrait__track') as HTMLElement;
  const first=screen.getByRole('img',{name:/原画/}).getAttribute('alt');
  fireEvent.pointerDown(art,{pointerId:1,button:0,clientX:150,clientY:100});fireEvent.pointerMove(art,{pointerId:1,clientX:70,clientY:100});act(()=>{vi.advanceTimersByTime(20);});
  expect(track.style.transform).toContain('px');expect(screen.getByRole('img',{name:/原画/})).toHaveAttribute('alt',first);
  fireEvent.pointerUp(art,{pointerId:1,clientX:70,clientY:100});expect(art).toHaveAttribute('aria-busy','true');act(()=>{vi.advanceTimersByTime(360);});
  expect(screen.getByRole('img',{name:/原画/})).not.toHaveAttribute('alt',first);const second=screen.getByRole('img',{name:/原画/}).getAttribute('alt');
  fireEvent.pointerDown(art,{pointerId:1,button:0,clientX:150,clientY:100});fireEvent.pointerMove(art,{pointerId:1,clientX:70,clientY:100});fireEvent.pointerCancel(art,{pointerId:1});act(()=>{vi.advanceTimersByTime(360);});
  expect(screen.getByRole('img',{name:/原画/})).toHaveAttribute('alt',second);expect(art).toHaveAttribute('aria-busy','false');
});
test('one arch swipes directly; vertical and canceled gestures do not change the role and entry actions stay available',async()=>{
  vi.mocked(getAccount).mockResolvedValue({signedIn:false,rooms:[],guestClaimAvailable:false});
  class Pointer extends MouseEvent{pointerId:number;constructor(type:string,init:MouseEventInit&{pointerId?:number}={}){super(type,init);this.pointerId=init.pointerId??1;}}vi.stubGlobal('PointerEvent',Pointer);
  const join=vi.fn(),create=vi.fn(),tutorial=vi.fn(),roles=vi.fn();render(<Home onJoin={join} onCreate={create} onTutorial={tutorial} onRoles={roles}/>);
  const art=screen.getByLabelText('左右滑动切换角色'),initial=screen.getByRole('img',{name:/原画/}).getAttribute('alt');
  const gesture=(x:number,y:number,cancel=false)=>{fireEvent.pointerDown(art,{pointerId:1,button:0,clientX:100,clientY:100});if(cancel)fireEvent.pointerCancel(art,{pointerId:1});else fireEvent.pointerUp(art,{pointerId:1,clientX:x,clientY:y});};
  gesture(20,100);await waitFor(()=>expect(screen.getByRole('img',{name:/原画/})).not.toHaveAttribute('alt',initial));const next=screen.getByRole('img',{name:/原画/}).getAttribute('alt');
  gesture(100,10);gesture(20,100,true);expect(screen.getByRole('img',{name:/原画/})).toHaveAttribute('alt',next);
  await waitFor(()=>expect(screen.getByRole('button',{name:'上一位角色'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'上一位角色'}));await waitFor(()=>expect(screen.getByRole('img',{name:/原画/})).toHaveAttribute('alt',initial));
  for(const [name,callback]of [['加入房间',join],['创建房间',create],['查看教程',tutorial],['查看角色表',roles]]as const){fireEvent.click(screen.getByRole('button',{name}));expect(callback).toHaveBeenCalledOnce();}
});
test('account opens centrally with automatic identity, saves game-only profile, restores defaults and closes on back',async()=>{
  const logout=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('FribenchAccount',{logout});
  vi.mocked(getAccount).mockResolvedValue({signedIn:true,rooms:[],guestClaimAvailable:true,profile});vi.mocked(getAvatarChoices).mockResolvedValue({avatars:[{id:'cat',url:'https://auth.fribench.cn/assets/avatars/v3/cat-unbothered.webp'}]});
  vi.mocked(saveGameProfile).mockResolvedValue({profile:{...profile,nickname:'本游戏昵称',nicknameOverride:'本游戏昵称',revision:1}});
  render(<AccountPanel onResume={vi.fn()}/>);fireEvent.click(await screen.findByRole('button',{name:'打开账号设置'}));
  expect(await screen.findByRole('dialog',{name:'账号设置'})).toHaveFocus();await waitFor(()=>expect(screen.queryByText('正在处理…')).not.toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('本游戏昵称'),{target:{value:'本游戏昵称'}});fireEvent.click(screen.getByRole('button',{name:'保存资料'}));
  await waitFor(()=>expect(saveGameProfile).toHaveBeenCalledWith('本游戏昵称',null,0));await screen.findByText('本游戏资料已保存');
  fireEvent.click(screen.getByRole('button',{name:'恢复默认资料'}));await waitFor(()=>expect(saveGameProfile).toHaveBeenCalledWith(null,null,1));
  await screen.findByText('已恢复 Fribench 默认资料');fireEvent.click(screen.getByRole('button',{name:'退出登录'}));await waitFor(()=>expect(logout).toHaveBeenCalledOnce());
  window.history.back();await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.getByRole('button',{name:'打开账号设置'})).toHaveFocus();
});
