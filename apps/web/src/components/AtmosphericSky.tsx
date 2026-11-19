import {useId} from 'react';
import {smooth} from './cinematic-timing.js';
import {DawnSkyArt} from './DawnSkyArt.js';
import {nightWindowAtlas,nightWindowGrid,nightWindowRegions} from './night-arrival-motion.js';
import './cinematic-public.css';
import './night-arrival.css';
import './dawn-arrival.css';

/** Both phases keep their existing town plates; arrival is sampled from the public clock. */
export function AtmosphericSky({phase,elapsedMs,durationMs,reduced=false}:{phase:'NIGHT_FALLS'|'DAWN';elapsedMs:number;durationMs:number;reduced?:boolean}){
 const id=useId().replace(/:/g,'');
 if(phase==='NIGHT_FALLS'){
  const dusk=reduced?1:smooth(elapsedMs,0,durationMs*.72),mist=reduced?1:smooth(elapsedMs,durationMs*.24,durationMs*.9);
  return <div className="atmospheric-sky atmospheric-sky--night_falls night-arrival" aria-hidden="true" data-dusk={dusk}>
   <svg className="night-arrival__plate" viewBox="0 0 688 1024" preserveAspectRatio="xMidYMin slice">
    <defs>
     <linearGradient id={`${id}-dusk`} x2="0" y2="1"><stop stopColor="#010714" stopOpacity=".6"/><stop offset=".48" stopColor="#0c1625" stopOpacity=".18"/><stop offset="1" stopColor="#010714" stopOpacity="0"/></linearGradient>
     <image id={`${id}-lamps`} href={nightWindowAtlas} width={nightWindowGrid.width} height={nightWindowGrid.height}/>
    </defs>
    {nightWindowRegions.map(({x,y,width,height,on,rise},index)=>{
      const light=reduced?1:smooth(elapsedMs,durationMs*on,durationMs*(on+rise));
      const tileX=index%nightWindowGrid.columns*nightWindowGrid.tileWidth+1;
      const tileY=Math.floor(index/nightWindowGrid.columns)*nightWindowGrid.tileHeight+1;
      return <svg key={index} className="night-arrival__window" data-window={index} data-light={light}
        x={x} y={y} width={width} height={height} viewBox={`${tileX} ${tileY} ${width} ${height}`} overflow="hidden">
        <use className="night-arrival__window-dark" href={`#${id}-lamps`} opacity={1-light}/>
      </svg>;
    })}
    <rect width="688" height="1024" fill="#a6afbc" opacity={.085*(1-dusk)}/>
    <rect className="night-arrival__dusk" width="688" height="1024" fill={`url(#${id}-dusk)`} opacity={dusk}/>
   </svg>
   <div className="night-arrival__mist" style={{opacity:.2*mist,transform:`translateX(${reduced?0:-2+4*mist}%)`}}/>
  </div>;
 }
 return <div className="atmospheric-sky atmospheric-sky--dawn dawn-arrival" aria-hidden="true"><DawnSkyArt elapsedMs={elapsedMs} durationMs={durationMs} reduced={reduced}/></div>;
}
