import {expect,test} from 'vitest';
import {curlPoint,PageTurnController,shouldCompleteTurn,turnProgress} from './page-turn.js';

test('signed drag progress returns to zero when reversing past the gesture origin',()=>{
  expect(turnProgress(-100,400,1)).toBe(.25);expect(turnProgress(100,400,1)).toBe(0);
  expect(turnProgress(100,400,-1)).toBe(.25);expect(turnProgress(-100,400,-1)).toBe(0);
  expect(shouldCompleteTurn(.1,-50,-.5,1)).toBe(true);expect(shouldCompleteTurn(.1,50,.5,1)).toBe(false);
});
test('a cancelled turn never commits or plays the completed paper sample',()=>{
  let now=0;let frame:FrameRequestCallback|undefined;const finished:(string|undefined)[]=[],sounds:string[]=[];
  const controller=new PageTurnController<string>({begin:()=>{},finish:target=>finished.push(target),sound:()=>sounds.push('turn'),clock:()=>now,requestFrame:callback=>{frame=callback;return 1;},cancelFrame:()=>{frame=undefined;}});
  controller.begin('one','two',1,'canvas');controller.track(.6);controller.settle(false);now=200;frame?.(now);
  expect(finished).toEqual([undefined]);expect(sounds).toEqual([]);expect(controller.state).toBeUndefined();
});
test('button and gesture use one locked pair and commit once after the same sound crossing',()=>{
  let now=0;let frame:FrameRequestCallback|undefined;const finished:string[]=[],sounds:string[]=[];
  const controller=new PageTurnController<string>({begin:()=>{},finish:target=>{if(target)finished.push(target);},sound:()=>sounds.push('turn'),clock:()=>now,requestFrame:callback=>{frame=callback;return 1;},cancelFrame:()=>{frame=undefined;}});
  expect(controller.begin('one','two',1,'dom')).toBe(true);expect(controller.begin('one','three',-1,'canvas')).toBe(false);
  controller.settle(true,true);now=100;frame?.(now);expect(sounds).toEqual(['turn']);expect(controller.state?.renderer).toBe('dom');
  now=400;frame?.(now);expect(finished).toEqual(['two']);expect(sounds).toHaveLength(1);
});
test('curl endpoints cover the entire old page at zero and move it completely outside at one',()=>{
  for(let u=0;u<=400;u+=10){const start=curlPoint(u,400,0),end=curlPoint(u,400,1);expect(start.x).toBeCloseTo(u);expect(start.z).toBe(0);expect(end.x).toBeLessThan(0);}
});
