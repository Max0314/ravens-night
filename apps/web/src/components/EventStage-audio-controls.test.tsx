// @vitest-environment jsdom
import {cleanup,render,act} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {ExperienceEvent} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {EventStage} from './EventStage.js';
import {scheduleCue} from './experience-audio.js';
vi.mock('./experience-audio.js',async original=>({...await original<typeof import('./experience-audio.js')>(),scheduleCue:vi.fn(),cancelEventAudio:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();sessionStorage.clear();Object.defineProperty(document,'hidden',{configurable:true,value:false});});
test.each(['NIGHT_FALLS','NOMINATION','VOTE_RESULT'] as const)('%s propagates paused seeks and visibility resumes through its actual channel',kind=>{
 const event:ExperienceEvent={id:'control-'+kind,gameId:'control',kind,seq:1,startsAt:1000,occurredAt:1000,durationMs:6200,timingVersion:4,message:'公开事件'},game:GameView={gameId:'control',phase:'DAY_DISCUSSION',day:1,serverNow:1000,events:[event],seats:[],aliveCount:5,readyCount:0};
 const playback={now:1050,paused:false,rate:1,epoch:0,mode:'START' as const};const ui=render(<EventStage preview game={game} playback={playback}/>);
 ui.rerender(<EventStage preview game={game} playback={{...playback,now:1000,paused:true,epoch:1,mode:'SEEK'}}/>);expect(vi.mocked(scheduleCue).mock.calls.at(-1)?.[5]).toMatchObject({mode:'SEEK',paused:true,seekKey:1});
 ui.rerender(<EventStage preview game={game} playback={{...playback,now:1000,epoch:2,mode:'RESUME'}}/>);expect(vi.mocked(scheduleCue).mock.calls.at(-1)?.[5]).toMatchObject({mode:'RESUME',paused:false});
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});expect(vi.mocked(scheduleCue).mock.calls.at(-1)?.[5]).toMatchObject({paused:true});
 act(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});expect(vi.mocked(scheduleCue).mock.calls.at(-1)?.[5]).toMatchObject({mode:'RESUME',paused:false});
});
