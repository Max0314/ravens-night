import type {CSSProperties} from 'react';
import type {PrivateSceneDescriptor} from '@ravens/contracts';
import './premium-art.css';

export const premiumArtRoot='/art/effects/v3/';
export const propRoles=['washerwoman','librarian','investigator','chef','empath','fortune_teller','undertaker','monk','ravenkeeper','virgin','slayer','soldier','mayor','drunk','recluse','saint','poisoner','spy','scarlet_woman','baron'] as const;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(t:number,a:number,b:number)=>{const p=clamp((t-a)/(b-a));return p*p*(3-2*p);};
export function ArtImage({name,className='',style}:{name:string;className?:string;style?:CSSProperties}){return <img className={`premium-image ${className}`} src={`${premiumArtRoot}${name}.webp`} alt="" draggable={false} style={style}/>;}

export function privateArtFiles(scene:PrivateSceneDescriptor):string[]{
 const role=scene.themeRoleId;
 if(scene.kind==='EVIL_START')return['sealed-letter'];
 if(scene.kind==='OLD_DEMON_CONTINUATION')return['imp-defeated'];
 if(scene.kind==='ROLE_CHANGE')return['scarlet_woman'];
 if(role==='butler')return['butler-bow'];
 if(role==='imp')return scene.kind==='ACTION_SUBMITTED'?['claw-screen-left','claw-screen-right','claw-avatar-left','claw-avatar-right']:[];
 if(role==='chef')return['chef-board','chef-cleaver'];
 if(role==='washerwoman')return['washer-tub','washer-cloth'];
 return[role,...(role==='poisoner'?['bubble-single','bubble-cluster','bubble-burst','poison-wisp','poison-cloud','poison-stain']:[])];
}
const images=new Map<string,Promise<void>>();
export function preparePrivateArt(scene:PrivateSceneDescriptor):Promise<void>{
 const urls=privateArtFiles(scene).map(name=>`${premiumArtRoot}${name}.webp`);
 if(scene.themeRoleId==='imp'||scene.kind==='ROLE_CHANGE')urls.push('/art/effects/v1/demon-wings.webp');
 return Promise.allSettled(urls.map(src=>{let p=images.get(src);if(!p){p=new Promise<void>(resolve=>{const img=new Image();let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};const timer=setTimeout(()=>{images.delete(src);finish();},6000);img.onload=()=>{if(img.decode)void img.decode().catch(()=>{}).then(finish);else finish();};img.onerror=()=>{images.delete(src);finish();};img.src=src;});images.set(src,p);if(images.size>48)images.delete(images.keys().next().value!);}return p;})).then(()=>{});
}

