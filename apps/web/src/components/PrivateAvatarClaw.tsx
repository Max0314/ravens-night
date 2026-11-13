import {useId} from 'react';
import {cinematicTiming,unit} from './cinematic-timing.js';

/** Measured red ink, excluding the unrelated fragment in the texture's top row.
 * Both crops centre the alpha-weighted principal slash on the portrait centre. */
export const privateAvatarClawGeometry={left:{x:-31,y:192,width:500,height:300},right:{x:31,y:179,width:500,height:300}} as const;
export function PrivateAvatarClaw({side,elapsedMs=Infinity,reduced=false}:{side:'left'|'right';elapsedMs?:number;reduced?:boolean}){
 const id=useId().replace(/:/g,''),crop=privateAvatarClawGeometry[side],progress=reduced?1:unit((elapsedMs-cinematicTiming.demon[side==='left'?'avatarLeft':'avatarRight'])/300);
 return <svg xmlns="http://www.w3.org/2000/svg" className={`private-avatar-claw premium-claw premium-claw--avatar-${side}`} viewBox="0 0 100 100" aria-hidden="true">
  <defs><clipPath id={`${id}-stroke`}><rect x={side==='left'?0:100*(1-progress)} y={0} width={100*progress} height={100}/></clipPath><clipPath id={`${id}-ink`}><rect {...crop}/></clipPath></defs>
  <g clipPath={`url(#${id}-stroke)`}><svg width={100} height={100} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} preserveAspectRatio="xMidYMid meet" overflow="hidden"><g clipPath={`url(#${id}-ink)`}><image href={`/art/effects/v3/claw-avatar-${side}.webp`} width={512} height={512}/></g></svg></g>
 </svg>;
}
