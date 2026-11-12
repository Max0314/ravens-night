// @vitest-environment jsdom
import {expect,test,vi} from 'vitest';
import {interactionFeedback} from './interaction-feedback.js';
const shared=vi.hoisted(()=>({playSemantic:vi.fn()}));
vi.mock('./components/experience-audio.js',()=>shared);
test('feedback is explicit and does not sound disabled or unchanged actions',()=>{
  interactionFeedback('press',false);interactionFeedback('select',false);expect(shared.playSemantic).not.toHaveBeenCalled();
  interactionFeedback('open');expect(shared.playSemantic).toHaveBeenCalledOnce();expect(shared.playSemantic).toHaveBeenCalledWith('open',{scope:'ui'});
});
