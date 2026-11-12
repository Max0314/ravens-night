import {useLayoutEffect,useRef} from 'react';
import type {PrivateSceneDescriptor} from '@ravens/contracts';
import {DemonArt} from './effects-art.js';
import {ButlerBow} from './ButlerBow.js';
import {ArtImage,PremiumProp} from './PremiumArt.js';
import './role-scene-art.css';
export const sceneVisualLabels:Record<string,string>={washerwoman:'清水揭示',librarian:'索引启封',investigator:'证物追索',chef:'案板与刀',empath:'心声共鸣',fortune_teller:'水晶占卜',undertaker:'棺铭揭晓',monk:'钢盾守护',ravenkeeper:'鸦羽传讯',virgin:'白花与封印',slayer:'燧火长鸣',soldier:'披甲守夜',mayor:'城镇权杖',butler:'向主人致意',drunk:'杯中的真相',recluse:'孤灯与暗影',saint:'烛光誓言',poisoner:'药瓶与毒雾',spy:'魔典启封',scarlet_woman:'猩红披风',baron:'契约与车队',imp:'夜翼展开'};
/** Visuals read only the authorized descriptor. No hidden room state is consulted. */
export function RoleSceneArt({scene,elapsedMs,reducedMotion=false}:{scene:PrivateSceneDescriptor;elapsedMs:number;reducedMotion?:boolean}){
 const ref=useRef<HTMLDivElement>(null),t=reducedMotion?2300:Math.max(0,elapsedMs),role=scene.themeRoleId;
 useLayoutEffect(()=>{for(const animation of ref.current?.getAnimations?.({subtree:true})??[]){animation.pause();animation.currentTime=t;}},[t,role,scene.kind]);
 let body;
 if(scene.kind==='EVIL_START')body=<PremiumProp role="sealed-letter" t={t} scene={scene}/>;
 else if(scene.kind==='ROLE_CHANGE')body=<div className="premium-succession"><ArtImage name="scarlet_woman" style={{opacity:Math.max(0,1-(t-900)/1600)}}/><div className="premium-succession-wings" style={{opacity:Math.min(1,Math.max(0,(t-900)/1500))}}><DemonArt/></div></div>;
 else if(scene.kind==='OLD_DEMON_CONTINUATION')body=<div className="premium-continuation"><ArtImage name="imp-defeated" style={{opacity:1-Math.min(.6,t/6000)}}/><span style={{opacity:Math.min(.8,t/2200),transform:`translateY(${-t/65}px)`}}/></div>;
 else if(role==='butler')body=<ButlerBow elapsedMs={t} reducedMotion={reducedMotion}/>;
 else if(role==='imp')body=<DemonArt/>;
 else body=<PremiumProp role={role} t={t} scene={scene}/>;
 return <div ref={ref} className={`role-scene-art role-scene-art--${role}${reducedMotion?' is-reduced':''}`} aria-hidden="true"><div className="role-scene-art__halo"/>{body}<div className="role-scene-art__floor"/></div>;
}
