import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import {experienceTiming} from '@ravens/contracts';
import {AtmosphericSky} from './AtmosphericSky.js';
import {dawnArrivalPose} from './dawn-arrival-motion.js';

const duration=experienceTiming('DAWN',4).duration;
test('dawn clears its night fog and gradually extinguishes city windows as the original plate warms',()=>{
 const first=dawnArrivalPose(0,duration),middle=dawnArrivalPose(duration/2,duration),end=dawnArrivalPose(duration,duration);expect(first.warm).toBe(0);expect(first.fog).toBe(1);expect(first.windowsOff.every(v=>v===0)).toBe(true);expect(middle.warm).toBeGreaterThan(0);expect(middle.warm).toBeLessThan(1);expect(middle.fog).toBeGreaterThan(0);expect(middle.fog).toBeLessThan(1);expect(middle.windowsOff.every((v,i)=>i===0||v<=middle.windowsOff[i-1]!)).toBe(true);expect(end.warm).toBe(1);expect(end.fog).toBe(0);expect(end.windowsOff.every(v=>v===1)).toBe(true);
});
test('seeking uses the same dawn pose and never creates a separate rising sun',()=>{
 const render=(elapsedMs:number)=>renderToStaticMarkup(<AtmosphericSky phase="DAWN" elapsedMs={elapsedMs} durationMs={duration}/>),first=render(0);render(3000);expect(render(0)).toBe(first);expect(first).not.toContain('atmospheric-sky__disc');expect(first).not.toContain('<circle');expect(first).toContain('/art/effects/v5/dawn-town.webp');expect(first).toContain('xMidYMin slice');
});
test('reduced dawn is the same clear morning still at every elapsed time',()=>{
 expect(dawnArrivalPose(0,duration,true)).toEqual(dawnArrivalPose(duration,duration,true));const render=(elapsedMs:number)=>renderToStaticMarkup(<AtmosphericSky phase="DAWN" elapsedMs={elapsedMs} durationMs={duration} reduced/>);expect(render(0)).toBe(render(duration));
});
