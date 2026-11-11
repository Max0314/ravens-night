// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {PlayerGame,hasPrivateTownTask} from './pages/PlayerGame.js';
import {GuideOverlay} from './components/GuideOverlay.js';
import {inviteWhisper,respondWhisper,type PrivateView} from './api.js';
vi.mock('./api.js',async original=>({...await original<object>(),inviteWhisper:vi.fn().mockResolvedValue({}),respondWhisper:vi.fn().mockResolvedValue({})}));
afterEach(()=>{cleanup();vi.clearAllMocks();window.history.replaceState({},'','/');});
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onConfirmStartInfo:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
function fixture(roleId='poisoner'):PrivateView{return {state:'RUNNING',roomInstanceId:'room',contextId:'night',participant:{id:'a',nickname:'甲',seat:1},role:{roleId,name:'我的角色',type:'MINION',alignment:'EVIL',summary:'能力',beginnerTip:'建议'},history:[],messages:[],social:{invitations:[],relations:[]},action:{kind:'SELECT_ONE',minTargets:1,maxTargets:1,legalSeats:[1,2,3],prompt:'选择今晚目标'},game:{phase:'OTHER_NIGHT',gameId:'g',contextId:'night',day:1,aliveCount:3,readyCount:0,events:[],seats:[{id:'a',seat:1,nickname:'甲',alive:true,connected:true,ghostVoteAvailable:true},{id:'b',seat:2,nickname:'乙',alive:true,connected:true,ghostVoteAvailable:true},{id:'c',seat:3,nickname:'丙',alive:false,connected:true,ghostVoteAvailable:true}]}};}
function pick(seat:number,label:string){fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${seat}号 .*(存活|已死亡)`)}));fireEvent.click(screen.getByRole('button',{name:label}));}

test.each([['poisoner','下毒',1],['imp','袭击',1],['monk','保护',2],['butler','选择主人',3],['ravenkeeper','查验',3]])('town wheel carries %s authorised targets without alive-state assumptions', (role,label,target)=>{
  const view=fixture(String(role));if(role==='butler'||role==='monk')view.action!.legalSeats=[2,3];if(role==='ravenkeeper')view.game!.seats[0]!.alive=false;
  render(<PlayerGame {...handlers} roomCode="ABCDEF" view={view}/>);
  expect(screen.queryByRole('button',{name:'行动'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'耳语'})).not.toBeInTheDocument();
  pick(Number(target),String(label));expect(handlers.onSubmitAction).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'确认选择（1/1）'}));expect(handlers.onSubmitAction).toHaveBeenCalledExactlyOnceWith([target]);
});
test('two-target choice is distinct, editable, rejects illegal self and resets on night context',()=>{
  const view=fixture('fortune_teller');view.action={kind:'SELECT_TWO',minTargets:2,maxTargets:2,legalSeats:[2,3],prompt:'选择两人'};
  const ui=render(<PlayerGame {...handlers} roomCode="ABCDEF" view={view}/>);
  fireEvent.click(screen.getByRole('button',{name:/^1号 甲/}));expect(screen.getByRole('button',{name:'占卜'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'关闭玩家操作'}));
  pick(2,'占卜');expect(screen.getByRole('button',{name:'确认选择（1/2）'})).toBeDisabled();pick(2,'取消选择');expect(screen.getByRole('button',{name:'确认选择（0/2）'})).toBeDisabled();pick(2,'占卜');pick(3,'占卜');fireEvent.click(screen.getByRole('button',{name:'确认选择（2/2）'}));expect(handlers.onSubmitAction).toHaveBeenCalledExactlyOnceWith([2,3]);
  ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" view={{...view,contextId:'new-night',game:{...view.game!,contextId:'new-night',day:2}}}/>);expect(screen.getByRole('button',{name:'确认选择（0/2）'})).toBeDisabled();
});
test('private cover removes a night wheel and clears target while preserving record selection',()=>{
 const view=fixture();render(<PlayerGame {...handlers} roomCode="ABCDEF" view={view}/>);pick(2,'下毒');fireEvent.click(screen.getByRole('button',{name:/^3号 丙/}));expect(screen.getByRole('button',{name:'下毒'})).toBeVisible();fireEvent(window,new Event('ravens:cover-private'));expect(screen.queryByRole('dialog',{name:/操作/})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));expect(screen.getByRole('button',{name:'确认选择（0/1）'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'记录'}));fireEvent(window,new Event('ravens:cover-private'));fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));expect(screen.getByRole('button',{name:'记录'})).toHaveAttribute('aria-pressed','true');
});
test('acknowledged first-night info does not re-open over a returned action',()=>{
 const view=fixture();view.game!.phase='FIRST_NIGHT';view.startInfo={infoId:'i',gameId:'g',team:[],bluffs:[],acknowledged:true,canAcknowledge:false};
 const closeGuide=vi.fn(),ui=render(<PlayerGame {...handlers} view={view} onCloseGuide={closeGuide}/>);fireEvent.click(screen.getByRole('button',{name:'记录'}));fireEvent.click(screen.getByRole('button',{name:'返回城镇处理待办'}));expect(screen.queryByRole('dialog',{name:'首夜信息 · 仅你可见'})).not.toBeInTheDocument();
 ui.rerender(<PlayerGame {...handlers} view={view} guideOpen onCloseGuide={closeGuide}/>);fireEvent.click(within(screen.getByLabelText('我的行动提醒')).getByRole('button',{name:'返回城镇'}));expect(closeGuide).toHaveBeenCalledOnce();expect(screen.queryByRole('dialog',{name:'首夜信息 · 仅你可见'})).not.toBeInTheDocument();
});
test('identity and unacknowledged evil information stay actionable inside town',()=>{
 const view=fixture();view.game!.phase='ROLE_REVEAL';delete view.action;const ui=render(<PlayerGame {...handlers} view={view}/>);expect(screen.getByRole('dialog',{name:'身份确认'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'确认身份'}));expect(handlers.onConfirmRole).toHaveBeenCalledOnce();
 view.game={...view.game!,phase:'FIRST_NIGHT',contextId:'first'};view.startInfo={infoId:'new-info',gameId:'g',team:[{seat:2,nickname:'乙',kind:'DEMON'}],bluffs:[],acknowledged:false,canAcknowledge:true};ui.rerender(<PlayerGame {...handlers} view={{...view}}/>);fireEvent.click(screen.getByRole('button',{name:'已知晓'}));expect(handlers.onConfirmStartInfo).toHaveBeenCalledExactlyOnceWith('new-info');
});
test('public wheel retains self nomination and self public slayer declaration without role gating',()=>{
 const view=fixture();view.game!.phase='DAY_DISCUSSION';view.canNominate=true;view.canClaimSlayer=true;view.nominationTargets=[1,2,3];view.dayAbilityTargets=[1,2,3];delete view.action;
 const ui=render(<PlayerGame {...handlers} roomCode="ABCDEF" view={view}/>);pick(1,'提名');fireEvent.click(screen.getByRole('button',{name:'确认提名 1号'}));expect(handlers.onNominate).toHaveBeenCalledWith(1);
 ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" view={{...view,contextId:'next',game:{...view.game!,contextId:'next'}}}/>);pick(1,'开枪');fireEvent.click(screen.getByRole('button',{name:'确认公开开枪'}));expect(handlers.onUseAbility).toHaveBeenCalledWith(1);
});
test('all-table relationships are read-only for outsiders; own invitation opens accept and reject',async()=>{
 const view=fixture();view.game!.phase='DAY_DISCUSSION';delete view.action;view.social={invitations:[],relations:[{fromSeat:2,toSeat:3,status:'ACTIVE'}]};
 const ui=render(<PlayerGame {...handlers} roomCode="ABCDEF" view={view}/>);const relations=screen.getByLabelText('全桌私聊关系');expect(within(relations).getByText('私聊中')).toBeVisible();expect(within(relations).queryByRole('button')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'2号 乙 存活'}));expect(screen.getByRole('button',{name:'私聊'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'关闭玩家操作'}));
 const invited={...view,social:{relations:[{fromSeat:2,toSeat:1,status:'PENDING' as const}],invitations:[{id:'private-id',fromSeat:2,toSeat:1,status:'PENDING',createdAt:1}]}};ui.rerender(<PlayerGame {...handlers} roomCode="ABCDEF" view={invited}/>);fireEvent.click(within(screen.getByLabelText('全桌私聊关系')).getByRole('button'));fireEvent.click(screen.getByRole('button',{name:'接受邀请'}));await waitFor(()=>expect(respondWhisper).toHaveBeenCalledWith('ABCDEF','private-id',true));
});
test('handbook return is keyboard reachable and private notice vanishes with privacy cover',()=>{
 const view=fixture(),ui=render(<><GuideOverlay mode="roles" onClose={vi.fn()}/><PlayerGame {...handlers} view={view} guideOpen/></>);
 const guide=screen.getByRole('dialog',{name:'游戏帮助'}),first=within(guide).getAllByRole('button')[0]!,last=screen.getByRole('button',{name:'返回城镇'});last.focus();fireEvent.keyDown(last,{key:'Tab'});expect(first).toHaveFocus();fireEvent.keyDown(first,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();fireEvent(window,new Event('ravens:cover-private'));expect(screen.queryByLabelText('我的行动提醒')).not.toBeInTheDocument();ui.unmount();
});

test('private grimoire lives in town, keeps historical death private and closes with privacy cover',()=>{
 const view=fixture('spy');delete view.action;view.game!.phase='DAY_DISCUSSION';view.history=[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'旧文本魔典',grimoire:{entries:[{seat:2,nickname:'当夜乙',roleName:'小恶魔',alive:false,reminders:['死亡','中毒','红鲱鱼']}]}}];
 const ui=render(<PlayerGame {...handlers} view={view}/>);expect(screen.getByRole('button',{name:'2号 乙 存活'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'我的魔典'}));expect(screen.queryByRole('button',{name:'2号 乙 存活'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/2号 当夜乙，魔典所示小恶魔/}));expect(screen.getByText('当夜已死亡')).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} view={{...view,contextId:'changed',game:{...view.game!,contextId:'changed',phase:'NOMINATION'}}}/>);expect(screen.getByLabelText('我的魔典圆桌')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'公开城镇'}));expect(screen.getByRole('button',{name:'2号 乙 存活'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'我的魔典'}));fireEvent(window,new Event('ravens:cover-private'));expect(screen.queryByLabelText('我的魔典圆桌')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));expect(screen.getByRole('button',{name:'公开城镇'})).toHaveAttribute('aria-pressed','true');
});
test('legacy text-only grimoire remains readable in town and has no fabricated map',()=>{
 const view=fixture('spy');delete view.action;view.history=[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'旧魔典原始记录'}];render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:'我的线索'}));expect(screen.getByText('旧魔典原始记录')).toBeVisible();expect(screen.queryByRole('button',{name:'我的魔典'})).not.toBeInTheDocument();
});
test('handbook reserves a private notice only while a task is actually pending',()=>{
 const view=fixture();expect(hasPrivateTownTask(view)).toBe(true);delete view.action;expect(hasPrivateTownTask(view)).toBe(false);view.game!.phase='FIRST_NIGHT';view.startInfo={infoId:'i',gameId:'g',team:[],bluffs:[],acknowledged:false,canAcknowledge:true};expect(hasPrivateTownTask(view)).toBe(true);view.startInfo.acknowledged=true;expect(hasPrivateTownTask(view)).toBe(false);view.game!.phase='ROLE_REVEAL';view.roleConfirmed=true;expect(hasPrivateTownTask(view)).toBe(false);
});

test('opening an earlier clue selects that same night in the town grimoire',()=>{
 const view=fixture('spy');delete view.action;view.history=[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'旧夜',grimoire:{entries:[{seat:2,nickname:'旧乙',roleName:'僧侣',alive:true,reminders:['存活']}]}},{seq:2,phase:'OTHER_NIGHT',day:1,kind:'INFORMATION',text:'新夜',grimoire:{entries:[{seat:2,nickname:'新乙',roleName:'小恶魔',alive:false,reminders:['死亡']}]}}];
 render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:'我的线索'}));fireEvent.click(screen.getByRole('button',{name:'上一条线索'}));fireEvent.click(screen.getByRole('button',{name:'查看魔典'}));expect(screen.getByText('首夜 · 魔典')).toBeVisible();expect(screen.getByRole('button',{name:/2号 旧乙，魔典所示僧侣/})).toBeVisible();expect(screen.queryByRole('button',{name:/新乙/})).not.toBeInTheDocument();
});


test('role advice is a local centered dialog and returns to identity confirmation for every role',()=>{
 const view=fixture('librarian');delete view.action;view.role!.name='图书管理员';view.role!.beginnerTip='保留你的候选线索';view.game!.phase='ROLE_REVEAL';render(<PlayerGame {...handlers} view={view}/>);
 fireEvent.click(screen.getByRole('button',{name:'游玩建议'}));expect(screen.getByRole('dialog',{name:'图书管理员 · 游玩建议'})).toBeVisible();expect(screen.getByText('保留你的候选线索')).toBeVisible();expect(handlers.onOpenGuide).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'关闭图书管理员 · 游玩建议'}));expect(screen.getByRole('button',{name:'确认身份'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'游玩建议'}));fireEvent(window,new Event('ravens:cover-private'));expect(screen.queryByRole('dialog',{name:'图书管理员 · 游玩建议'})).not.toBeInTheDocument();
});

test('only received team identities and equal clue candidates are marked beside players',()=>{
 const view=fixture('imp');view.game!.phase='DAY_DISCUSSION';delete view.action;view.startInfo={infoId:'team',gameId:'g',team:[{seat:2,nickname:'乙',kind:'MINION'}],bluffs:[],acknowledged:true,canAcknowledge:false};view.history=[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'甲和丙之一是镇民',targetSeats:[1,3]}];render(<PlayerGame {...handlers} view={view}/>);
 expect(screen.getByRole('button',{name:'我的线索：爪牙'})).toBeVisible();expect(screen.getAllByRole('button',{name:'我的线索：线索'})).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'我的线索：爪牙'}));expect(screen.getByRole('dialog',{name:'我的圆桌线索'})).toBeVisible();expect(screen.getByText('2号 乙 · 爪牙')).toBeVisible();fireEvent(window,new Event('ravens:cover-private'));expect(screen.queryByRole('dialog',{name:'我的圆桌线索'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'我的线索：爪牙'})).not.toBeInTheDocument();
});

test('voting management remains available in a sheet and closes when its ballot context changes',()=>{
 const view=fixture();delete view.action;view.game!.phase='VOTING';view.game!.nomination={ballotId:'b',nominatorSeat:1,nomineeSeat:2,threshold:2,votersRequired:3,votesRaised:0,votesReceived:0};view.canFinishDefense=true;view.canCancelNomination=true;const finish=vi.fn(),ui=render(<PlayerGame {...handlers} onFinishDefense={finish} view={view}/>);
 fireEvent.click(screen.getByRole('button',{name:'结束辩护 / 本轮表决'}));fireEvent.click(screen.getByRole('button',{name:'结束辩护，开始表决'}));expect(finish).toHaveBeenCalledOnce();ui.rerender(<PlayerGame {...handlers} view={{...view,game:{...view.game!,contextId:'next',phase:'NOMINATION'}}}/>);expect(screen.queryByRole('dialog',{name:'本轮表决'})).not.toBeInTheDocument();
});

test('butler master badge has a useful private detail and yields to the next night action',()=>{
 const view=fixture('butler');delete view.action;view.game!.phase='DAY_DISCUSSION';view.butler={masterSeat:2,masterRaised:false};
 const ui=render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:'我的线索：主人'}));const detail=screen.getByRole('dialog',{name:'我的圆桌线索'});expect(within(detail).getByText('本轮主人')).toBeVisible();expect(within(detail).getByText('2号 乙')).toBeVisible();expect(within(detail).getByText(/本轮已被计入赞成票/)).toBeVisible();
 const night=fixture('butler');night.contextId='next-action';night.butler=view.butler;ui.rerender(<PlayerGame {...handlers} view={night}/>);expect(screen.queryByRole('dialog',{name:'我的圆桌线索'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'确认选择（0/1）'})).toBeVisible();
});

test('private action records show only their received target portraits',()=>{
 const view=fixture();delete view.action;view.game!.phase='DAY_DISCUSSION';view.game!.seats[1]!.avatar='/portraits/b.webp';view.history=[{seq:1,phase:'OTHER_NIGHT',day:1,kind:'ACTION',text:'你选择了今晚的目标',targetSeats:[2]}];const ui=render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:'记录'}));fireEvent.click(screen.getByText('我的身份与线索记录'));expect(ui.container.querySelector('.clue-target-portraits img')).toHaveAttribute('src','/portraits/b.webp');expect(ui.container.querySelectorAll('.clue-target-portraits>span')).toHaveLength(1);
});
