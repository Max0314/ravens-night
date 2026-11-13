// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {PrivateView} from '../api.js';
import {PlayerGame} from './PlayerGame.js';
vi.mock('../components/PrivateSceneStage.js',()=>({PrivateSceneStage:()=>null}));
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
const prompt='选择两名玩家，占卜他们是否有恶魔';
function fixture():PrivateView{return{state:'RUNNING',roomInstanceId:'room',participant:{id:'me',nickname:'甲',seat:1},role:{roleId:'fortune_teller',name:'占卜师',type:'TOWNSFOLK',alignment:'GOOD',summary:'能力',beginnerTip:'建议'},roleConfirmed:true,history:[],messages:[],action:{kind:'SELECT_TWO',legalSeats:[2,3],minTargets:2,maxTargets:2,prompt},game:{gameId:'g',contextId:'c',phase:'OTHER_NIGHT',day:1,serverNow:1000,aliveCount:3,readyCount:0,events:[],seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,connected:true,ghostVoteAvailable:true}))}};}
async function advance(ms=0){await act(async()=>{for(let i=0;i<4;i++)await Promise.resolve();});await act(async()=>vi.advanceTimersByTime(ms));}
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});localStorage.clear();sessionStorage.clear();});
afterEach(()=>{cleanup();vi.useRealTimers();window.history.replaceState({},'','/');});
const strip=()=>screen.getByText(prompt).closest('.town-night-prompt')!;
test('only handbook and records show the task notice; town, player wheels and player details keep only the existing prompt',async()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>);await advance();expect(screen.queryByLabelText('我的行动提醒')).toBeNull();expect(strip()).toHaveTextContent(prompt);
 fireEvent.click(screen.getByRole('button',{name:'[玩家2] 存活'}));await advance();expect(screen.getByRole('dialog',{name:'[玩家2] 操作'})).toBeVisible();expect(screen.queryByLabelText('我的行动提醒')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'详情'}));await advance();expect(screen.getByRole('dialog',{name:'[玩家2]'})).toBeVisible();expect(screen.queryByLabelText('我的行动提醒')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'关闭[玩家2]'}));fireEvent.click(screen.getByRole('button',{name:'关闭玩家操作'}));fireEvent.click(screen.getByRole('button',{name:'记录'}));await advance();expect(screen.getByLabelText('我的行动提醒')).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} view={view} guideOpen/>);await advance();expect(screen.getByLabelText('我的行动提醒')).toBeVisible();
 const operation=document.createElement('div');operation.className='player-wheel-backdrop';await act(async()=>document.body.append(operation));expect(screen.queryByLabelText('我的行动提醒')).toBeNull();await act(async()=>operation.remove());expect(screen.getByLabelText('我的行动提醒')).toBeVisible();
});
test.each(['event-stage','private-scene-dialog','private-ritual'])('%s occupancy suppresses a record-page notice without changing its pending task',async kind=>{
 render(<PlayerGame {...handlers} view={fixture()}/>);fireEvent.click(screen.getByRole('button',{name:'记录'}));await advance();expect(screen.getByLabelText('我的行动提醒')).toBeVisible();const stage=document.createElement('section');stage.className=kind;await act(async()=>document.body.append(stage));expect(screen.queryByLabelText('我的行动提醒')).toBeNull();await act(async()=>stage.remove());expect(screen.getByLabelText('我的行动提醒')).toBeVisible();
});
test('the top task strip waits fifteen idle seconds and pointer, keyboard and touch activity each reset it',async()=>{
 render(<PlayerGame {...handlers} view={fixture()}/>);await advance(14999);expect(strip()).not.toHaveClass('is-idle');await advance(1);expect(strip()).toHaveClass('is-idle');expect(screen.queryByLabelText('我的行动提醒')).toBeNull();
 for(const interact of [()=>fireEvent.pointerDown(window),()=>fireEvent.click(window),()=>fireEvent.wheel(window),()=>fireEvent.keyDown(window,{key:'ArrowRight'}),()=>fireEvent.touchStart(window)]){interact();expect(strip()).not.toHaveClass('is-idle');await advance(14999);expect(strip()).not.toHaveClass('is-idle');await advance(1);expect(strip()).toHaveClass('is-idle');}
});
test('task changes, menus, busy state, privacy and the background stop idle emphasis and restart a full quiet interval',async()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>);await advance(15000);expect(strip()).toHaveClass('is-idle');ui.rerender(<PlayerGame {...handlers} view={view} busy/>);expect(strip()).not.toHaveClass('is-idle');await advance(20000);expect(strip()).not.toHaveClass('is-idle');ui.rerender(<PlayerGame {...handlers} view={view}/>);await advance(15000);expect(strip()).toHaveClass('is-idle');
 const next={...view,contextId:'next',game:{...view.game!,phase:'FIRST_NIGHT' as const}};ui.rerender(<PlayerGame {...handlers} view={next}/>);expect(strip()).not.toHaveClass('is-idle');await advance(15000);expect(strip()).toHaveClass('is-idle');fireEvent.click(screen.getByRole('button',{name:'记录'}));await advance(20000);expect(screen.queryByText(prompt)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'城镇待办'}));await advance(14999);expect(strip()).not.toHaveClass('is-idle');await advance(1);expect(strip()).toHaveClass('is-idle');
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await advance(20000);expect(strip()).not.toHaveClass('is-idle');act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await advance();fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));await advance(14999);expect(strip()).not.toHaveClass('is-idle');await advance(1);expect(strip()).toHaveClass('is-idle');
 fireEvent(window,new Event('ravens:cover-private'));expect(strip()).not.toHaveClass('is-idle');const done={...next};delete done.action;ui.rerender(<PlayerGame {...handlers} view={done}/>);expect(screen.queryByText(prompt)).toBeNull();
});
