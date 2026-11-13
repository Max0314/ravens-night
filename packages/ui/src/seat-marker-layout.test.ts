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
