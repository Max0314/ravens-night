import {GuideOverlay,type StartupTutorialOptions} from '../components/GuideOverlay.js';

/** The room still owns completion, multiplayer counts and retry state. */
export function Tutorial({onBack,...startup}:StartupTutorialOptions&{onBack:()=>void}){
  return <GuideOverlay mode="tutorial" onClose={onBack} startup={startup}/>;
}
