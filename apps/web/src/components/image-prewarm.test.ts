import {afterEach,expect,test,vi} from 'vitest';
import {ImagePrewarmCache,imagePrewarmLimits} from './image-prewarm.js';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function images(){const pending:FakeImage[]=[];class FakeImage{src='';complete=false;naturalWidth=600;naturalHeight=500;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;decode=()=>new Promise<void>(()=>{});constructor(){pending.push(this);}}vi.stubGlobal('Image',FakeImage);return pending;}
test('deduplicates concurrent callers, limits parallel image work and reports each ready layer before the last one',async()=>{
 const pending=images(),cache=new ImagePrewarmCache(),updates:string[][]=[];const first=cache.prepare(['a','b','c','d','e'],r=>updates.push(r.ready)),duplicate=cache.prepare(['a']);expect(pending).toHaveLength(4);
 pending[0]!.onload!();await Promise.resolve();expect(pending).toHaveLength(5);expect(updates).toContainEqual(['a']);expect(await duplicate).toEqual({ready:['a'],failed:[],timedOut:[]});for(const image of pending.slice(1))image.onload!();expect((await first).ready).toHaveLength(5);expect(cache.ready(['a','b','e']).size).toBe(3);
});
test('bad pixels fail despite decode and timeout failures may retry, without reviving an old preparation',async()=>{
 vi.useFakeTimers();const pending=images(),cache=new ImagePrewarmCache(),bad=cache.prepare(['bad']);pending[0]!.naturalWidth=0;pending[0]!.onload!();expect((await bad).failed).toEqual(['bad']);
 const first=cache.prepare(['slow']),late=pending[1]!.onload!;await vi.advanceTimersByTimeAsync(imagePrewarmLimits.timeoutMs);expect((await first).timedOut).toEqual(['slow']);const retry=cache.prepare(['slow']);late();expect(cache.ready(['slow']).size).toBe(0);pending[2]!.onload!();expect((await retry).ready).toEqual(['slow']);
});
test('LRU retention is bounded by decoded bytes and entry count, and excess queued URLs do not grow the cache',async()=>{
 const pending=images(),cache=new ImagePrewarmCache();for(let i=0;i<3;i++){const ready=cache.prepare([`large-${i}`]);pending.at(-1)!.naturalWidth=2048;pending.at(-1)!.naturalHeight=2048;pending.at(-1)!.onload!();await ready;}expect(cache.ready(['large-0','large-1','large-2'])).toEqual(new Set(['large-1','large-2']));
 const urls=Array.from({length:52},(_,i)=>`tiny-${i}`),request=cache.prepare(urls);for(let i=3;i<pending.length;i++){pending[i]!.naturalWidth=1;pending[i]!.naturalHeight=1;pending[i]!.onload!();}const result=await request;expect(result.ready).toHaveLength(48);expect(result.timedOut).toHaveLength(4);expect(cache.ready(urls).size).toBe(48);
});
