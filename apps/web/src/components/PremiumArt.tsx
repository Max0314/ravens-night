import {cinematicTiming} from './cinematic-timing.js';
import type {CSSProperties} from 'react';
import type {PrivateSceneDescriptor} from '@ravens/contracts';
import './premium-art.css';

export const premiumArtRoot='/art/effects/v3/';
export const propRoles=['washerwoman','librarian','investigator','chef','empath','fortune_teller','undertaker','monk','ravenkeeper','virgin','slayer','soldier','mayor','drunk','recluse','saint','poisoner','spy','scarlet_woman','baron'] as const;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function ArtImage({name,className='',style}:{name:string;className?:string;style?:CSSProperties}){return <img className={`premium-image ${className}`} src={`${premiumArtRoot}${name}.webp`} alt="" draggable={false} style={style}/>;}

export {preparePrivateArt,privateArtUrls as privateArtFiles} from './private-art-assets.js';
export type {PreparedPrivateArt} from './private-art-assets.js';

export function ClawDecal({variant='dawn',style,className=''}:{variant?:'screen-left'|'screen-right'|'avatar-left'|'avatar-right'|'dawn'|'town';style?:CSSProperties;className?:string}){return <ArtImage name={`claw-${variant}`} className={`premium-claw premium-claw--${variant} ${className}`} {...(style?{style}:{})}/>;}
export function DemonSlashes({elapsedMs,reduced=false}:{elapsedMs:number;reduced?:boolean}){
 if(reduced)return null;
 return <div className="premium-demon-slashes" aria-hidden="true">{(['left','right'] as const).map((side,i)=>{const dt=elapsedMs-cinematicTiming.demon[side],p=clamp(dt/160),fade=dt<600?1:Math.max(0,1-(dt-600)/850);return dt<0?null:<ClawDecal key={side} variant={`screen-${side}`} style={{opacity:fade,clipPath:`inset(0 ${side==='left'?(1-p)*100:0}% 0 ${side==='right'?(1-p)*100:0}%)`,transform:`translateX(${(1-p)*(i?20:-20)}px)`}}/>;})}</div>;
}
export function PoisonVapour({elapsedMs,compact=false,reduced=false}:{elapsedMs:number;compact?:boolean;reduced?:boolean}){
 const t=elapsedMs-900;if(t<0)return null;const fade=Math.min(1,t/250)*Math.max(0,1-Math.max(0,t-1900)/1000);
 return <div className={`premium-poison-vapour${compact?' is-compact':''}${reduced?' is-reduced':''}`} aria-hidden="true" style={{opacity:fade}}><ArtImage name="poison-cloud" className="poison-cloud" style={{transform:`translateY(${-Math.min(35,t/65)}px) scale(${.8+Math.min(.4,t/5000)})`}}/><ArtImage name="poison-wisp" className="poison-wisp" style={{transform:`translateY(${-Math.min(60,t/40)}px) rotate(${Math.sin(t/700)*6}deg)`}}/>{!compact?<ArtImage name="poison-stain" className="poison-edge"/>:null}{!reduced&&Array.from({length:compact?4:10},(_,i)=>{const p=((t+i*117)%1600)/1600;return <ArtImage key={i} name={p>.82?'bubble-burst':i%3===0?'bubble-cluster':'bubble-single'} className="premium-bubble" style={{width:18+i%4*12,left:`${9+i*37%82}%`,bottom:`${p*70}%`,opacity:Math.sin(p*Math.PI)*.8,transform:`translateX(${Math.sin(p*7+i)*9}px) scale(${.6+p*.5})`}}/>;})}</div>;
}
