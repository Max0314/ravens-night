// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {createBookAudio} from './book-audio.js';
const shared=vi.hoisted(()=>({playSemantic:vi.fn(),cancelSemantic:vi.fn(),prepareBookAudio:vi.fn(async()=>true),releaseBookAudio:vi.fn()}));
vi.mock('./experience-audio.js',()=>shared);
afterEach(()=>vi.clearAllMocks());
test('book uses shared semantic samples and rotates variants without a second audio context',()=>{
  const audio=createBookAudio();for(let i=0;i<5;i++)audio.turn();audio.lift();
  expect(shared.playSemantic.mock.calls.slice(0,5).map(call=>call[1].variant)).toEqual([0,1,2,3,0]);
  expect(shared.playSemantic).toHaveBeenLastCalledWith('paper-lift',{scope:'book',variant:1});
  audio.silence();expect(shared.releaseBookAudio).toHaveBeenCalledOnce();
  audio.dispose();audio.turn();audio.lift();expect(shared.playSemantic).toHaveBeenCalledTimes(6);
});


test('prepare unlocks synchronously and explicit enable gives paper feedback only when ready',async()=>{
 const audio=createBookAudio();const ready=audio.prepare(true);expect(shared.prepareBookAudio).toHaveBeenCalledOnce();expect(shared.playSemantic).not.toHaveBeenCalled();expect(await ready).toBe(true);expect(shared.playSemantic).toHaveBeenCalledWith('paper-lift',{scope:'book',variant:0});audio.dispose();
});
test('mute and dispose cancel delayed enable feedback, and a failed unlock never reports success',async()=>{
 let finish:(value:boolean)=>void=()=>{};shared.prepareBookAudio.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;}));const audio=createBookAudio(),ready=audio.prepare(true);audio.silence();finish(true);expect(await ready).toBe(false);expect(shared.playSemantic).not.toHaveBeenCalled();
 shared.prepareBookAudio.mockResolvedValueOnce(false);expect(await audio.prepare(true)).toBe(false);expect(shared.playSemantic).not.toHaveBeenCalled();audio.dispose();expect(await audio.prepare(true)).toBe(false);
});
