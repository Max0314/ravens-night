import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {carriageDetailPose,carriageDoor,carriageDoorPose,carriagePaperStrips,parchmentPoint,carriageLampAngle} from './carriage-motion.js';

test('the real right-hand door hinge holds while the carriage stops and its lamps settle',()=>{
 for(const t of [0,800,900,1200,1400,1900,2700]){const door=carriageDoorPose(t);expect(door[1]).toEqual(carriageDoor[1]);expect(door[2]).toEqual(carriageDoor[2]);expect(door.every(p=>p.x>=0&&p.x<=600&&p.y>=0&&p.y<=500)).toBe(true);}
 expect(carriageDoorPose(900)[0]).toEqual(carriageDoor[0]);expect(carriageDoorPose(1400)[0].x).toBeGreaterThan(carriageDoor[0].x);expect(carriageDetailPose(800).x).toBe(0);expect(carriageDetailPose(2700).y).toBeCloseTo(0);expect(carriageLampAngle(2700,0)).toBeCloseTo(0);expect(carriageDetailPose(0,true)).toEqual(carriageDetailPose(4000,true));
});
test('each wax breaks before its own unroll and both connected sheets retain a physical final curl',()=>{
 expect(carriageDetailPose(1500).seals[0]!.split).toBeGreaterThan(0);expect(carriageDetailPose(1500).papers[0]).toBe(0);expect(carriageDetailPose(1700).seals[1]!.split).toBeGreaterThan(0);expect(carriageDetailPose(1700).papers[1]).toBe(0);expect(carriageDetailPose(2450).papers).toEqual([1,1]);
 for(const index of [0,1])for(const t of [0,1550,1900,2250,2500]){const vertices=new Map<string,{x:number;y:number}>();for(const s of carriagePaperStrips(t,index))s.source.forEach((p,i)=>{const key=p.x+','+p.y,target=s.target[i]!;if(vertices.has(key))expect(target).toEqual(vertices.get(key));else vertices.set(key,target);expect(target.x>=0&&target.x<=600&&target.y>=0&&target.y<=500).toBe(true);});}
 const tail=parchmentPoint({x:110,y:310},{x:0,y:0,width:220,height:310},1);expect(tail.y).toBeLessThan(300);expect(carriagePaperStrips(2500,0).some(s=>s.back)).toBe(true);
});
test('the carriage uses separate real wheels and scrolls without outside-player truth or legacy flat paper',()=>{
 const markup=renderToStaticMarkup(<LayeredSceneArt role="baron" kind="IDENTITY" elapsedMs={1900}/>);expect(markup.match(/data-carriage-wheel=/g)).toHaveLength(3);expect(markup.match(/data-baron-contract=/g)).toHaveLength(2);expect(markup).not.toContain('data-projection');expect(markup).not.toContain('book-paper.webp');expect(markup).not.toContain('/v3/baron.webp');
 const failed=renderToStaticMarkup(<LayeredSceneArt role="baron" kind="IDENTITY" elapsedMs={1900} readyAssets={new Set(['/art/effects/v8/carriage-base.webp'])}/>);expect(failed).not.toContain('data-carriage-detail');
});
