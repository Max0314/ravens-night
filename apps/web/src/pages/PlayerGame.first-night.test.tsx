// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {PrivateView} from '../api.js';
import {preparePrivateArt} from '../components/PremiumArt.js';
import {PlayerGame} from './PlayerGame.js';
vi.mock('../api.js',async original=>({...await original<typeof import('../api.js')>(),acknowledgePresentations:vi.fn(async()=>({acked:[],revision:2}))}));
vi.mock('../components/PremiumArt.js',async original=>({...await original<typeof import('../components/PremiumArt.js')>(),preparePrivateArt:vi.fn(async()=>({ready:[],failed:[],timedOut:[]}))}));
vi.mock('../components/experience-audio.js',async original=>({...await original<typeof import('../components/experience-audio.js')>(),prepareRoleAudio:vi.fn(async()=>{}),scheduleRoleCue:vi.fn()}));
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onConfirmStartInfo:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
const identity={version:1 as const,id:'identity',kind:'IDENTITY' as const,themeRoleId:'chef',shown:{type:'IDENTITY' as const,roleId:'chef',summary:'厨师能力'}};
function fixture():PrivateView{return{roomInstanceId:'room',room:{code:'ABCDEF',state:'RUNNING',playerCount:7,participants:[]},participant:{id:'me',nickname:'甲',seat:1},state:'RUNNING',role:{roleId:'chef',name:'厨师',type:'TOWNSFOLK',alignment:'GOOD',summary:'厨师能力',beginnerTip:'建议'},roleConfirmed:false,messages:[],history:[],presentations:{version:1,pending:[{historySeq:1,scene:identity}],hasMore:false},game:{gameId:'integrated',phase:'ROLE_REVEAL',day:0,serverNow:1000,presentationUntil:7450,seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,connected:true,ghostVoteAvailable:true})),events:[{seq:1,id:'night',kind:'NIGHT_FALLS',startsAt:1250,occurredAt:1000,durationMs:6200,timingVersion:4,gameId:'integrated',message:'夜幕降临'}],aliveCount:3,readyCount:0}};}
async function advance(ms:number){await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});await act(async()=>vi.advanceTimersByTime(ms));}
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,'hidden',{configurable:true,value:false});sessionStorage.clear();localStorage.clear();vi.clearAllMocks();});
afterEach(()=>{cleanup();vi.useRealTimers();});
test('opening night owns the full screen, skipping keeps the gate, then identity appears without an extra night notice',async()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();expect(screen.queryByRole('dialog',{name:'仅你可见的完整演出'})).toBeNull();expect(screen.queryByRole('button',{name:'知道了'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));await advance(1000);expect(screen.queryByRole('dialog',{name:'身份确认'})).toBeNull();expect(screen.getByRole('heading',{name:'夜幕正在降临'})).toBeVisible();
 ui.rerender(<PlayerGame {...handlers} view={{...view,game:{...view.game!,serverNow:7450}}} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'身份确认'})).toBeVisible();expect(screen.queryByRole('button',{name:'知道了'})).toBeNull();
 ui.rerender(<PlayerGame {...handlers} view={{...view,roleConfirmed:true,game:{...view.game!,serverNow:7450}}} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'仅你可见的完整演出'})).toBeVisible();expect(ui.container.querySelector('[data-kind="IDENTITY"]')).not.toBeNull();expect(screen.queryByRole('button',{name:'知道了'})).toBeNull();
});
test('a live dawn blocked by a slowly preparing private scene is delivered once in town after that scene ends',async()=>{
 let ready:()=>void=()=>{};vi.mocked(preparePrivateArt).mockImplementationOnce(()=>new Promise(resolve=>{ready=()=>resolve({ready:[],failed:[],timedOut:[]});}));
 const view=fixture();view.roleConfirmed=true;view.game!.phase='FIRST_NIGHT';view.game!.presentationUntil=0;view.game!.events=[];view.presentations!.pending=[{historySeq:2,scene:{version:1,id:'count',kind:'INFORMATION',themeRoleId:'chef',shown:{type:'COUNT',value:2}}}];
 const ui=render(<PlayerGame {...handlers} view={view} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'仅你可见的完整演出'})).toBeVisible();
 const day={...view,game:{...view.game!,phase:'DAY_DISCUSSION' as const,day:1,serverNow:2000,events:[{seq:2,id:'dawn',kind:'DAWN' as const,startsAt:2000,occurredAt:2000,durationMs:6600,timingVersion:4 as const,gameId:'integrated',day:1,outcome:'NO_DEATH' as const,message:'天亮了',seats:[]}]}};
 ui.rerender(<PlayerGame {...handlers} view={day} roomCode="ABCDEF"/>);await advance(7000);expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();expect(screen.queryByRole('button',{name:'知道了'})).toBeNull();expect(JSON.parse(sessionStorage.getItem('ravens_events_integrated')??'[]')).not.toContain('dawn');
 await act(async()=>ready());await advance(4000);expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();expect(screen.getByRole('heading',{name:'天亮了'})).toBeVisible();expect(screen.queryByRole('dialog',{name:'仅你可见的完整演出'})).toBeNull();
 await advance(6700);expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();expect(JSON.parse(sessionStorage.getItem('ravens_events_integrated')??'[]')).toContain('dawn');
});

