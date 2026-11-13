import {useId} from 'react';
import {dawnArrivalPose,dawnTownPlate,dawnWindowRegions} from './dawn-arrival-motion.js';

/** Original city pixels, with its own cover crop; no synthetic sun or window lights. */
export function DawnSkyArt({elapsedMs,durationMs,reduced=false}:{elapsedMs:number;durationMs:number;reduced?:boolean}){
 const id=useId().replace(/:/g,''),p=dawnArrivalPose(elapsedMs,durationMs,reduced);
 return <svg className="dawn-arrival__art" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true" data-warm={p.warm} data-fog={p.fog}>
  <defs><linearGradient id={`${id}-legibility`} x2="0" y2="1"><stop stopColor="#080908" stopOpacity={17/255}/><stop offset="1" stopColor="#080908" stopOpacity={136/255}/></linearGradient></defs>
  <svg width="100%" height="100%" viewBox="0 0 688 1024" preserveAspectRatio="xMidYMin slice" data-dawn-source="v5">
   <defs>
    <image id={`${id}-town`} href={dawnTownPlate.url} width={688} height={1024}/>
    <filter id={`${id}-lit-pixels`} colorInterpolationFilters="sRGB"><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 3 1 -3 0 -1.1"/><feComponentTransfer><feFuncA type="linear" slope={20}/></feComponentTransfer></filter>
    <filter id={`${id}-unlit-glass`} colorInterpolationFilters="sRGB"><feColorMatrix type="saturate" values=".12"/><feComponentTransfer><feFuncR type="linear" slope={.22}/><feFuncG type="linear" slope={.26}/><feFuncB type="linear" slope={.3}/></feComponentTransfer></filter>
    <mask id={`${id}-lit-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={688} height={1024} style={{maskType:'alpha'}}><use href={`#${id}-town`} filter={`url(#${id}-lit-pixels)`}/></mask>
    <linearGradient id={`${id}-warmth`} x2="0" y2="1"><stop stopColor="#efd8b9" stopOpacity={.03}/><stop offset=".27" stopColor="#ffd69b" stopOpacity={.1}/><stop offset=".52" stopColor="#f2ddba" stopOpacity={.03}/><stop offset="1" stopColor="#f2ddba" stopOpacity={0}/></linearGradient>
    <linearGradient id={`${id}-fog-band`} x2="0" y2="1"><stop offset=".26" stopColor="#000"/><stop offset=".43" stopColor="#fff"/><stop offset=".82" stopColor="#fff"/><stop offset="1" stopColor="#000"/></linearGradient>
    <mask id={`${id}-fog-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={688} height={1024} style={{maskType:'luminance'}}><rect width={688} height={1024} fill={`url(#${id}-fog-band)`}/></mask>
    <filter id={`${id}-fog`} x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".006 .018" numOctaves={3} seed={29}/><feColorMatrix values="0 0 0 0 .58 0 0 0 0 .64 0 0 0 0 .66 0 0 1.25 0 -.35"/><feGaussianBlur stdDeviation={3}/></filter>
    {dawnWindowRegions.map((window,index)=><clipPath key={index} id={`${id}-window-${index}`}><rect x={window.x} y={window.y} width={window.width} height={window.height}/></clipPath>)}
   </defs>
   <use href={`#${id}-town`}/>
   <g mask={`url(#${id}-lit-mask)`}>{dawnWindowRegions.map((_,index)=><g key={index} className="dawn-arrival__window" data-window={index} data-off={p.windowsOff[index]} opacity={p.windowsOff[index]} clipPath={`url(#${id}-window-${index})`}><use href={`#${id}-town`} filter={`url(#${id}-unlit-glass)`}/></g>)}</g>
   <rect width={688} height={1024} fill="#081321" opacity={.46*(1-p.warm)}/><rect width={688} height={1024} fill={`url(#${id}-warmth)`} opacity={p.warm}/>
   <g mask={`url(#${id}-fog-mask)`} opacity={p.fog*.42} data-dawn-mist="true"><rect x={-25} y={0} width={738} height={1024} filter={`url(#${id}-fog)`} transform={`translate(${p.fogX} ${p.fogY})`}/></g>
  </svg>
  <rect width="100%" height="100%" fill={`url(#${id}-legibility)`}/>
 </svg>;
}
