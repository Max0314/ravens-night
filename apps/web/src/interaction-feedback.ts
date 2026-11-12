import {useMemo} from 'react';
import {playSemantic} from './components/experience-audio.js';
import './styles/interaction-feedback.css';

export type InteractionCue='press'|'select'|'open'|'close'|'success'|'error';
/** Call at the accepted action, never from a global click/pointer listener. */
export function interactionFeedback(cue:InteractionCue,accepted=true){if(accepted)playSemantic(cue,{scope:'ui'});}
export function useInteractionFeedback(){return useMemo(()=>({
  press:(accepted=true)=>interactionFeedback('press',accepted),select:(changed=true)=>interactionFeedback('select',changed),
  open:()=>interactionFeedback('open'),close:()=>interactionFeedback('close'),
  success:()=>interactionFeedback('success'),error:()=>interactionFeedback('error'),
}),[]);}
