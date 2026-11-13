import {useId} from 'react';
import {demonPose,riflePose,rifleGeometry,demonGeometry} from './public-motion.js';
import {smooth} from './cinematic-timing.js';
import './cinematic-public.css';

const v4='/art/effects/v4/';
/** All of the gun, flash and smoke share the same physical muzzle and viewBox. */
export function HuntingRifleScene({elapsedMs,fireAt,reduced=false}:{elapsedMs:number;fireAt:number;reduced?:boolean}){
 const p=riflePose(elapsedMs,fireAt,reduced),g=rifleGeometry;
 return <svg className="cinematic-rifle" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-fire-at={fireAt}>
  <g opacity={p.opacity} transform={`translate(${p.x} ${p.y}) rotate(${p.angle} ${g.pivot.x} ${g.pivot.y})`}>
   <image href={'/art/effects/v6/birdhead-shotgun.webp'} {...g.image} preserveAspectRatio="xMidYMid meet"/>
   {p.flash>0?<g transform={`translate(${g.muzzle.x} ${g.muzzle.y})`} opacity={p.flash} data-testid="muzzle-flash"><path d="M-7-7L22-16L14-5L68-4L31 2L52 15L18 9L24 25L1 10L-10 7Z" fill="#ffd079"/><path d="M-8-3L35-6L21 1L45 7L8 6L-7 4Z" fill="#fffbea"/><ellipse cx="5" cy="0" rx="18" ry="12" fill="#fff0b9" opacity=".55"/></g>:null}
  </g>
  {p.smoke>0?[0,1,2].map(i=><image key={i} href="/art/effects/v3/glass-cloud.webp" x={p.smokeOrigin.x-35-i*9-p.smokeAge*.008} y={p.smokeOrigin.y-35-p.smokeAge*(.028+i*.009)} width={65+p.smokeAge*.025+i*10} height={50+p.smokeAge*.03+i*10} opacity={p.smoke*(.2-i*.04)} preserveAspectRatio="xMidYMid meet"/>):null}
 </svg>;
}

/** Independent wing hinges; the body is never scaled horizontally. */
export function DemonLayers({elapsedMs=0,reduced=false,defeated=false}:{elapsedMs?:number;reduced?:boolean;defeated?:boolean}){
 const p=demonPose(elapsedMs,defeated,reduced),id=useId().replace(/:/g,''),ash=defeated?(reduced?1:smooth(elapsedMs,450,1700)):0;
 const hinge=(side:'left'|'right')=>{const {x,y}=demonGeometry.hinges[side],a=side==='left'?p.leftAngle:p.rightAngle;return `translate(${x} ${y}) rotate(${a}) scale(${p.wingScale} 1) translate(${-x} ${-y})`;};
 return <svg className="cinematic-demon" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-defeated={defeated}>
  {defeated?<defs><mask id={`wither-${id}`}><rect width="600" height="500" fill="white"/>{[0,1,2,3,4,5].map(i=><ellipse key={i} cx={i<3?36+i*53:440+(i-3)*48} cy={80+(i%3)*95} rx={ash*(25+i%3*8)} ry={ash*(40+i%2*13)} fill="black"/>)}</mask></defs>:null}
  <g transform={`translate(0 ${p.bodyY})`} opacity={p.bodyOpacity}>
   <g transform={hinge('left')} mask={defeated?`url(#wither-${id})`:undefined} data-wing="left"><image href={`${v4}demon-wing-left.webp`} {...demonGeometry.left} preserveAspectRatio="xMidYMid meet"/></g>
   <g transform={hinge('right')} mask={defeated?`url(#wither-${id})`:undefined} data-wing="right"><image href={`${v4}demon-wing-right.webp`} {...demonGeometry.right} preserveAspectRatio="xMidYMid meet"/></g>
   <image data-demon-body="true" href={`${v4}demon-body.webp`} {...demonGeometry.body} preserveAspectRatio="xMidYMid meet"/>
  </g>
  {defeated&&!reduced?Array.from({length:16},(_,i)=>{const age=Math.max(0,elapsedMs-350-i*24),q=Math.min(1,age/2000);return <ellipse key={i} cx={70+(i*41)%460+Math.sin(i*3)*q*70} cy={130+(i*29)%240-q*110} rx={2+i%3} ry={1+i%2} fill={i%3?'#938576':'#c2a06e'} opacity={ash*(1-q)}/>;}):null}
 </svg>;
}

