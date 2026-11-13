// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,render,fireEvent,screen} from '@testing-library/react';
import {experienceTiming,type ExperienceEvent} from '@ravens/contracts';
import {ExecutionBloodScreen} from './SharpEffects.js';
import {EventStage} from './EventStage.js';
import type {GameView} from '../api.js';
afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();vi.useRealTimers();});
test('viewport blood requires a published death on a nonempty execution',()=>{
 for(const reduced of [false,true])for(const props of [{death:false,empty:false,resultVisible:true},{death:true,empty:true,resultVisible:true},{death:true,empty:false,resultVisible:false}]){
  const ui=render(<ExecutionBloodScreen elapsedMs={2000} resultAt={1000} reduced={reduced} {...props}/>);expect(ui.container.querySelector('svg')).toBeNull();ui.unmount();
 }
 const props={death:true,empty:false,resultVisible:true,resultAt:1000},ui=render(<ExecutionBloodScreen {...props} elapsedMs={999}/>);expect(ui.container.querySelector('svg')).toBeNull();
 ui.rerender(<ExecutionBloodScreen {...props} elapsedMs={1250}/>);expect(ui.container.querySelectorAll('image')).toHaveLength(5);expect(ui.container.querySelector('[data-screen-blood-particle]')).not.toBeNull();
 ui.rerender(<ExecutionBloodScreen {...props} elapsedMs={1100} reduced/>);const still=ui.container.innerHTML;expect(ui.container.querySelector('svg')).toHaveClass('is-reduced');expect(ui.container.querySelector('[data-screen-blood-particle]')).toBeNull();
 ui.rerender(<ExecutionBloodScreen {...props} elapsedMs={2900} reduced/>);expect(ui.container.innerHTML).toBe(still);
});
test('public stage mounts blood at viewport level after result, and never on empty/NO_DEATH',()=>{
 vi.useFakeTimers();const start=Date.now(),resultAt=experienceTiming('EXECUTION',4).resultOffset;
 const event:ExperienceEvent={id:'exec-blood',gameId:'blood-game',seq:1,kind:'EXECUTION',message:'公开处决结果',occurredAt:start,startsAt:start,durationMs:4500,timingVersion:4,targetSeat:2,outcome:'DEATH'};
 const game:GameView={gameId:'blood-game',phase:'DAY_DISCUSSION',day:1,events:[event],readyCount:0,aliveCount:4,seats:[{seat:2,nickname:'目标',alive:false,connected:true,ghostVoteAvailable:true}]};
 const props={preview:true,game,playback:{now:start+resultAt-1,paused:true,rate:1,epoch:0}},ui=render(<EventStage {...props}/>);expect(ui.container.querySelector('.execution-blood-screen')).toBeNull();
 ui.rerender(<EventStage {...props} playback={{...props.playback,now:start+resultAt+150}}/>);const blood=ui.container.querySelector('.execution-blood-screen')!;expect(blood.parentElement).toHaveClass('event-stage');expect(ui.container.querySelector('.guillotine-scene')).not.toBeNull();
 ui.rerender(<EventStage {...props} game={{...game,events:[{...event,outcome:'NO_DEATH'}]}} playback={{...props.playback,now:start+resultAt+150}}/>);expect(ui.container.querySelector('.execution-blood-screen')).toBeNull();
 const emptyEvent={...event};delete emptyEvent.targetSeat;ui.rerender(<EventStage {...props} game={{...game,events:[emptyEvent]}} playback={{...props.playback,now:start+resultAt+150}}/>);expect(ui.container.querySelector('.execution-blood-screen')).toBeNull();expect(ui.container.querySelector('.guillotine-blade')).toHaveAttribute('data-drop','0');
 fireEvent.click(screen.getByRole('button',{name:'跳过演出'}));expect(ui.container.querySelector('.event-stage')).toBeNull();
});
