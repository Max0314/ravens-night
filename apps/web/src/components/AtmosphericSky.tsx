import {useId} from 'react';
import {smooth} from './cinematic-timing.js';
import './cinematic-public.css';

/** Celestial objects fit the viewport independently of the cropped town plate. */
export function AtmosphericSky({phase,elapsedMs,durationMs,reduced=false}:{phase:'NIGHT_FALLS'|'DAWN';elapsedMs:number;durationMs:number;reduced?:boolean}){
 const p=reduced?1:smooth(elapsedMs,0,Math.max(1,durationMs*.85)),id=useId().replace(/:/g,'');
 return <div className={`atmospheric-sky atmospheric-sky--${phase.toLowerCase()}`} aria-hidden="true" data-rise={p}>
  <svg className="atmospheric-sky__disc" viewBox="0 0 100 100" style={{top:`${62-37*p}%`,opacity:.35+.65*p}}>
   <defs><radialGradient id={`${id}-sun`}><stop stopColor="#fff7ce"/><stop offset=".7" stopColor="#ffdc80"/><stop offset="1" stopColor="#e4a348"/></radialGradient><radialGradient id={`${id}-glow`}><stop stopColor={phase==='DAWN'?'#f7c56b':'#bbd1de'} stopOpacity=".24"/><stop offset="1" stopColor="#ccd7db" stopOpacity="0"/></radialGradient></defs>
   <circle cx="50" cy="50" r="49" fill={`url(#${id}-glow)`}/>{phase==='DAWN'?<circle cx="50" cy="50" r="24" fill={`url(#${id}-sun)`}/>:<image href="/art/effects/v5/moon.webp" x="26" y="26" width="48" height="48"/>}
  </svg>
 </div>;
}