test('a locally completed identity cannot hold dawn forever while its art acknowledgement snapshot is still stale',async()=>{
 const view=fixture();view.roleConfirmed=true;view.game!.phase='FIRST_NIGHT';view.game!.presentationUntil=0;view.game!.events=[];const ui=render(<PlayerGame {...handlers} view={view} roomCode="ABCDEF"/>);await advance(3800);expect(screen.queryByRole('dialog',{name:'仅你可见的完整演出'})).toBeNull();
 const day={...view,game:{...view.game!,phase:'DAY_DISCUSSION' as const,day:1,serverNow:5000,events:[{seq:2,id:'after-identity-dawn',kind:'DAWN' as const,startsAt:5000,occurredAt:5000,durationMs:6600,timingVersion:4 as const,gameId:'integrated',day:1,outcome:'NO_DEATH' as const,message:'天亮了',seats:[]}]}};
 ui.rerender(<PlayerGame {...handlers} view={day} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();expect(screen.queryByRole('button',{name:'知道了'})).toBeNull();
});

test.each([['empath','共情者','INFORMATION'],['fortune_teller','占卜师','IDENTITY']] as const)('first-night automatic %s presentation hides only its duplicate task notice, then exposes the real choice',async(roleId,name,kind)=>{
 const view=fixture();view.role={...view.role!,roleId,name};view.roleConfirmed=true;view.game!.phase='FIRST_NIGHT';view.game!.presentationUntil=0;view.game!.events=[];view.action={kind:'SELECT_ONE',legalSeats:[2],minTargets:1,maxTargets:1,prompt:'选择今晚的目标'};view.presentations!.pending=[{historySeq:1,scene:{...identity,themeRoleId:roleId,kind,shown:kind==='IDENTITY'?{type:'IDENTITY',roleId,summary:'能力'}:{type:'COUNT',value:1}}}];
 const ui=render(<PlayerGame {...handlers} view={view} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'仅你可见的完整演出'})).toBeVisible();expect(screen.queryByLabelText('我的行动提醒')).toBeNull();
 ui.rerender(<PlayerGame {...handlers} view={view} roomCode="ABCDEF" guideOpen/>);await advance(0);expect(screen.getByLabelText('我的行动提醒')).toBeVisible();ui.rerender(<PlayerGame {...handlers} view={view} roomCode="ABCDEF"/>);await advance(0);expect(screen.queryByLabelText('我的行动提醒')).toBeNull();
 await advance(4600);expect(screen.queryByRole('dialog',{name:'仅你可见的完整演出'})).toBeNull();expect(screen.getByRole('button',{name:'确认选择（0/1）'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'记录'}));await advance(0);expect(screen.getByLabelText('我的行动提醒')).toBeVisible();
});
test('another night keeps its real action notice while automatic information plays',async()=>{
 const view=fixture();view.roleConfirmed=true;view.game!.phase='OTHER_NIGHT';view.game!.presentationUntil=0;view.game!.events=[];view.action={kind:'SELECT_ONE',legalSeats:[2],minTargets:1,maxTargets:1,prompt:'选择今晚的目标'};view.presentations!.pending=[{historySeq:2,scene:{version:1,id:'later-info',kind:'INFORMATION',themeRoleId:'empath',shown:{type:'COUNT',value:1}}}];
 render(<PlayerGame {...handlers} view={view} roomCode="ABCDEF"/>);await advance(0);expect(screen.getByRole('dialog',{name:'仅你可见的完整演出'})).toBeVisible();expect(screen.getByLabelText('我的行动提醒')).toBeVisible();
});
