import {ArtImage} from './PremiumArt.js';
import {useEffect,useId,useMemo,useRef,type ReactNode,type CSSProperties} from 'react';
import {guillotinePose,guillotineGeometry as executionGeometry} from './public-motion.js';
import '../styles/sharp-effects.css';
function random(seed:string){let n=[...seed].reduce((a,c)=>(Math.imul(a,31)+c.charCodeAt(0))>>>0,2166136261);return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
export function fractureGeometry(seed:string){const r=random(seed),x=650+(r()-.5)*48,y=520+(r()-.5)*48;const paths:string[]=[];let angle=r()*30;for(let i=0;i<11;i++){angle+=20+r()*24;const a=angle*Math.PI/180;let d=`M${x} ${y}`,px=x,py=y;for(let j=1;j<=4;j++){const len=j*(75+r()*75),bend=(r()-.5)*.32;px=x+Math.cos(a+bend)*len;py=y+Math.sin(a+bend)*len;d+=`L${px.toFixed(1)} ${py.toFixed(1)}`;if(j===2)paths.push(`M${px} ${py}l${Math.cos(a+.6)*90} ${Math.sin(a+.6)*90}l${Math.cos(a+.9)*115} ${Math.sin(a+.9)*115}`);}paths.push(d);}return{x,y,paths,shards:Array.from({length:32},()=>({angle:r()*360,distance:110+r()*390,size:7+r()*24,spin:(r()-.5)*650,shape:`${r()*20}% 0%,100% ${r()*45}%,${20+r()*60}% 100%,0% ${35+r()*40}%`}))};}
export function FractureLayer({seed,elapsedMs,impactAt=850,reduced=false}:{seed:string;elapsedMs:number;impactAt?:number;reduced?:boolean}){
 const g=useMemo(()=>fractureGeometry(seed),[seed]),id=useId().replace(/:/g,'');const t=elapsedMs-impactAt;
 if(t<0||t>2200)return null;const progress=Math.min(1,t/90),fade=t<900?1:Math.max(0,1-(t-900)/1300);
 return <div className="fracture-v4" aria-hidden="true" style={{opacity:fade}}><svg viewBox="0 0 1000 1000" preserveAspectRatio="none"><defs><radialGradient id={id}><stop stopColor="#020508"/><stop offset=".55" stopColor="#000"/><stop offset=".75" stopColor="#ccd6d7"/><stop offset="1" stopColor="#56657500"/></radialGradient></defs>{g.paths.map((d,i)=><path key={i} d={d} pathLength={1} strokeDasharray="1" strokeDashoffset={1-progress} opacity={.35+(i%4)*.13}/>)}<circle cx={g.x} cy={g.y} r="28" fill={`url(#${id})`} stroke="none"/></svg><ArtImage name="glass-hole" className="glass-hole-art" style={{left:`${g.x/10}%`,top:`${g.y/10}%`}}/><ArtImage name="glass-cloud" className="glass-cloud-art" style={{left:`${g.x/10}%`,top:`${g.y/10}%`,opacity:reduced?0:Math.max(0,1-t/400),transform:`translate(-50%,-50%) scale(${.5+Math.min(1,t/220)})`}}/><div className="fracture-v4__flash" style={{opacity:t<65?.45*(1-t/65):0}}/>{!reduced&&g.shards.map((s,i)=>{const k=Math.max(0,Math.min(1,(t-i*3)/1300)),a=s.angle*Math.PI/180;return <i key={i} style={{width:s.size,height:s.size,clipPath:`polygon(${s.shape})`,backgroundImage:`url('/art/effects/v3/${i%4===0?'glass-splinters':'glass-shard'}.webp')`,left:`${g.x/10}%`,top:`${g.y/10}%`,transform:`translate(${Math.cos(a)*s.distance*k}px,${Math.sin(a)*s.distance*k+170*k*k}px) rotate(${s.spin*k}deg)`,opacity:Math.max(0,1-k)} as CSSProperties}/>})}</div>;
}
export function GuillotineMechanism({elapsedMs,resultAt,empty,reduced=false}:{elapsedMs:number;resultAt:number;empty:boolean;reduced?:boolean}){
 const p=guillotinePose(elapsedMs,resultAt,empty,reduced);
 return <svg viewBox="0 0 480 480" className="guillotine-mechanism" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <image className="guillotine-blade" href="/art/effects/v6/guillotine-blade.webp" x={executionGeometry.blade.x} y={executionGeometry.blade.y+executionGeometry.blade.travel*p.drop} width={executionGeometry.blade.width} height={executionGeometry.blade.height} preserveAspectRatio="xMidYMid meet" data-drop={p.drop}/>
  <image href="/art/effects/v6/guillotine-frame.webp" {...executionGeometry.frame} preserveAspectRatio="xMidYMid meet"/>
  {empty&&!reduced?<g fill="none" stroke="#bead8370" strokeWidth=".8" transform={`translate(${p.wind} 0)`}><path d="M-30 300Q130 268 260 295T510 282"/><path d="M-25 332Q130 312 280 335T500 322"/>{[0,1,2].map(i=><ellipse key={i} cx={10+(elapsedMs/12+i*137)%460} cy={350+Math.sin(elapsedMs/360+i)*12} rx="5" ry="1.5" fill="#a58e5b65"/>)}</g>:null}
  {p.dust>0?<g opacity={p.dust} fill="#b59c71">{Array.from({length:10},(_,i)=>{const age=Math.max(0,elapsedMs-resultAt)/650;return <ellipse key={i} cx={executionGeometry.neck.x+(i-5)*4+Math.sin(i*7)*age*23} cy={executionGeometry.neck.y-age*(14+i%4*6)+age*age*40} rx={1+i%2} ry="1"/>;})}</g>:null}
 </svg>;
}
export function GuillotineScene({elapsedMs,resultAt,death,empty,children,blood,reduced=false,resultVisible=false}:{elapsedMs:number;resultAt:number;death:boolean;empty:boolean;children?:ReactNode;blood?:ReactNode;reduced?:boolean;resultVisible?:boolean}){
 const p=guillotinePose(elapsedMs,resultAt,empty,reduced);
 return <div className={`guillotine-scene${empty?' is-empty':''}${death?' has-death':''}`} style={{transform:`translateX(${p.shake}px)`,'--neck-left':`${executionGeometry.neck.x/4.8}%`,'--neck-top':`${(executionGeometry.neck.y-executionGeometry.neck.diameter/2)/4.8}%`,'--neck-center':`${executionGeometry.neck.y/4.8}%`,'--neck-size':`${executionGeometry.neck.diameter/4.8}%`} as CSSProperties} data-testid="guillotine-scene"><div className="guillotine-scene__canvas"><GuillotineMechanism elapsedMs={elapsedMs} resultAt={resultAt} empty={empty} reduced={reduced}/>{!empty?<div className="guillotine-scene__person">{children}</div>:resultVisible?<span className="guillotine-scene__empty-label">无人被处决</span>:null}{!empty&&death&&blood?<div className="guillotine-scene__blood">{blood}</div>:null}</div></div>;
}

/** Result-relative particles, so a late public result never restarts a death. */
export function ResultBlood({elapsedMs,resultAt,variant='burst',reduced=false}:{elapsedMs:number;resultAt:number;variant?:'left'|'right'|'burst'|'stain';reduced?:boolean}){
 const t=elapsedMs-resultAt;if(t<0||t>1600)return null;const p=Math.min(1,t/350),fade=t<650?1:Math.max(0,1-(t-650)/950);
 return <svg className={`result-blood result-blood--${variant}`} viewBox="-100 -80 200 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{opacity:fade,transform:'translate(-50%,-50%)',overflow:'visible'}}><image href={`/art/effects/v3/blood-${variant}.webp`} x="-100" y="-66.7" width="200" height="133.4" preserveAspectRatio="xMidYMid meet" transform={`scale(${reduced?.8:.2+Math.min(1,t/130)*.9})`}/>{!reduced&&variant!=='stain'&&Array.from({length:16},(_,i)=>{const degrees=variant==='left'?145+(i*31)%70:variant==='right'?-35+(i*31)%70:20+(i*37)%140,a=degrees*Math.PI/180,d=(30+i*7%95)*p;return <ellipse data-blood-particle="true" key={i} rx={2+i%4} ry={1.5+i%3} fill={i%3?'#a41b20':'#d43b2d'} transform={`translate(${Math.cos(a)*d} ${Math.sin(a)*d+35*p*p}) rotate(${i*29})`}/>;})}</svg>;
}

const slowGames=new Set<string>();
/** Distort the actual visible DOM surface, never a screenshot or hidden private layer. */
export function GlassRefraction({seed,elapsedMs,impactAt=850,reduced=false}:{seed:string;elapsedMs:number;impactAt?:number;reduced?:boolean}){
 const svg=useRef<SVGSVGElement>(null),uid=useId().replace(/:/g,''),phase=elapsedMs-impactAt,gameKey=seed.split(':').slice(0,-1).join(':');
 const eligible=useRef({seed,allowed:!slowGames.has(gameKey)});if(eligible.current.seed!==seed)eligible.current={seed,allowed:!slowGames.has(gameKey)};
 const enabled=phase>=0&&phase<320&&!reduced&&eligible.current.allowed;
 const owner=useRef<Array<{element:HTMLElement;previous:string}>>([]);
 useEffect(()=>{if(phase<0||reduced)return;let frame=0,count=0,first=performance.now();const sample=(at:number)=>{count++;if(count===20){if((at-first)/20>25){slowGames.add(gameKey);if(slowGames.size>64)slowGames.delete(slowGames.values().next().value!);}return;}frame=requestAnimationFrame(sample);};frame=requestAnimationFrame(sample);return()=>cancelAnimationFrame(frame);},[seed,phase>=0,reduced]);
 useEffect(()=>{
  if(!enabled)return;const root=svg.current;if(!root)return;const dpr=window.devicePixelRatio||1;let budget=2_000_000;const r=random(seed);
  const surface=document.querySelector('.event-stage')??document.querySelector('.private-scene-dialog')??document.querySelector('.guide-backdrop')??document;
  const selector=surface===document?'.town-stage':'.guide-tutorial__body,.role-grid,.role-detail__portrait,.event-stage__body,.private-scene-art,.private-scene-result';
  const candidates=[...surface.querySelectorAll<HTMLElement>(selector)].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&b.right>0&&b.bottom>0&&b.left<window.innerWidth&&b.top<window.innerHeight&&!e.closest('[hidden],[inert]')&&!(e.matches('.private-scene-result')&&e.getAttribute('aria-hidden')==='true');});
  for(const [i,el]of candidates.slice(0,2).entries()){
   const rect=el.getBoundingClientRect(),w=rect.width,h=rect.height,area=Math.ceil((w+24)*dpr)*Math.ceil((h+24)*dpr);if(w>480||h>640||area>budget)continue;budget-=area;
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(w);canvas.height=Math.ceil(h);const c=canvas.getContext('2d');if(!c)continue;c.fillStyle='rgb(128,128,128)';c.fillRect(0,0,w,h);
   for(let j=0;j<14;j++){const x=r()*w,y=r()*h;c.fillStyle=`rgb(${Math.round(25+r()*205)},${Math.round(25+r()*205)},128)`;c.beginPath();c.moveTo(x,y);c.lineTo(x+35+r()*80,y-15-r()*70);c.lineTo(x+30+r()*60,y+40+r()*60);c.closePath();c.fill();}
   const ns='http://www.w3.org/2000/svg',f=document.createElementNS(ns,'filter'),image=document.createElementNS(ns,'feImage'),map=document.createElementNS(ns,'feDisplacementMap');f.id=`${uid}-${i}`;f.setAttribute('filterUnits','userSpaceOnUse');f.setAttribute('primitiveUnits','userSpaceOnUse');f.setAttribute('color-interpolation-filters','sRGB');f.setAttribute('x','-12');f.setAttribute('y','-12');f.setAttribute('width',String(w+24));f.setAttribute('height',String(h+24));image.setAttribute('href',canvas.toDataURL());image.setAttribute('width',String(w));image.setAttribute('height',String(h));image.setAttribute('preserveAspectRatio','none');image.setAttribute('result','shardMap');map.setAttribute('in','SourceGraphic');map.setAttribute('in2','shardMap');map.setAttribute('xChannelSelector','R');map.setAttribute('yChannelSelector','G');map.setAttribute('scale','18');f.append(image,map);root.append(f);owner.current.push({element:el,previous:el.style.filter});el.style.filter=`url(#${f.id})`;canvas.width=0;canvas.height=0;
  }
  return()=>{for(const {element,previous}of owner.current)element.style.filter=previous;owner.current=[];root.replaceChildren();};
 },[enabled,seed,uid]);
 useEffect(()=>{for(const el of svg.current?.querySelectorAll('feDisplacementMap')??[])el.setAttribute('scale',String(phase<=200?18:Math.max(0,18*(320-phase)/120)));},[phase]);
 return <svg ref={svg} className="refraction-defs" aria-hidden="true"/>;
}
