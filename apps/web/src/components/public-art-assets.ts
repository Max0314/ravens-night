import type {ExperienceEvent,ExperienceKind} from '@ravens/contracts';
import {prewarmImages} from './image-prewarm.js';

const art=(version:number,...names:string[])=>names.map(name=>`/art/effects/v${version}/${name}.webp`);
const blood=art(3,'blood-burst','blood-left','blood-right','blood-stain');
const demon=art(4,'demon-body','demon-wing-left','demon-wing-right');
/** Load both possible public outcomes, even when callers already know one, so requests reveal no hidden outcome. */
export function publicArtUrls(kind:ExperienceKind,_outcome?:ExperienceEvent['outcome']):string[]{
 switch(kind){
  case'DAWN':return [...art(5,'dawn-town'),...art(9,'dawn-window-glass','dawn-mist'),...art(3,'claw-dawn','blood-stain')];
  case'NIGHT_FALLS':return art(5,'night-town');
  case'SHOT':return [...art(6,'birdhead-shotgun'),...art(3,'glass-cloud','glass-hole','glass-splinters','glass-shard'),...blood];
  case'EXECUTION':return [...art(6,'guillotine-frame','guillotine-blade'),...blood];
  case'GAME_OVER':return [...art(5,'dawn-town','burning-town','fire-bed'),...art(4,'poison-mist'),...demon,...art(3,'mayor','saint','scene-dawn')];
  case'NOMINATION':return art(3,'sealed-letter');
  default:return [];
 }
}
/** Fire-and-forget at public queue receipt/current-next phase changes; never await the shared event clock. */
export const prewarmPublicArt=(kind:ExperienceKind,outcome?:ExperienceEvent['outcome'])=>prewarmImages(publicArtUrls(kind,outcome));
