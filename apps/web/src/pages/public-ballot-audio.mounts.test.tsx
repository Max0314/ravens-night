// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {PrivateView,RoomView} from '../api.js';
import {getRoom} from '../api.js';
import {PlayerGame} from './PlayerGame.js';
import {Display} from './Display.js';
const audio=vi.hoisted(()=>({tails:{update:vi.fn(),preview:vi.fn(),dispose:vi.fn()},ballot:{update:vi.fn(),dispose:vi.fn()},createTails:vi.fn(),createBallot:vi.fn(),silence:vi.fn(),receive:undefined as undefined|((packet:{room:RoomView})=>void)}));
vi.mock('../components/experience-audio.js',async original=>({...await original<typeof import('../components/experience-audio.js')>(),createNominationAudio:audio.createTails.mockImplementation(()=>audio.tails),createBallotCountdownAudio:audio.createBallot.mockImplementation(()=>audio.ballot),prepareNominationAudio:vi.fn(async()=>{}),silenceEffects:audio.silence}));
// Isolate the new owner from EventStage's existing whole-app background policy.
vi.mock('../components/EventStage.js',async original=>({...await original<typeof import('../components/EventStage.js')>(),EventStage:()=>null}));
vi.mock('../components/PrivateSceneStage.js',()=>({PrivateSceneStage:()=>null}));
vi.mock('../api.js',async original=>({...await original<typeof import('../api.js')>(),getRoom:vi.fn()}));
vi.mock('../room-live.js',()=>({connectRoomFeed:(_code:string,_mode:string,receive:typeof audio.receive)=>{audio.receive=receive;return()=>{};}}));
vi.mock('../invite.js',()=>({invitationQr:vi.fn(async()=>'/qr.png')}));
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
function fixture():PrivateView{return{state:'RUNNING',roomInstanceId:'room',room:{code:'ABCDEF',state:'RUNNING',playerCount:3,participants:[]},participant:{id:'me',nickname:'甲',seat:1},role:{roleId:'chef',name:'厨师',type:'TOWNSFOLK',alignment:'GOOD',summary:'能力',beginnerTip:'建议'},roleConfirmed:true,history:[],messages:[],canVote:true,voteRaised:false,game:{gameId:'g',phase:'VOTING',day:1,serverNow:21000,aliveCount:3,readyCount:0,events:[],seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,connected:true,ghostVoteAvailable:true})),nomination:{mode:'SIMULTANEOUS',ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:1,votesReceived:2,votersRequired:3,threshold:2,preparationEndsAt:21000,voteStartsAt:21000,voteEndsAt:29000,countdownStarted:true}}};}
beforeEach(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});localStorage.clear();vi.clearAllMocks();audio.receive=undefined;});
afterEach(()=>{cleanup();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
function oneOwner(){expect(audio.createTails).toHaveBeenCalledOnce();expect(audio.createBallot).toHaveBeenCalledOnce();expect(audio.tails.dispose).not.toHaveBeenCalled();expect(audio.ballot.dispose).not.toHaveBeenCalled();}
test('player audio stays unique across records, handbook, private cover and voting, and its background handler only pauses its own scopes',async()=>{
 const view=fixture(),ui=render(<PlayerGame {...handlers} view={view}/>);oneOwner();
 fireEvent.click(screen.getByRole('button',{name:'记录'}));await screen.findByLabelText('提名提醒');oneOwner();
 for(const guideOpen of [true,false,true,false]){ui.rerender(<PlayerGame {...handlers} view={view} guideOpen={guideOpen}/>);oneOwner();}
 fireEvent(window,new Event('ravens:cover-private'));oneOwner();expect(audio.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:false});
 fireEvent.click(screen.getByRole('button',{name:'显示私密内容'}));ui.rerender(<PlayerGame {...handlers} view={{...view,voteSubmitted:true,game:{...view.game!,nomination:{...view.game!.nomination!,votesReceived:3}}}}/>);oneOwner();
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(audio.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:true});expect(audio.tails.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:true});oneOwner();expect(audio.silence).not.toHaveBeenCalled();
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await waitFor(()=>expect(audio.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:false}));oneOwner();
 ui.unmount();expect(audio.tails.dispose).toHaveBeenCalledOnce();expect(audio.ballot.dispose).toHaveBeenCalledOnce();expect(audio.silence).not.toHaveBeenCalled();
});
test('display owns one audio pair across live ballot snapshots without any notice or button owners',async()=>{
 const view=fixture(),room={...view.room!,game:view.game!};vi.mocked(getRoom).mockResolvedValue(room);const ui=render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);await waitFor(oneOwner);
 act(()=>audio.receive?.({room:{...room,game:{...room.game,nomination:{...room.game.nomination!,votesReceived:3}}}}));oneOwner();expect(audio.ballot.update.mock.calls.at(-1)?.[0]).toEqual({id:'b',startsAt:21000,endsAt:29000});
 ui.unmount();expect(audio.tails.dispose).toHaveBeenCalledOnce();expect(audio.ballot.dispose).toHaveBeenCalledOnce();expect(audio.silence).not.toHaveBeenCalled();
});
