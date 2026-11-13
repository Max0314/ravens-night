// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {PlayerGame} from './PlayerGame.js';
import type {PrivateView} from '../api.js';
import {RoomSheet} from '../components/RoomPage.js';
vi.mock('../components/PrivateSceneStage.js',()=>({PrivateSceneStage:({onHandleTask}:{onHandleTask:()=>void})=><button onClick={onHandleTask}>测试处理当前操作</button>}));
vi.mock('../components/RoomPage.js',async original=>{const actual=await original<typeof import('../components/RoomPage.js')>();return {...actual,RoomSheet:vi.fn((props:Parameters<typeof actual.RoomSheet>[0])=><actual.RoomSheet {...props}/>)};});
afterEach(()=>{cleanup();vi.clearAllMocks();});
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
function fixture():PrivateView{return {state:'RUNNING',roomInstanceId:'room',contextId:'role',participant:{id:'a',nickname:'甲',seat:1},role:{roleId:'chef',name:'厨师',type:'TOWNSFOLK',alignment:'GOOD',summary:'能力',beginnerTip:'建议'},roleConfirmed:false,history:[],messages:[],game:{phase:'ROLE_REVEAL',gameId:'g',contextId:'role',day:0,aliveCount:3,readyCount:0,serverNow:1000,events:[],seats:[1,2,3].map(seat=>({id:String(seat),seat,nickname:'名字'+seat,alive:seat!==3,connected:true,ghostVoteAvailable:true}))}};}
test('role confirmation stays actionable before the art and closes only after server success',()=>{
 const view=fixture();view.game!.presentationUntil=999999;const ui=render(<PlayerGame {...handlers} view={view}/>);
 expect(screen.queryByRole('button',{name:'关闭身份确认'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'开启声音'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'游玩建议'}));expect(screen.getByRole('button',{name:'关闭厨师 · 游玩建议'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'关闭厨师 · 游玩建议'}));fireEvent.click(screen.getByRole('button',{name:'确认身份'}));expect(handlers.onConfirmRole).toHaveBeenCalledOnce();expect(screen.getByRole('dialog',{name:'身份确认'})).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} view={{...view,roleConfirmed:true}}/>);expect(screen.queryByRole('dialog',{name:'身份确认'})).not.toBeInTheDocument();
});
test('last confirmation defers first-night information while identity is pending',()=>{
 const view=fixture();view.roleConfirmed=true;view.game!.phase='FIRST_NIGHT';view.startInfo={infoId:'info',gameId:'g',team:[],bluffs:[],acknowledged:false,canAcknowledge:true};view.presentations={version:1,pending:[{historySeq:1,scene:{version:1,id:'identity',kind:'IDENTITY',themeRoleId:'chef',shown:{type:'IDENTITY',roleId:'chef',summary:'能力'}}}],hasMore:false};
 const before=fixture();const ui=render(<PlayerGame {...handlers} roomCode="ABCDEF" view={before}/>);vi.mocked(RoomSheet).mockClear();ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" view={view}/>);expect(vi.mocked(RoomSheet).mock.calls.some(([props])=>props.title==='首夜信息 · 仅你可见')).toBe(false);expect(screen.queryByRole('dialog',{name:'首夜信息 · 仅你可见'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'确认首夜信息'}));expect(screen.getByRole('dialog',{name:'首夜信息 · 仅你可见'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'关闭首夜信息 · 仅你可见'}));
 ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" guideOpen view={view}/>);fireEvent.click(screen.getByRole('button',{name:'测试处理当前操作'}));expect(screen.getByRole('dialog',{name:'首夜信息 · 仅你可见'})).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" view={{...view,revision:2}}/>);expect(screen.getByRole('dialog',{name:'首夜信息 · 仅你可见'})).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" view={{...view,presentations:{version:1,pending:[],hasMore:false}}}/>);expect(screen.getByRole('dialog',{name:'首夜信息 · 仅你可见'})).toBeVisible();
});
test('a new nomination stays in the center; public voting locks by seat and confirms a ghost hand',()=>{
 const view=fixture();view.game!.phase='VOTING';view.roleConfirmed=true;view.canVote=true;view.voteRaised=false;view.game!.nomination={ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:0,votesReceived:0,threshold:2};const ui=render(<PlayerGame {...handlers} view={view}/>);
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByLabelText('公开表决').closest('.town-center')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'举手'}));expect(handlers.onVote).toHaveBeenCalledWith(true);
 const dead={...view,participant:{...view.participant,seat:3}};ui.rerender(<PlayerGame {...handlers} view={dead}/>);fireEvent.click(screen.getByRole('button',{name:'举手'}));expect(screen.getByRole('alertdialog',{name:'使用鬼票'})).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} view={{...dead,game:{...dead.game!,nomination:{...dead.game!.nomination!,countedSeats:[3],countedVotes:{3:false}}}}}/>);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'举手'})).toBeDisabled();
});

test('legacy received history is formatted for display while its text remains intact',()=>{
 const view=fixture();view.roleConfirmed=true;view.game!.phase='DAY_DISCUSSION';view.history=[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'【玩家1-甲】与【玩家2-乙】之一是镇长。'}];
 const ui=render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:/^记录/}));fireEvent.click(screen.getByText('我的身份与线索记录'));expect(ui.container.querySelector('.clue-entry p')).toHaveTextContent('[甲]与[乙]之一是镇长。');expect(view.history[0]!.text).toBe('【玩家1-甲】与【玩家2-乙】之一是镇长。');
});

test('private cover keeps the role area hidden and inert while its public waiting scene contains no role text',()=>{
 const ui=render(<PlayerGame {...handlers} view={fixture()}/>);fireEvent.click(screen.getByRole('button',{name:'遮住私密内容'}));
 const scene=screen.getByLabelText('私密内容已遮住');expect(scene).toHaveClass('player-wait-scene');expect(scene).not.toHaveTextContent('厨师');expect(ui.container.querySelector('.player-private')).toHaveAttribute('hidden');expect(ui.container.querySelector('.player-private')).toHaveAttribute('inert');
 expect(screen.getByRole('button',{name:'显示私密内容'})).toBeVisible();
});

test('simultaneous ballot details explain the preparation and shared cutoff without a voter procession',()=>{
 const view=fixture();view.game!.phase='VOTING';view.roleConfirmed=true;view.game!.nomination={mode:'SIMULTANEOUS',ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:0,votesReceived:0,votersRequired:3,threshold:2,preparationEndsAt:21000,voteStartsAt:21000,voteEndsAt:29000};
 render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:'查看本轮表决规则'}));const sheet=screen.getByRole('dialog',{name:'本轮表决'});fireEvent.click(screen.getByText('统一截止与规则'));expect(sheet).toHaveTextContent('准备期最多20秒');expect(sheet).toHaveTextContent('最后8秒仍可修改');expect(sheet).not.toHaveTextContent('轮到本席');expect(sheet.querySelector('.vote-procession')).toBeNull();
});
