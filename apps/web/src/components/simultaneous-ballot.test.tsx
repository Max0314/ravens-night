// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {PrivateView} from '../api.js';
import {simultaneousBallotStatus} from './ballot-status.js';
import {PublicBallot} from './PublicBallot.js';
import {NominationNotice} from './NominationNotice.js';
import {Gallows} from './Gallows.js';
afterEach(()=>{cleanup();vi.clearAllMocks();});
function fixture():PrivateView{return {state:'RUNNING',roomInstanceId:'room',participant:{id:'me',nickname:'甲',seat:1},history:[],messages:[],canVote:true,voteRaised:false,voteSubmitted:false,room:{code:'ABCDEF',state:'RUNNING',playerCount:3,participants:[],timeline:{mode:'MANUAL',epoch:0}},game:{gameId:'g',phase:'VOTING',day:1,serverNow:1000,aliveCount:3,readyCount:0,events:[],seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,ghostVoteAvailable:true,connected:true})),nomination:{mode:'SIMULTANEOUS',ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:1,votesReceived:2,votersRequired:3,threshold:2,defenseFinished:false,preparationEndsAt:21000,voteStartsAt:21000,voteEndsAt:29000,countdownStarted:false}}};}
test('server anchors preserve the final countdown across presentation shifts and the cutoff is shared',()=>{
 const view=fixture(),game=view.game!,ballot=game.nomination!;
 expect(simultaneousBallotStatus(game,undefined,1000)).toMatchObject({started:false,seconds:28,locked:false});
 expect(simultaneousBallotStatus(game,undefined,21000)).toMatchObject({started:true,seconds:8,locked:false});
 expect(simultaneousBallotStatus({...game,nomination:{...ballot,countdownStarted:true,voteStartsAt:5000,voteEndsAt:13000}},undefined,5000)).toMatchObject({seconds:8,timeLabel:'剩余 8秒',locked:false});
 expect(simultaneousBallotStatus(game,undefined,28999)).toMatchObject({seconds:1,locked:false});
 expect(simultaneousBallotStatus(game,undefined,29000)).toMatchObject({seconds:0,locked:true});
 const shifted={...game,presentationUntil:40000,nomination:{...ballot,countdownStarted:true,voteStartsAt:37000,voteEndsAt:45000}};
 expect(simultaneousBallotStatus(shifted,undefined,30000)).toMatchObject({started:true,seconds:5,paused:true});
 expect(simultaneousBallotStatus(shifted,undefined,40000)).toMatchObject({started:true,seconds:5,paused:false});
 const old={...ballot};delete old.mode;expect(simultaneousBallotStatus({...game,nomination:old},undefined,21000)).toBeUndefined();
});
test('an untouched false hand differs from explicit no, and counted seats cannot lock a simultaneous ballot',()=>{
 const view=fixture(),vote=vi.fn();view.game!.nomination!.countedSeats=[1];view.game!.nomination!.countedVotes={1:false};
 const body=(v:PrivateView)=><><PublicBallot view={v} busy={false} onVote={vote} onDetails={vi.fn()}/><NominationNotice active view={v} busy={false} onVote={vote} onDetails={vi.fn()}/></>;
 const ui=render(body(view));
 for(const label of ['公开表决','提名提醒']){const area=within(screen.getByLabelText(label));expect(area.getByRole('status')).toHaveTextContent('尚未选择');expect(area.getByRole('button',{name:'不举手'})).toHaveAttribute('aria-pressed','false');expect(area.getByRole('button',{name:'举手'})).toBeEnabled();fireEvent.click(area.getByRole('button',{name:'不举手'}));}
 expect(vote.mock.calls).toEqual([[false],[false]]);expect(screen.getByLabelText('提名提醒')).toHaveTextContent('已选择 2/3 人');
 ui.rerender(body({...view,voteSubmitted:true}));for(const label of ['公开表决','提名提醒']){const area=within(screen.getByLabelText(label));expect(area.getByRole('status')).toHaveTextContent('已选择不举手');expect(area.getByRole('button',{name:'不举手'})).toHaveAttribute('aria-pressed','true');}
});
test('the final eight seconds allow changes for every eligible seat and disable together at the deadline',()=>{
 const view=fixture();view.game!.serverNow=21000;view.game!.nomination!.countdownStarted=true;view.voteSubmitted=true;const vote=vi.fn();
 const body=(v:PrivateView)=><><PublicBallot view={v} busy={false} onVote={vote} onDetails={vi.fn()}/><NominationNotice active view={v} busy={false} onVote={vote} onDetails={vi.fn()}/></>;
 const ui=render(body(view));for(const label of ['公开表决','提名提醒']){const area=within(screen.getByLabelText(label));expect(area.getByText(/剩余 8秒/)).toBeVisible();fireEvent.click(area.getByRole('button',{name:'举手'}));expect(area.getByRole('button',{name:'不举手'})).toBeEnabled();}
 ui.rerender(body({...view,game:{...view.game!,serverNow:29000}}));for(const label of ['公开表决','提名提醒']){const area=within(screen.getByLabelText(label));expect(area.getByRole('status')).toHaveTextContent('已截止');expect(area.getByRole('button',{name:'举手'})).toBeDisabled();expect(area.getByRole('button',{name:'不举手'})).toBeDisabled();}
 expect(vote).toHaveBeenCalledTimes(2);
});
test('a ghost hand uses simultaneous cutoff wording and a new ballot clears its confirmation',()=>{
 const view=fixture();view.game!.seats[0]!.alive=false;const vote=vi.fn(),props={busy:false,onVote:vote,onDetails:vi.fn()};const ui=render(<PublicBallot {...props} view={view}/>);
 fireEvent.click(screen.getByRole('button',{name:'不举手'}));expect(vote).toHaveBeenCalledWith(false);fireEvent.click(screen.getByRole('button',{name:'举手'}));expect(screen.getByRole('alertdialog')).toHaveTextContent('统一截止时仍举手');
 ui.rerender(<PublicBallot {...props} view={{...view,game:{...view.game!,nomination:{...view.game!.nomination!,ballotId:'next'}}}}/>);expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
test('a collapsed notice retains numeric time and explicit-choice count; public gallows never shows sequential counting',()=>{
 const view=fixture();view.game!.nomination!.currentVoterSeat=2;
 render(<><NominationNotice active view={view} busy={false} onVote={vi.fn()} onDetails={vi.fn()}/><Gallows game={view.game!} room={view.room}/></>);
 fireEvent.click(screen.getByRole('button',{name:'收起提名提醒'}));expect(screen.getByLabelText('提名提醒')).toHaveTextContent('剩余 28秒');expect(screen.getByLabelText('提名提醒')).toHaveTextContent('已选择 2/3 人');expect(screen.getByLabelText('提名与处决席')).toHaveTextContent('已选择 2/3 人');expect(screen.getByLabelText('提名与处决席')).not.toHaveTextContent('正在计');
});
