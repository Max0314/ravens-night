// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {createBookAudio} from './book-audio.js';
const shared=vi.hoisted(()=>({playSemantic:vi.fn(),cancelSemantic:vi.fn()}));
vi.mock('./experience-audio.js',()=>shared);
afterEach(()=>vi.clearAllMocks());
test('book uses shared semantic samples and rotates variants without a second audio context',()=>{
  const audio=createBookAudio();for(let i=0;i<5;i++)audio.turn();audio.lift();
  expect(shared.playSemantic.mock.calls.slice(0,5).map(call=>call[1].variant)).toEqual([0,1,2,3,0]);
  expect(shared.playSemantic).toHaveBeenLastCalledWith('paper-lift',{scope:'book',variant:1});
  audio.silence();expect(shared.cancelSemantic).toHaveBeenCalledWith('book');
  audio.dispose();audio.turn();audio.lift();expect(shared.playSemantic).toHaveBeenCalledTimes(6);
});
