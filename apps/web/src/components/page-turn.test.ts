import {expect,test} from 'vitest';
import {bendSheetPoint,dragTurnGrip,pageCurl,PageTurnController,sheetBands,sheetRectangle,shouldCompleteTurn,turnProgress} from './page-turn.js';

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
test('XY grips bend from all four corners and reflect the grabbed corner to its live position',()=>{
  for(const direction of [1,-1] as const)for(const corner of ['top','bottom'] as const){
    const grip=dragTurnGrip(-direction*130,corner==='top'?80:-80,400,600,direction,corner),g=pageCurl(400,600,{direction,corner,grip});
    const tip=bendSheetPoint({x:direction>0?400:0,y:corner==='top'?0:600},g);
    expect(tip.x).toBeCloseTo((direction>0?grip.x:1-grip.x)*400);expect(tip.y).toBeCloseTo(grip.y*600);expect(tip.back).toBe(true);
    const otherY=pageCurl(400,600,{direction,corner,grip:{...grip,y:corner==='top'?.3:.7}});
    expect(otherY.normal.y).not.toBeCloseTo(g.normal.y);
    expect(sheetBands(g,24).some(band=>band.back&&band.points.length>=3)).toBe(true);
    expect(dragTurnGrip(direction*10,100,400,600,direction,corner)).toEqual({x:1,y:corner==='top'?0:1});
  }
});

test('flat and completed geometry keep the full old page at rest and move it fully out at completion',()=>{
  for(const direction of [1,-1] as const)for(const corner of ['top','bottom'] as const){
    const y=corner==='top'?0:1,start=pageCurl(400,600,{direction,corner,grip:{x:1,y}}),end=pageCurl(400,600,{direction,corner,grip:{x:-1.16,y}});
    for(const point of sheetRectangle(start)){
      expect(bendSheetPoint(point,start)).toMatchObject({...point,z:0,back:false});
      const finished=bendSheetPoint(point,end);expect(direction>0?finished.x<0:finished.x>400).toBe(true);
    }
  }
});

test('settling continues from the exact XY grip and a cancelled corner unfolds without a page or sound commit',()=>{
  let now=0;let frame:FrameRequestCallback|undefined;const finished:(string|undefined)[]=[],sounds:string[]=[];
  const controller=new PageTurnController<string>({begin:()=>{},finish:target=>finished.push(target),sound:()=>sounds.push('turn'),clock:()=>now,requestFrame:callback=>{frame=callback;return 1;},cancelFrame:()=>{frame=undefined;}});
  controller.begin('one','two',1,'dom','top');controller.track(.2,{x:.8,y:.15});controller.settle(false);frame?.(0);
  expect(controller.state?.grip).toEqual({x:.8,y:.15});now=90;frame?.(now);expect(controller.state!.grip.x).toBeGreaterThan(.8);expect(controller.state!.grip.y).toBeLessThan(.15);
  now=200;frame?.(now);expect(finished).toEqual([undefined]);expect(sounds).toEqual([]);
  controller.begin('one','two',-1,'dom','bottom');controller.settle(true,true);now=300;frame?.(now);expect(controller.state!.grip.y).toBeLessThan(1);expect(controller.state!.grip.x).toBeLessThan(1);
  now=600;frame?.(now);expect(finished).toEqual([undefined,'two']);expect(sounds).toEqual(['turn']);
});
