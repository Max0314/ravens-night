import {useId} from 'react';
import {smooth} from './cinematic-timing.js';
import './cinematic-public.css';
import './night-arrival.css';

const nightWindows=[{x:127,y:329,width:4,height:9},{x:174,y:350,width:6,height:8},{x:212,y:327,width:6,height:10},{x:294,y:334,width:5,height:10},{x:486,y:368,width:7,height:11},{x:575,y:389,width:5,height:10},{x:624,y:251,width:4,height:8}] as const;

/** Dawn keeps its independent sun; night lights track the existing plate's cover crop. */
export function AtmosphericSky({phase,elapsedMs,durationMs,reduced=false}:{phase:'NIGHT_FALLS'|'DAWN';elapsedMs:number;durationMs:number;reduced?:boolean}){
 const p=reduced?1:smooth(elapsedMs,0,Math.max(1,durationMs*.85)),id=useId().replace(/:/g,'');
 if(phase==='NIGHT_FALLS'){
  const dusk=reduced?1:smooth(elapsedMs,0,durationMs*.72),mist=reduced?1:smooth(elapsedMs,durationMs*.24,durationMs*.9);
  return <div className="atmospheric-sky atmospheric-sky--night_falls night-arrival" aria-hidden="true" data-dusk={dusk}>
   <svg className="night-arrival__plate" viewBox="0 0 688 1024" preserveAspectRatio="xMidYMin slice">
    <defs><linearGradient id={`${id}-dusk`} x2="0" y2="1"><stop stopColor="#010714" stopOpacity=".7"/><stop offset=".5" stopColor="#010714" stopOpacity=".12"/><stop offset="1" stopColor="#010714" stopOpacity="0"/></linearGradient><filter id={`${id}-window-glow`} x="-250%" y="-150%" width="600%" height="400%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
    <rect width="688" height="1024" fill="#9cafc2" opacity={.12*(1-dusk)}/><rect className="night-arrival__dusk" width="688" height="1024" fill={`url(#${id}-dusk)`} opacity={dusk}/>
    {nightWindows.map((window,index)=>{const light=reduced?1:smooth(elapsedMs,durationMs*(.12+index*.075),durationMs*(.24+index*.075));return <g key={index} className="night-arrival__window" data-window={index} data-light={light}><rect className="night-arrival__window-dark" {...window} fill="#09111a" opacity={.9*(1-light)}/><g opacity={light}><rect {...window} fill="#dfad55" opacity=".55" filter={`url(#${id}-window-glow)`}/><rect {...window} rx=".5" fill="#f5cb75" opacity=".8"/><path d={`M${window.x+window.width/2} ${window.y}v${window.height}`} stroke="#403723" strokeWidth="1"/></g></g>;})}
   </svg>
   <div className="night-arrival__mist" style={{opacity:.2*mist,transform:`translateX(${reduced?0:-2+4*mist}%)`}}/>
  </div>;
 }
 return <div className={`atmospheric-sky atmospheric-sky--${phase.toLowerCase()}`} aria-hidden="true" data-rise={p}>
  <svg className="atmospheric-sky__disc" viewBox="0 0 100 100" style={{top:`${62-37*p}%`,opacity:.35+.65*p}}>
   <defs><radialGradient id={`${id}-sun`}><stop stopColor="#fff7ce"/><stop offset=".7" stopColor="#ffdc80"/><stop offset="1" stopColor="#e4a348"/></radialGradient><radialGradient id={`${id}-glow`}><stop stopColor="#f7c56b" stopOpacity=".24"/><stop offset="1" stopColor="#ccd7db" stopOpacity="0"/></radialGradient></defs>
   <circle cx="50" cy="50" r="49" fill={`url(#${id}-glow)`}/><circle cx="50" cy="50" r="24" fill={`url(#${id}-sun)`}/>
  </svg>
 </div>;
}
