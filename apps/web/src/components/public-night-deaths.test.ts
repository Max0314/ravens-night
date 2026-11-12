import {expect,test} from 'vitest';
import {experienceTiming} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {publicNightDeathSeats} from './public-night-deaths.js';
test('town scratches require a published dawn result and publicly dead seat; shot/execution never count',()=>{
 const at=1000+experienceTiming('DAWN',4).resultOffset;
 const game:GameView={phase:'DAY_DISCUSSION',day:2,serverNow:at-1,aliveCount:1,readyCount:0,seats:[1,2,3].map(seat=>({seat,nickname:String(seat),alive:seat===3,connected:true,ghostVoteAvailable:true})),events:[{seq:1,kind:'DAWN',startsAt:1000,timingVersion:4,outcome:'DEATH',seats:[1,3],message:'昨夜死亡'},{seq:2,kind:'SHOT',outcome:'DEATH',targetSeat:2,message:'枪击死亡'}]};
 expect(publicNightDeathSeats(game)).toEqual([]);game.serverNow=at;expect(publicNightDeathSeats(game)).toEqual([1]);delete game.events[0]!.outcome;expect(publicNightDeathSeats(game)).toEqual([]);
});
