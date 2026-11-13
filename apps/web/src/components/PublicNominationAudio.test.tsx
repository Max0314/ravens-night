// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {GameView,RoomView} from '../api.js';
import {PublicNominationAudio,ballotAudioWindow} from './PublicNominationAudio.js';
const shared=vi.hoisted(()=>({tails:{update:vi.fn(),preview:vi.fn(),dispose:vi.fn()},ballot:{update:vi.fn(),dispose:vi.fn()},createTails:vi.fn(),createBallot:vi.fn(),prepare:vi.fn(async()=>{})}));
vi.mock('./experience-audio.js',()=>({createNominationAudio:shared.createTails.mockImplementation(()=>shared.tails),createBallotCountdownAudio:shared.createBallot.mockImplementation(()=>shared.ballot),prepareNominationAudio:shared.prepare}));
afterEach(()=>{cleanup();vi.clearAllMocks();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
function game():GameView{return{gameId:'g',serverNow:10000,phase:'VOTING',day:1,seats:[],events:[],aliveCount:5,readyCount:0,nomination:{mode:'SIMULTANEOUS',ballotId:'b1',nominatorSeat:1,nomineeSeat:2,votesReceived:2,votesRaised:1,threshold:3,voteStartsAt:20000,voteEndsAt:28000,preparationEndsAt:20000,countdownStarted:false}};}
test('one invisible stable owner holds both tails and final-eight audio while a book or vote revisions change',()=>{
 const g=game(),ui=render(<><PublicNominationAudio game={g}/><div>城镇</div></>);expect(ui.container.textContent).toBe('城镇');expect(shared.createTails).toHaveBeenCalledOnce();expect(shared.createBallot).toHaveBeenCalledOnce();
 ui.rerender(<><PublicNominationAudio game={{...g,nomination:{...g.nomination!,votesReceived:3}}}/><div>手册</div></>);expect(shared.createTails).toHaveBeenCalledOnce();expect(shared.tails.dispose).not.toHaveBeenCalled();expect(shared.ballot.update.mock.calls.at(-1)?.[0]).toEqual({id:'b1',startsAt:20000,endsAt:28000});
});
test('public presentation pause uses max(now,presentationUntil), then follows the atomically shifted window',()=>{
 const g={...game(),presentationUntil:15000},ui=render(<PublicNominationAudio game={g}/>);expect(shared.ballot.update.mock.calls.at(-1)?.[1]).toBe(15000);expect(shared.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:true,epoch:0});
 ui.rerender(<PublicNominationAudio game={{...g,serverNow:15500,nomination:{...g.nomination!,voteStartsAt:15000,voteEndsAt:23000,countdownStarted:true}}}/>);expect(shared.ballot.update.mock.calls.at(-1)?.[0]).toMatchObject({startsAt:15000,endsAt:23000});expect(shared.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:false});
});
test('manual time, hidden visibility and legacy ballots never create a local voting clock',()=>{
 const g=game(),room={code:'ABCDEF',state:'RUNNING',playerCount:5,participants:[],timeline:{mode:'MANUAL',epoch:4}} as RoomView,ui=render(<PublicNominationAudio game={g} room={room}/>);expect(shared.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:true,epoch:4});
 const legacy=game();if(legacy.nomination)delete legacy.nomination.mode;expect(ballotAudioWindow(legacy)).toBeUndefined();ui.rerender(<PublicNominationAudio game={g}/>);act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(shared.ballot.update.mock.calls.at(-1)?.[2]).toMatchObject({paused:true});
});
