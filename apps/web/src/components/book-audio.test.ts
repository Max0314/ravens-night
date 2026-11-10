// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {createBookAudio} from './book-audio.js';
afterEach(()=>vi.unstubAllGlobals());
test('muting and closing a book cancel delayed audio resume callbacks',async()=>{
  let finish!:()=>void;
  const context={state:'suspended',currentTime:0,sampleRate:48000,resume:vi.fn(()=>new Promise<void>(resolve=>{finish=()=>{context.state='running';resolve();};})),close:vi.fn(async()=>{}),createBuffer:vi.fn()};
  class Audio{constructor(){return context as unknown as Audio;}}
  vi.stubGlobal('AudioContext',Audio);
  const audio=createBookAudio();audio.turn();audio.silence();finish();await Promise.resolve();expect(context.createBuffer).not.toHaveBeenCalled();
  context.state='suspended';audio.turn();audio.dispose();finish();await Promise.resolve();expect(context.createBuffer).not.toHaveBeenCalled();expect(context.close).toHaveBeenCalledOnce();
});
