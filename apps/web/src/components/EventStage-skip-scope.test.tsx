// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {GameView} from '../api.js';
import {EventStage} from './EventStage.js';
import {PublicNominationAudio} from './PublicNominationAudio.js';
const audio=vi.hoisted(()=>({cancel:vi.fn(),silence:vi.fn(),tails:{update:vi.fn(),preview:vi.fn(),dispose:vi.fn(),interrupt:vi.fn()},ballot:{update:vi.fn(),dispose:vi.fn(),interrupt:vi.fn()},createTails:vi.fn(),createBallot:vi.fn()}));
vi.mock('./experience-audio.js',async original=>({...await original<typeof import('./experience-audio.js')>(),cancelEventAudio:audio.cancel,silenceEffects:audio.silence,scheduleCue:vi.fn(),schedulePrivateCue:vi.fn(),prepareNominationAudio:vi.fn(async()=>{}),createNominationAudio:audio.createTails.mockImplementation(()=>audio.tails),createBallotCountdownAudio:audio.createBallot.mockImplementation(()=>audio.ballot)}));
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
afterEach(()=>{cleanup();vi.useRealTimers();});
test('skipping deferred dawn cancels only that stage and its own receipt while nomination tails and ballot owners stay alive',()=>{
 const start=10000,neutral={seq:1,id:'dawn',kind:'DAWN' as const,gameId:'g',occurredAt:start,startsAt:start,durationMs:6600,timingVersion:4 as const,day:1,message:'黎明将至。'};
 const night:GameView={gameId:'g',phase:'FIRST_NIGHT',day:0,serverNow:start,aliveCount:3,readyCount:0,seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,connected:true,ghostVoteAvailable:true})),events:[neutral]};
 const ui=render(<><PublicNominationAudio game={night}/><EventStage game={night} blocked/></>);
 const voting:GameView={...night,phase:'VOTING',day:1,serverNow:start+8000,events:[{...neutral,outcome:'NO_DEATH',seats:[]},{seq:2,id:'nomination',kind:'NOMINATION',gameId:'g',occurredAt:start+7600,startsAt:start+7600,durationMs:800,timingVersion:4,message:'发起提名',actorSeat:1,targetSeat:2}],nomination:{mode:'SIMULTANEOUS',ballotId:'ballot',nominatorSeat:1,nomineeSeat:2,votesReceived:3,votesRaised:1,threshold:2,countdownStarted:true,voteStartsAt:start+8000,voteEndsAt:start+16000}};
 ui.rerender(<><PublicNominationAudio game={voting}/><EventStage game={voting} receipt={{id:'receipt',kind:'PROTECT',target:'目标'}}/></>);
 expect(screen.getByRole('dialog',{name:'城镇公开演出'})).toBeVisible();expect(audio.ballot.update.mock.calls.at(-1)?.[0]).toMatchObject({id:'ballot',startsAt:18000,endsAt:26000});expect(audio.tails.update.mock.calls.at(-1)?.[0]).toEqual(voting.events);
 fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));expect(screen.queryByRole('dialog',{name:'城镇公开演出'})).toBeNull();expect(audio.cancel).toHaveBeenCalledWith('dawn');expect(audio.cancel).toHaveBeenCalledWith('private:receipt');expect(audio.cancel.mock.calls.every(([id])=>id==='dawn'||id==='private:receipt')).toBe(true);
 expect(audio.silence).not.toHaveBeenCalled();expect(audio.createTails).toHaveBeenCalledOnce();expect(audio.createBallot).toHaveBeenCalledOnce();for(const owner of [audio.tails,audio.ballot]){expect(owner.dispose).not.toHaveBeenCalled();expect(owner.interrupt).not.toHaveBeenCalled();}
});
