// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {GameView,PrivateView} from '../api.js';
import {RoomSheet} from './RoomPage.js';
import {NominationNotice} from './NominationNotice.js';
import {Gallows} from './Gallows.js';

afterEach(async()=>{cleanup();await new Promise(r=>setTimeout(r,10));vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture():PrivateView{
  const seats=Array.from({length:7},(_,i)=>({id:`p${i+1}`,seat:i+1,nickname:`玩家${i+1}`,alive:i!==0,connected:true,ghostVoteAvailable:true}));
  const game:GameView={gameId:'game',contextId:'context',phase:'VOTING',day:1,seats,events:[],readyCount:0,aliveCount:6,serverNow:1000,nomination:{ballotId:'ballot',nominatorSeat:2,nomineeSeat:3,votesReceived:4,votesRaised:4,threshold:3,voterOrder:[4,5,6,7,1,2,3],countedSeats:[4,5],countedVotes:{4:true,5:true},defenseUntil:2000}};
  return{roomInstanceId:'room',contextId:'private',state:'RUNNING',participant:{id:'p1',nickname:'玩家1',seat:1},history:[],messages:[],game,canVote:true,voteRaised:false,room:{code:'ABCDEF',state:'RUNNING',playerCount:7,participants:[],timeline:{mode:'MANUAL',epoch:0}}};
}
test('notice is explicit, public, and keeps counts and own hand visible when collapsed',()=>{
  const view=fixture(),vote=vi.fn(),details=vi.fn(),props={view,busy:false,onVote:vote,onDetails:details};
  const ui=render(<NominationNotice {...props} active={false}/>);expect(screen.queryByLabelText('提名提醒')).not.toBeInTheDocument();
  ui.rerender(<NominationNotice {...props} active/>);const notice=screen.getByLabelText('提名提醒');expect(notice).toHaveTextContent('[玩家2]');expect(notice).toHaveTextContent('[玩家3]');expect(notice).toHaveTextContent('4/7');expect(notice).toHaveTextContent('你未举手');
  fireEvent.click(screen.getByRole('button',{name:/查看提名/}));expect(details).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'收起提名提醒'}));expect(notice).toHaveTextContent('4/7');expect(notice).toHaveTextContent('你未举手');expect(screen.queryByRole('button',{name:'举手'})).not.toBeInTheDocument();expect(document.documentElement.style.getPropertyValue('--nomination-notice-height')).toMatch(/px$/);
});
test('ghost vote is confirmed and confirmation cannot cross a ballot or hidden handbook',()=>{
  const view=fixture(),vote=vi.fn(),props={active:true,view,busy:false,onVote:vote,onDetails:vi.fn()};const ui=render(<NominationNotice {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'举手'}));expect(vote).not.toHaveBeenCalled();expect(screen.getByRole('alertdialog',{name:'使用鬼票'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(vote).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'举手'}));fireEvent.click(screen.getByRole('button',{name:'确认使用鬼票'}));expect(vote).toHaveBeenCalledExactlyOnceWith(true);
  fireEvent.click(screen.getByRole('button',{name:'举手'}));const next={...view,game:{...view.game!,nomination:{...view.game!.nomination!,ballotId:'next'}}};ui.rerender(<NominationNotice {...props} view={next}/>);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'举手'}));ui.rerender(<NominationNotice {...props} view={next} active={false}/>);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
test('authoritative voting denial and counted state disable controls without private reminders',()=>{
  const view=fixture(),vote=vi.fn();view.canVote=false;view.butler={masterSeat:7,masterRaised:false};view.role={roleId:'butler',name:'秘密管家',type:'OUTSIDER',alignment:'GOOD',summary:'私密能力',beginnerTip:'私密建议'};
  view.game!.nomination!.countedSeats=[1];view.game!.nomination!.countedVotes={1:true};render(<NominationNotice active view={view} busy={false} onVote={vote} onDetails={vi.fn()}/>);
  expect(screen.getByRole('button',{name:'举手'})).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('已锁票：赞同');expect(screen.getByLabelText('提名提醒')).not.toHaveTextContent('管家');expect(screen.getByLabelText('提名提醒')).not.toHaveTextContent('主人');
});
test('gallows separates a current nomination from the execution candidate and never declares death',()=>{
  const view=fixture(),game=view.game!,ui=render(<Gallows game={game} room={view.room}/>);const board=screen.getByLabelText('提名与处决席');expect(board).toHaveTextContent('当前提名 · 辩护中');expect(board).toHaveTextContent('[玩家3]');expect(board).toHaveTextContent('4/7');expect(board).not.toHaveTextContent('死亡');expect(board).not.toHaveTextContent('当前处决候选');
  ui.rerender(<Gallows game={{...game,onBlock:{seat:4,votes:5}}} room={view.room}/>);expect(board).toHaveTextContent('当前处决候选：[玩家4]');
  const next={...game,phase:'NOMINATION' as const,onBlock:{seat:4,votes:5}};delete next.nomination;ui.rerender(<Gallows game={next} room={view.room}/>);expect(board).toHaveTextContent('当前处决候选');expect(board).toHaveTextContent('[玩家4]');expect(board).toHaveTextContent('5');
});
test('history shows only published results today and distinguishes tie from failure to reach threshold',()=>{
  const view=fixture(),game=view.game!;game.events=[{seq:1,id:'old',kind:'VOTE_RESULT',day:0,targetSeat:2,votes:1,threshold:3,message:'old',startsAt:0},{seq:2,id:'tied',kind:'VOTE_RESULT',day:1,targetSeat:3,votes:4,threshold:3,outcome:'TIED',message:'tie',startsAt:0},{seq:3,id:'low',kind:'VOTE_RESULT',day:1,targetSeat:4,votes:2,threshold:3,outcome:'NONE',message:'low',startsAt:0},{seq:4,id:'future',kind:'VOTE_RESULT',day:1,targetSeat:5,votes:7,threshold:3,outcome:'ON_BLOCK',message:'future',startsAt:999999}];
  render(<Gallows game={game} room={view.room}/>);const history=screen.getByRole('list');expect(within(history).getAllByRole('listitem')).toHaveLength(2);expect(history).toHaveTextContent('最高票持平');expect(history).toHaveTextContent('未达标');expect(history).not.toHaveTextContent('玩家2');expect(history).not.toHaveTextContent('玩家5');
});

