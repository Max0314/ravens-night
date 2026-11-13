import {expect,test} from 'vitest';
import {bandMatrix,sampleDrawCost} from './PageTurnLayer.js';
import {bendSheetPoint,pageCurl,sheetBands} from './page-turn.js';

test('long gaps between gestures are not rendering cost, but slow actual draws trigger next-turn fallback',()=>{
  const fast={count:0,total:0},slow={count:0,total:0};let now=0;
  for(let i=0;i<20;i++){
    now+=500;
    expect(sampleDrawCost(fast,now,now+2)).toBe(false);
    expect(sampleDrawCost(slow,now,now+30)).toBe(i>=3);
  }
});

test('textured bands meet the same XY fold vertices as the simplified paper curl',()=>{
  for(const direction of [1,-1] as const)for(const corner of ['top','bottom'] as const){
    const g=pageCurl(360,640,{direction,corner,grip:{x:.45,y:corner==='top'?.15:.85}});
    for(const band of sheetBands(g,24)){
      const [a,b,c,d,e,f]=bandMatrix(band.points,g);
      for(const point of band.points){const bent=bendSheetPoint(point,g);expect(a*point.x+c*point.y+e).toBeCloseTo(bent.x,5);expect(b*point.x+d*point.y+f).toBeCloseTo(bent.y,5);}
    }
  }
});
