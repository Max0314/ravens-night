// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {SeatRing} from '@ravens/ui';
import {GuideOverlay} from './components/GuideOverlay.js';
import {NominationNotice} from './components/NominationNotice.js';
import {TownBoard} from './components/TownBoard.js';
import {Lobby} from './pages/Lobby.js';
import {updateGuestProfile,type RoomView,type PrivateView} from './api.js';
import {installMobileViewport} from './mobile-viewport.js';
vi.mock('./api.js',async original=>({...await original<object>(),getAccount:vi.fn().mockResolvedValue({signedIn:false,rooms:[]}),inviteWhisper:vi.fn().mockResolvedValue({}),updateGuestProfile:vi.fn().mockResolvedValue({profileApplication:'CURRENT'})}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();window.history.replaceState({},'','/');});
function fixture():PrivateView{return {state:'RUNNING',participant:{id:'a',nickname:'甲',seat:1},history:[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'甲与乙中有一位是厨师。',targetSeats:[1,2]}],messages:[],canNominate:true,canClaimSlayer:true,nominationTargets:[1,2,3],dayAbilityTargets:[1,2,3],game:{phase:'DAY_DISCUSSION',gameId:'g',contextId:'c',day:1,aliveCount:3,readyCount:0,events:[],seats:[{id:'a',seat:1,nickname:'甲',alive:true,connected:true,ghostVoteAvailable:true},{id:'b',seat:2,nickname:'乙',alive:true,connected:true,ghostVoteAvailable:true},{id:'c',seat:3,nickname:'丙',alive:true,connected:true,ghostVoteAvailable:true}]}};}
test('avatar wheel confirms public actions, reports server errors and cannot carry targets into another phase',()=>{
  const view=fixture(),nominate=vi.fn(),shoot=vi.fn(),props={view,code:'ABCDEF',busy:false,onNominate:nominate,onShoot:shoot};const ui=render(<TownBoard {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'2号 乙 存活'}));expect(screen.getByRole('dialog',{name:'2号 乙 操作'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'提名'}));expect(nominate).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'确认提名 2号'}));expect(nominate).toHaveBeenCalledExactlyOnceWith(2);
  ui.rerender(<TownBoard {...props} error="阶段已变化，请重试"/>);expect(screen.getByRole('alert')).toHaveTextContent('阶段已变化');ui.rerender(<TownBoard {...props} view={{...view,game:{...view.game!,phase:'OTHER_NIGHT',contextId:'night'}}}/>);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'2号 乙 存活'}));expect(screen.queryByRole('button',{name:'提名'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'开枪'})).not.toBeInTheDocument();expect(shoot).not.toHaveBeenCalled();
});
test('private clue pairs mark both seats equally and never mark the shared public table by default',()=>{
  const view=fixture(),ui=render(<TownBoard view={view} busy={false} onNominate={vi.fn()} onShoot={vi.fn()}/>);expect(screen.getAllByLabelText('我的线索：线索')).toHaveLength(2);expect(within(screen.getByRole('region',{name:'我的圆桌线索'})).getByText('甲与乙中有一位是厨师。')).toBeVisible();ui.unmount();render(<SeatRing seats={view.game!.seats}/>);expect(screen.queryByLabelText('我的线索：线索')).not.toBeInTheDocument();
});
test('failed table avatar recovers after choosing a new image',()=>{
  const seat={seat:1,nickname:'甲',alive:true,connected:true,ghostVoteAvailable:true,avatar:'/old.webp'},ui=render(<SeatRing seats={[seat]}/>);const img=ui.container.querySelector('img')!;fireEvent.error(img);expect(img.hidden).toBe(true);ui.rerender(<SeatRing seats={[{...seat,avatar:'/new.webp'}]}/>);expect(ui.container.querySelector('img')!.hidden).toBe(false);expect(ui.container.querySelector('img')!.src).toContain('/new.webp');
});
test('keyboard resize follows visible height and offset, then restores the full viewport on blur',()=>{
  vi.useFakeTimers();vi.stubGlobal('innerHeight',800);vi.stubGlobal('innerWidth',400);vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>setTimeout(()=>f(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  const v=Object.assign(new EventTarget(),{height:800,offsetTop:0,width:400});vi.stubGlobal('visualViewport',v);const input=document.createElement('input');document.body.append(input);const dispose=installMobileViewport();input.focus();v.height=420;v.offsetTop=55;v.dispatchEvent(new Event('resize'));vi.advanceTimersByTime(20);expect(document.documentElement.dataset.keyboard).toBe('open');expect(document.documentElement.style.getPropertyValue('--viewport-height')).toBe('420px');expect(document.documentElement.style.getPropertyValue('--viewport-top')).toBe('55px');input.blur();v.height=800;v.offsetTop=0;v.dispatchEvent(new Event('resize'));vi.advanceTimersByTime(20);expect(document.documentElement.dataset.keyboard).toBe('closed');expect(document.documentElement.style.getPropertyValue('--viewport-height')).toBe('800px');dispose();input.remove();
});

test('handbook focus reaches public ballot controls and yields to the ghost-vote confirmation',()=>{
 const view=fixture();view.canVote=true;view.game!.phase='VOTING';view.game!.seats[0]!.alive=false;view.game!.nomination={ballotId:'b',nominatorSeat:2,nomineeSeat:3,votesReceived:0,votesRaised:0,threshold:2,countedSeats:[]};render(<><GuideOverlay mode="roles" onClose={vi.fn()}/><NominationNotice active view={view} busy={false} onVote={vi.fn()} onDetails={vi.fn()}/></>);
 const guide=screen.getByRole('dialog'),first=within(guide).getAllByRole('button')[0]!,notice=screen.getByRole('complementary',{name:'提名提醒'}),last=within(notice).getByRole('button',{name:'放下'});last.focus();fireEvent.keyDown(last,{key:'Tab'});expect(first).toHaveFocus();fireEvent.keyDown(first,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();fireEvent.click(within(notice).getByRole('button',{name:'举手'}));const dialog=screen.getByRole('alertdialog',{name:'使用鬼票'}),cancel=within(dialog).getByRole('button',{name:'取消'});cancel.focus();fireEvent.keyDown(cancel,{key:'Tab'});expect(within(dialog).getByRole('button',{name:'关闭使用鬼票'})).toHaveFocus();
});

test('tapping own lobby avatar edits and saves the selected room profile immediately',async()=>{
 const room:RoomView={code:'ABCDEF',roomInstanceId:'r',setupId:'s',state:'LOBBY',organizerId:'a',playerCount:5,participants:[{id:'a',seat:1,nickname:'甲',mode:'PLAYER',connected:true,ready:false}]};const ui=render(<Lobby room={room} participantId="a" canBegin busy={false} onBegin={vi.fn()} onLeave={vi.fn()} onTutorial={vi.fn()} onRoles={vi.fn()}/>);
 fireEvent.click(ui.container.querySelector('.seat-avatar')!);expect(screen.getByRole('dialog',{name:'修改我的资料'})).toBeVisible();await waitFor(()=>expect(screen.getByRole('button',{name:'保存我的资料'})).toBeEnabled());fireEvent.change(screen.getByLabelText('你的昵称'),{target:{value:'犬夜叉'}});fireEvent.click(screen.getByRole('button',{name:'保存我的资料'}));await waitFor(()=>expect(updateGuestProfile).toHaveBeenCalledWith('ABCDEF','犬夜叉',expect.stringContaining('/avatars/')));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'修改我的资料'})).not.toBeInTheDocument());
});
