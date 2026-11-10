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
test('snapping keeps the incoming card and copy nodes, and scale and text follow drag progress',()=>{
  vi.useFakeTimers();class Pointer extends MouseEvent{pointerId:number;constructor(type:string,init:MouseEventInit&{pointerId?:number}={}){super(type,init);this.pointerId=init.pointerId??1;}}vi.stubGlobal('PointerEvent',Pointer);
  const ui=render(<HomePortrait/>),stage=screen.getByLabelText('左右滑动切换角色');
  const current=screen.getByRole('img',{name:/原画/}),card=current.closest('.home-portrait__slide') as HTMLElement;
  const incoming=card.nextElementSibling as HTMLElement,nextImage=incoming.querySelector('img')!;
  const captions=Array.from(ui.container.querySelectorAll<HTMLElement>('.home-portrait__caption-body'));
  const caption=captions.find(node=>node.getAttribute('aria-hidden')==='false')!,nextCaption=captions[captions.indexOf(caption)+1]!;
  const before=incoming.style.transform;
  fireEvent.pointerDown(stage,{pointerId:1,button:0,clientX:220,clientY:100});fireEvent.pointerMove(stage,{pointerId:1,clientX:90,clientY:100});act(()=>{vi.advanceTimersByTime(20);});
  expect(incoming.style.transform).not.toBe(before);expect(Number(caption.style.opacity)).toBeLessThan(1);expect(Number(nextCaption.style.opacity)).toBeGreaterThan(0);
  fireEvent.pointerUp(stage,{pointerId:1,clientX:90,clientY:100});expect(stage).toHaveAttribute('aria-busy','true');act(()=>{vi.advanceTimersByTime(360);});
  expect(screen.getByRole('img',{name:/原画/})).toBe(nextImage);expect(ui.container.contains(nextCaption)).toBe(true);expect(nextCaption.style.opacity).toBe('1');expect(incoming.style.transform).toContain('scale(1)');expect(incoming.style.transform).toContain('+ 0px');
  fireEvent.pointerDown(stage,{pointerId:1,button:0,clientX:150,clientY:100});fireEvent.pointerMove(stage,{pointerId:1,clientX:100,clientY:100});act(()=>{vi.advanceTimersByTime(20);});fireEvent.pointerCancel(stage,{pointerId:1});act(()=>{vi.advanceTimersByTime(360);});
  expect(screen.getByRole('img',{name:/原画/})).toBe(nextImage);expect(nextCaption.style.opacity).toBe('1');expect(stage).toHaveAttribute('aria-busy','false');
  fireEvent.pointerDown(stage,{pointerId:1,button:0,clientX:150,clientY:100});fireEvent.keyDown(stage,{key:'ArrowRight'});fireEvent.pointerMove(stage,{pointerId:1,clientX:90,clientY:100});fireEvent.pointerUp(stage,{pointerId:1,clientX:90,clientY:100});act(()=>{vi.advanceTimersByTime(360);});
  expect(stage).toHaveAttribute('aria-busy','false');expect(screen.getByRole('button',{name:'下一位角色'})).toBeEnabled();expect(screen.getByRole('img',{name:/原画/})).not.toBe(nextImage);
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


test('all returned avatars stay selectable and profile actions live outside the scrolling body',async()=>{
  const avatars=Array.from({length:35},(_,index)=>({id:`choice-${index}`,url:`https://auth.fribench.cn/assets/avatars/v3/choice-${index}.webp`}));
  vi.mocked(getAccount).mockResolvedValue({signedIn:true,rooms:[],guestClaimAvailable:true,profile});vi.mocked(getAvatarChoices).mockResolvedValue({avatars});
  vi.mocked(saveGameProfile).mockResolvedValue({profile:{...profile,avatar:avatars[34]!.url,avatarOverride:avatars[34]!.url,revision:1}});
  const ui=render(<AccountPanel onResume={vi.fn()}/>);fireEvent.click(await screen.findByRole('button',{name:'打开账号设置'}));
  await waitFor(()=>expect(screen.queryByText('正在处理…')).not.toBeInTheDocument());fireEvent.click(screen.getByRole('button',{name:/更换头像/}));
  const grid=screen.getByLabelText('头像列表');expect(grid.querySelectorAll('button')).toHaveLength(35);grid.scrollTop=500;
  fireEvent.click(screen.getByRole('button',{name:'头像35'}));
  const save=screen.getByRole('button',{name:'保存资料'}),close=screen.getByRole('button',{name:'关闭账号设置'});
  expect(save.closest('.account-dialog__body')).toBeNull();expect(close.closest('.account-dialog__body')).toBeNull();expect(save.closest('footer')).not.toBeNull();
  fireEvent.click(save);await waitFor(()=>expect(saveGameProfile).toHaveBeenCalledWith(null,avatars[34]!.url,0));await screen.findByText('本游戏资料已保存');expect(screen.queryByLabelText('头像列表')).not.toBeInTheDocument();
  expect(ui.container.querySelector('.account-dialog__footer')).toContainElement(screen.getByRole('button',{name:'退出登录'}));
});


test('avatar catalog failure can retry without erasing an edited nickname',async()=>{
  vi.mocked(getAccount).mockResolvedValue({signedIn:true,rooms:[],guestClaimAvailable:true,profile});
  vi.mocked(getAvatarChoices).mockRejectedValueOnce(new Error('头像暂不可用')).mockResolvedValueOnce({avatars:[{id:'cat',url:'https://auth.fribench.cn/assets/avatars/v3/cat-unbothered.webp'}]});
  render(<AccountPanel onResume={vi.fn()}/>);fireEvent.click(await screen.findByRole('button',{name:'打开账号设置'}));await screen.findByText('头像暂不可用');
  fireEvent.change(screen.getByLabelText('本游戏昵称'),{target:{value:'未保存昵称'}});fireEvent.click(screen.getByRole('button',{name:/更换头像/}));fireEvent.click(screen.getByRole('button',{name:'重新加载头像'}));
  await screen.findByRole('button',{name:'头像1'});expect(screen.getByLabelText('本游戏昵称')).toHaveValue('未保存昵称');
});
