import {cancelSemantic,playSemantic} from './experience-audio.js';

/** Real paper samples use the shared master bus; this adapter never creates an AudioContext. */
export function createBookAudio(){
  let disposed=false,sequence=0;
  return {
    turn(){if(!disposed)playSemantic('paper-turn',{scope:'book',variant:sequence++%4});},
    lift(){if(!disposed)playSemantic('paper-lift',{scope:'book',variant:sequence%2});},
    silence(){cancelSemantic('book');},
    dispose(){disposed=true;cancelSemantic('book');},
  };
}
