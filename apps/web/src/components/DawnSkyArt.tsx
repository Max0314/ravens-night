import {useId} from 'react';
import {dawnArrivalPose,dawnTownPlate,dawnWindowRegions} from './dawn-arrival-motion.js';

export const dawnLayerUrls={windows:'/art/effects/v9/dawn-window-glass.webp',mist:'/art/effects/v9/dawn-mist.webp'} as const;

/** Original city pixels; the approved window/glass and fog filters are baked offline. */
export function DawnSkyArt({elapsedMs,durationMs,reduced=false}:{elapsedMs:number;durationMs:number;reduced?:boolean}){
 const id=useId().replace(/:/g,''),p=dawnArrivalPose(elapsedMs,durationMs,reduced);
 return <svg className="dawn-arrival__art" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true" data-warm={p.warm} data-fog={p.fog}>
  <defs><linearGradient id={`${id}-legibility`} x2="0" y2="1"><stop stopColor="#080908" stopOpacity={17/255}/><stop offset="1" stopColor="#080908" stopOpacity={136/255}/></linearGradient></defs>
  <svg width="100%" height="100%" viewBox="0 0 688 1024" preserveAspectRatio="xMidYMin slice" data-dawn-source="v5">
   <defs>
    <linearGradient id={`${id}-warmth`} x2="0" y2="1"><stop stopColor="#efd8b9" stopOpacity={.03}/><stop offset=".27" stopColor="#ffd69b" stopOpacity={.1}/><stop offset=".52" stopColor="#f2ddba" stopOpacity={.03}/><stop offset="1" stopColor="#f2ddba" stopOpacity={0}/></linearGradient>
   </defs>
   <image href={dawnTownPlate.url} width={688} height={1024}/>
   {dawnWindowRegions.map((window,index)=><svg key={index} className="dawn-arrival__window" data-window={index} data-off={p.windowsOff[index]} opacity={p.windowsOff[index]} x={window.x} y={window.y} width={window.width} height={window.height} viewBox={`${index%5*32+1} ${Math.floor(index/5)*24+1} ${window.width} ${window.height}`} overflow="hidden"><image href={dawnLayerUrls.windows} width={160} height={72}/></svg>)}
   <rect width={688} height={1024} fill="#081321" opacity={.46*(1-p.warm)}/><rect width={688} height={1024} fill={`url(#${id}-warmth)`} opacity={p.warm}/>
   <image href={dawnLayerUrls.mist} x={-25} y={0} width={738} height={1024} opacity={p.fog*.42} data-dawn-mist="true" transform={`translate(${p.fogX} ${p.fogY})`}/>
  </svg>
  <rect width="100%" height="100%" fill={`url(#${id}-legibility)`}/>
 </svg>;
}
