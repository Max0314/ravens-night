import {playSemantic,prepareBookAudio,releaseBookAudio} from './experience-audio.js';

/** Local paper-sound permission shares the output bus, never enables game/private effects. */
export function createBookAudio(){
  let disposed=false,sequence=0,generation=0;const owner={};
  return {
    /** Call synchronously on pointer/click/key or explicit sound enable, before async texture work. */
    prepare(feedback=false){if(disposed)return Promise.resolve(false);const request=++generation;return prepareBookAudio(owner).then(ready=>{if(disposed||request!==generation)return false;if(ready&&feedback)playSemantic('paper-turn',{scope:'book',variant:sequence++%4});return ready;});},
    turn(){if(!disposed)playSemantic('paper-turn',{scope:'book',variant:sequence++%4});},
    lift(){if(!disposed)playSemantic('paper-lift',{scope:'book',variant:sequence%2});},
    silence(){generation++;releaseBookAudio(owner);},
    dispose(){disposed=true;generation++;releaseBookAudio(owner);},
  };
}