test('gallows clears a stale execution candidate after a highest-vote tie',()=>{
  const view=fixture(),game={...view.game!,phase:'NOMINATION' as const,executionTied:true,onBlock:{seat:4,votes:5}};delete game.nomination;
  const ui=render(<Gallows game={game} room={view.room}/>),board=screen.getByLabelText('提名与处决席');expect(board).toHaveTextContent('最高票持平 · 暂无处决候选');expect(board).not.toHaveTextContent('当前处决候选');expect(board.querySelector('.gallows__portrait')).toBeNull();
  ui.rerender(<Gallows game={{...view.game!,executionTied:true,onBlock:{seat:4,votes:5}}} room={view.room}/>);expect(board).toHaveTextContent('当前提名');expect(board).not.toHaveTextContent('当前处决候选：4号');
});
test('gallows moves the nominated avatar from its matching table seat once per ballot',()=>{
  const view=fixture(),cancel=vi.fn(),animate=vi.fn().mockReturnValue({cancel});
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,writable:true,value:animate});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const source=this.classList.contains('rn-seat__avatar');return{left:source?10:100,top:source?20:200,width:source?44:43,height:source?44:43,right:0,bottom:0,x:0,y:0,toJSON(){}};});
  const body=(game:GameView)=><section className="remote-town-board"><div data-seat-number="3"><span className="rn-seat__avatar"/></div><Gallows game={game} room={view.room}/></section>;
  const ui=render(body(view.game!));expect(animate).toHaveBeenCalledOnce();expect(animate.mock.calls[0]![0][0].transform).toContain('translate(-89.5px,-179.5px)');expect(animate.mock.calls[0]![1]).toMatchObject({duration:480});
  ui.rerender(body({...view.game!,nomination:{...view.game!.nomination!,votesRaised:5}}));expect(animate).toHaveBeenCalledOnce();ui.unmount();expect(cancel).toHaveBeenCalledOnce();
  delete (HTMLElement.prototype as unknown as {animate?:unknown}).animate;
});
test('gallows respects reduced motion and keeps the avatar when animation is unavailable',()=>{
  const view=fixture(),animate=vi.fn();vi.stubGlobal('matchMedia',()=>({matches:true}));Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,writable:true,value:animate});
  const ui=render(<section className="remote-town-board"><div data-seat-number="3"><span className="rn-seat__avatar"/></div><Gallows game={view.game!} room={view.room}/></section>);expect(animate).not.toHaveBeenCalled();expect(ui.container.querySelector('.gallows__portrait')).not.toBeNull();
  delete (HTMLElement.prototype as unknown as {animate?:unknown}).animate;
});

test('gallows uses a rope for a living candidate and only the public death flag replaces it with a skull',()=>{
  const view=fixture(),game=view.game!,ui=render(<Gallows game={game} room={view.room}/>);
  expect(ui.container.querySelector('.gallows__portrait .rn-avatar-state--threatened')).not.toBeNull();
  expect(ui.container.querySelector('.gallows__portrait .rn-avatar-state--dead')).toBeNull();
  ui.rerender(<Gallows game={{...game,seats:game.seats.map(p=>p.seat===3?{...p,alive:false}:p)}} room={view.room}/>);
  expect(ui.container.querySelector('.gallows__portrait .rn-avatar-state--threatened')).toBeNull();
  expect(ui.container.querySelector('.gallows__portrait .rn-avatar-state--dead')).not.toBeNull();
  const ended={...game,phase:'NOMINATION' as const};delete ended.nomination;
  ui.rerender(<Gallows game={ended} room={view.room}/>);
  expect(ui.container.querySelector('.gallows__portrait')).toBeNull();
});


test('reading sheet exposes the public notice and its shot confirmation keeps and restores focus',()=>{
 const view=fixture();view.canClaimSlayer=true;view.dayAbilityTargets=[2,3];const shoot=vi.fn();render(<><RoomSheet title="阅读线索" onClose={()=>{}}><button>线索原位置</button></RoomSheet><NominationNotice active view={view} busy={false} onVote={vi.fn()} onDetails={vi.fn()} onShoot={shoot}/></>);
 const start=screen.getByRole('button',{name:'公开宣称枪击'});start.focus();fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(document.activeElement?.closest('.nomination-notice')).not.toBeNull();fireEvent.click(start);
 const sheet=screen.getByRole('alertdialog',{name:'公开宣称枪击'});expect(sheet).toContainElement(document.activeElement as HTMLElement);fireEvent.click(screen.getByRole('button',{name:'[玩家3]'}));fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(start).toHaveFocus();expect(shoot).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'阅读线索'})).toBeVisible();
 fireEvent.click(start);fireEvent.click(screen.getByRole('button',{name:'[玩家2]'}));fireEvent.click(screen.getByRole('button',{name:'确认向所选玩家开枪'}));expect(shoot).toHaveBeenCalledExactlyOnceWith(2);
});
