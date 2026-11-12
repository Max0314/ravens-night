import {expect,test} from 'vitest';
import {sampleDrawCost} from './PageTurnLayer.js';

test('long gaps between gestures are not rendering cost, but slow actual draws trigger next-turn fallback',()=>{
  const fast={count:0,total:0},slow={count:0,total:0};let now=0;
  for(let i=0;i<20;i++){
    now+=500;
    expect(sampleDrawCost(fast,now,now+2)).toBe(false);
    expect(sampleDrawCost(slow,now,now+30)).toBe(i===19);
  }
});
