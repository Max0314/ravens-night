import {expect,test} from 'vitest';
import {roundTableLayout} from '@ravens/ui';
import {displayTableLayout} from './display-table-layout.js';

test('TV circles grow portraits and names with their measured diameter, including 4K',()=>{
 // Representative available slots after the Display header and two one-line public records.
 for(const[count,diameter]of [[7,866],[12,866],[7,1732],[12,1732],[12,1120],[12,600],[7,560],[12,560]] as const){
  const layout=displayTableLayout(count,diameter),radii=layout.points.map(point=>Math.hypot(point.x-diameter/2,point.y-diameter/2));
  for(const[index,point]of layout.points.entries()){
   expect(radii[index]).toBeCloseTo(radii[0]!,8);
   expect(Math.min(point.x,point.y)-layout.seatSize/2).toBeGreaterThanOrEqual(diameter*.035-.001);
   expect(Math.max(point.x,point.y)+layout.seatSize/2).toBeLessThanOrEqual(diameter*(1-.035)+.001);
   for(const next of layout.points.slice(index+1))expect(Math.max(Math.abs(point.x-next.x),Math.abs(point.y-next.y))).toBeGreaterThanOrEqual(layout.seatSize+diameter*.01-.001);
  }
  // One ellipsized nickname line and its gap stay inside the disjoint seat square.
  expect(layout.portrait*1.055+Math.min(layout.portrait*.26,diameter*.034)*1.2).toBeLessThanOrEqual(layout.seatSize);
 }
 for(const count of [7,12]){
  const fullHD=displayTableLayout(count,866),ultraHD=displayTableLayout(count,1732);
  expect(fullHD.portrait).toBeGreaterThanOrEqual(100);expect(fullHD.portrait).toBeLessThanOrEqual(120);
  expect(Math.min(fullHD.portrait*.26,866*.034)).toBeGreaterThanOrEqual(26);expect(Math.min(fullHD.portrait*.26,866*.034)).toBeLessThanOrEqual(30);
  expect(ultraHD.portrait).toBeCloseTo(fullHD.portrait*2);expect(Math.min(ultraHD.portrait*.26,1732*.034)).toBeCloseTo(Math.min(fullHD.portrait*.26,866*.034)*2);
 }
 expect(roundTableLayout(12,866).portrait).toBe(42);
});
