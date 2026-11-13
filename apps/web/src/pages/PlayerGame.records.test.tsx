// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {PlayerGame} from './PlayerGame.js';
import type {PrivateView} from '../api.js';
vi.mock('../components/PrivateSceneStage.js',()=>({PrivateSceneStage:()=>null}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const rect=(top:number,height:number)=>({width:320,height,top,bottom:top+height,left:0,right:320,x:0,y:top,toJSON:()=>({})});
const handlers={busy:false,error:'网络重试提示',canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
function fixture():PrivateView{return {state:'RUNNING',roomInstanceId:'room',participant:{id:'me',seat:1,nickname:'甲'},role:{roleId:'chef',name:'厨师',type:'TOWNSFOLK',alignment:'GOOD',summary:'能力',beginnerTip:'建议'},roleConfirmed:true,canVote:true,voteRaised:false,history:[],messages:[],game:{gameId:'g',contextId:'c',phase:'VOTING',day:1,aliveCount:3,readyCount:0,events:[],seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,connected:true,ghostVoteAvailable:true})),nomination:{ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:0,votesReceived:0,threshold:2}}};}
test.each([['portrait',740,650,600],['landscape',390,230,180]] as const)('ballot reading leaves %s navigation clickable and returns to town without an automatic sheet',async(_name,height,navTop,actionsTop)=>{
 handlers.onVote.mockClear();vi.stubGlobal('innerHeight',height);
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('game-tabs')?rect(navTop,60):this.classList.contains('room-action-bar')?rect(actionsTop,40):this.classList.contains('nomination-notice')?rect(100,140):rect(0,0);});
 render(<PlayerGame {...handlers} view={fixture()}/>);const nav=screen.getByRole('navigation',{name:'游戏分区'});fireEvent.click(within(nav).getByRole('button',{name:'记录'}));const notice=await screen.findByLabelText('提名提醒');
 await waitFor(()=>expect(notice).toHaveClass('nomination-notice--above-navigation'));expect(notice.style.getPropertyValue('--nomination-navigation-bottom')).toBe(`${height-actionsTop+8}px`);expect(document.documentElement.style.getPropertyValue('--nomination-record-padding')).toBe('152px');
 fireEvent.click(within(notice).getByRole('button',{name:'举手'}));expect(handlers.onVote).toHaveBeenCalledWith(true);expect(within(nav).getByRole('button',{name:'记录'})).toHaveAttribute('aria-pressed','true');fireEvent.click(within(nav).getByRole('button',{name:'城镇'}));await waitFor(()=>expect(screen.queryByLabelText('提名提醒')).not.toBeInTheDocument());expect(screen.queryByRole('dialog',{name:'本轮表决'})).not.toBeInTheDocument();expect(document.documentElement.style.getPropertyValue('--nomination-record-padding')).toBe('');
 fireEvent.click(within(nav).getByRole('button',{name:'记录'}));const next=await screen.findByLabelText('提名提醒');fireEvent.click(within(next).getByRole('button',{name:'返回城镇'}));expect(within(nav).getByRole('button',{name:'城镇'})).toHaveAttribute('aria-pressed','true');expect(screen.queryByRole('dialog',{name:'本轮表决'})).not.toBeInTheDocument();
});

test('private pending-action returns show the town task without opening ballot management',async()=>{
 const view=fixture();view.game!.phase='OTHER_NIGHT';delete view.game!.nomination;view.action={kind:'SELECT_ONE',minTargets:1,maxTargets:1,legalSeats:[2],prompt:'选择目标'};
 render(<PlayerGame {...handlers} view={view}/>);fireEvent.click(screen.getByRole('button',{name:'记录'}));const notice=await screen.findByLabelText('我的行动提醒');fireEvent.click(within(notice).getByRole('button',{name:'返回城镇'}));expect(screen.getByRole('button',{name:'城镇待办'})).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('button',{name:'确认选择（0/1）'})).toBeVisible();expect(screen.queryByRole('dialog',{name:'本轮表决'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'记录'}));fireEvent.click(screen.getByRole('button',{name:'返回城镇处理待办'}));expect(screen.getByRole('button',{name:'确认选择（0/1）'})).toBeVisible();
});
