import {expect,test} from 'vitest';
import {roundTableLayout} from './round-table.js';
import {layoutSeatMarkers,markerOverlap} from './seat-marker-layout.js';
test.each([5,7,12])('near badges remain distinct for %s seats without changing circular geometry',count=>{
 for(const diameter of [240,260,280,320,390,460]){
 const layout=roundTableLayout(count,diameter),before=JSON.stringify(layout),seats=Array.from({length:count},(_,i)=>({seat:i+1}));
 for(const spy of [false,true]){
 const marks=Object.fromEntries(seats.filter((_,i)=>spy||i<3||i===count-1).map((s,i)=>[s.seat,spy?'毒 饵 主':i===0?'爪牙 · 主人':i===1?'① 可能是图书管理员':'① 可能是镇长']));
 const placed=layoutSeatMarkers(layout,seats,marks,spy);expect(placed,`count=${count} diameter=${diameter} spy=${spy}`).toHaveLength(Object.keys(marks).length);
 for(const [i,b] of placed.entries()){expect(b.x).toBeGreaterThanOrEqual(2);expect(b.y).toBeGreaterThanOrEqual(2);expect(b.x+b.width).toBeLessThanOrEqual(diameter-2);expect(b.y+b.height).toBeLessThanOrEqual(diameter-2);for(const other of placed.slice(i+1))expect(markerOverlap(b,other),`count=${count} diameter=${diameter} spy=${spy}`).toBe(false);}
 expect(JSON.stringify(layout)).toBe(before);
 }
 }
});

test.each([5,7,12])('near badges avoid square cages and execution marks for %s seats',count=>{
 for(const diameter of [280,340,460]){
 const layout=roundTableLayout(count,diameter),seats=Array.from({length:count},(_,i)=>({seat:i+1,caged:i===1||i===count-1,execution:i===count-1})),marks={2:'爪牙 · ① 可能是图书管理员 · 主人',[count]:'① 可能是镇长'},placed=layoutSeatMarkers(layout,seats,marks);
 expect(placed).toHaveLength(2);
 for(const b of placed)for(const [i,seat] of seats.entries())if(seat.caged){const p=layout.points[i]!,a=layout.portrait;expect(markerOverlap(b,{x:p.x-a*.64,y:p.y-6-a*.64,width:a*1.28,height:a*1.28})).toBe(false);if(seat.execution)expect(markerOverlap(b,{x:p.x-19,y:p.y+layout.seatSize/2-1,width:38,height:14})).toBe(false);}
 }
});