/** Only receives the already authorized presentation, never room truth. */
export function PremiumProp({role,t,scene}:{role:string;t:number;scene:PrivateSceneDescriptor}){
 const enter=ease(t,100,620),reveal=ease(t,1550,2200),pulse=(at:number,width=160)=>Math.max(0,1-Math.abs(t-at)/width);
 const attack=scene.kind==='ACTION_SUBMITTED';
 const shieldY=t<700?(-45*(1-ease(t,220,700))):Math.sin((t-700)/24)*5*(1-ease(t,700,1020));
 const selected=scene.shown.type==='DIVINATION'?scene.shown.value.toLowerCase():'neutral';
 const mainStyle:CSSProperties={opacity:enter,transform:`translateY(${role==='monk'?shieldY:10*(1-enter)}px) scale(${role==='monk'?.72+.28*ease(t,220,700):.96+.04*enter})`};
 return <div className={`premium-prop premium-prop--${role} premium-answer--${selected}`} style={{'--reveal':reveal,'--light':.15+reveal*.45,'--sweep':`${-80+ease(t,600,1900)*200}%`} as CSSProperties}>
  {role==='chef'?<><ArtImage name="chef-board" className="chef-board" style={{opacity:enter}}/><ArtImage name="chef-cleaver" className="chef-cleaver" style={{opacity:enter,transform:`translateY(${-30+30*Math.max(pulse(650,180),pulse(1000,180),pulse(1350,180))}px) rotate(${-10+10*Math.max(pulse(650,180),pulse(1000,180),pulse(1350,180))}deg)`}}/><span className="chef-dust" style={{opacity:Math.max(pulse(700),pulse(1050),pulse(1400))}}/></>:
   role==='washerwoman'?<><ArtImage name="washer-tub" className="washer-tub" style={{opacity:enter}}/><ArtImage name="washer-cloth" className="washer-cloth" style={{opacity:enter,transform:`translateY(${t<1700?Math.sin(t/145)*5:-12*reveal}px) rotate(${t<1700?Math.sin(t/190)*1.5:0}deg)`}}/>{[0,1,2,3,4].map(i=><i className="water-drop" key={i} style={{left:`${46+i*6}%`,top:`${60+((t/18+i*13)%29)}%`,opacity:t>600&&t<2400?.7:0}}/>)}</>:
   <ArtImage name={role} className="premium-prop-main" style={mainStyle}/>}
  {role==='monk'?<span className="premium-shield-wave" style={{opacity:t>=700?Math.max(0,1-(t-700)/850):0,transform:`scale(${1+Math.max(0,t-700)/900})`}}/>:null}
  {role==='fortune_teller'?<><span className="crystal-swirl" style={{opacity:.1+.35*ease(t,700,2200),transform:`rotate(${t/27}deg)`}}/><span className="crystal-answer" style={{opacity:scene.shown.type==='DIVINATION'?reveal*.7:0}}/></>:null}
  {role==='poisoner'?<><span className="potion-light" style={{opacity:.2+.2*Math.sin(t/280)}}/>{attack?<PoisonVapour elapsedMs={t} compact/>:null}</>:null}
  {role==='empath'?<span className="empath-wave" style={{opacity:.5*(.5+.5*Math.sin(t/160)),transform:`scale(${.85+.15*Math.sin(t/160)})`}}/>:null}
  {['librarian','spy'].includes(role)?<span className="premium-paper-leaf" style={{opacity:t>650&&t<1850?.7*Math.sin((t-650)/1200*Math.PI):0,transform:`perspective(500px) rotateY(${-180*ease(t,650,1850)}deg)`}}/>:null}
  {['saint','recluse','ravenkeeper'].includes(role)?<span className="prop-candle-light" style={{opacity:.25+.07*Math.sin(t/80)+.04*Math.sin(t/29)}}/>:null}
  <span className="premium-prop-glint" style={{opacity:enter*.35}}/>
 </div>;
}

export function ClawDecal({variant='dawn',style,className=''}:{variant?:'screen-left'|'screen-right'|'avatar-left'|'avatar-right'|'dawn'|'town';style?:CSSProperties;className?:string}){return <ArtImage name={`claw-${variant}`} className={`premium-claw premium-claw--${variant} ${className}`} {...(style?{style}:{})}/>;}
export function DemonSlashes({elapsedMs,reduced=false}:{elapsedMs:number;reduced?:boolean}){
 if(reduced)return null;
 return <div className="premium-demon-slashes" aria-hidden="true">{(['left','right'] as const).map((side,i)=>{const dt=elapsedMs-(1450+i*300),p=clamp(dt/160),fade=dt<600?1:Math.max(0,1-(dt-600)/850);return dt<0?null:<ClawDecal key={side} variant={`screen-${side}`} style={{opacity:fade,clipPath:`inset(0 ${side==='left'?(1-p)*100:0}% 0 ${side==='right'?(1-p)*100:0}%)`,transform:`translateX(${(1-p)*(i?20:-20)}px)`}}/>;})}</div>;
}
export function PoisonVapour({elapsedMs,compact=false,reduced=false}:{elapsedMs:number;compact?:boolean;reduced?:boolean}){
 const t=elapsedMs-900;if(t<0)return null;const fade=Math.min(1,t/250)*Math.max(0,1-Math.max(0,t-1900)/1000);
 return <div className={`premium-poison-vapour${compact?' is-compact':''}${reduced?' is-reduced':''}`} aria-hidden="true" style={{opacity:fade}}><ArtImage name="poison-cloud" className="poison-cloud" style={{transform:`translateY(${-Math.min(35,t/65)}px) scale(${.8+Math.min(.4,t/5000)})`}}/><ArtImage name="poison-wisp" className="poison-wisp" style={{transform:`translateY(${-Math.min(60,t/40)}px) rotate(${Math.sin(t/700)*6}deg)`}}/>{!compact?<ArtImage name="poison-stain" className="poison-edge"/>:null}{!reduced&&Array.from({length:compact?4:10},(_,i)=>{const p=((t+i*117)%1600)/1600;return <ArtImage key={i} name={p>.82?'bubble-burst':i%3===0?'bubble-cluster':'bubble-single'} className="premium-bubble" style={{width:18+i%4*12,left:`${9+i*37%82}%`,bottom:`${p*70}%`,opacity:Math.sin(p*Math.PI)*.8,transform:`translateX(${Math.sin(p*7+i)*9}px) scale(${.6+p*.5})`}}/>;})}</div>;
}
