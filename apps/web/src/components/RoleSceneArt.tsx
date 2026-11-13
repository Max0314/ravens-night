import type {PrivateSceneDescriptor} from '@ravens/contracts';
import {DemonArt} from './effects-art.js';
import {HuntingRifleScene} from './CinematicPublicArt.js';
import {ButlerBow} from './ButlerBow.js';
import {LayeredSceneArt,type SceneImprint} from './LayeredSceneArt.js';
import {privateAssetUrl} from './private-art-assets.js';
import {cinematicTiming as timing,smooth} from './cinematic-timing.js';
import './role-scene-art.css';
export const sceneVisualLabels:Record<string,string>={washerwoman:'清水揭示',librarian:'索引启封',investigator:'证物追索',chef:'案板与刀',empath:'心声共鸣',fortune_teller:'水晶占卜',undertaker:'棺铭揭晓',monk:'钢盾守护',ravenkeeper:'鸦羽传讯',virgin:'白花与封印',slayer:'燧火长鸣',soldier:'披甲守夜',mayor:'城镇权杖',butler:'向主人致意',drunk:'杯中的真相',recluse:'孤灯与暗影',saint:'烛光誓言',poisoner:'药瓶与毒雾',spy:'魔典启封',scarlet_woman:'猩红披风',baron:'契约与车队',imp:'夜翼展开'};
/** Art receives a gated projection, never a private view or live room state. */
export function RoleSceneArt({scene,elapsedMs,reducedMotion=false,imprint,readyAssets,resolveAsset}:{scene:PrivateSceneDescriptor;elapsedMs:number;reducedMotion?:boolean;imprint?:SceneImprint|undefined;readyAssets?:ReadonlySet<string>|undefined;resolveAsset?:((url:string)=>string)|undefined}){
 const t=reducedMotion?2500:Math.max(0,elapsedMs),role=scene.themeRoleId,available=(urls:string[])=>!readyAssets||urls.every(url=>readyAssets.has(url));
 const demonReady=available(['/art/effects/v4/demon-body.webp','/art/effects/v4/demon-wing-left.webp','/art/effects/v4/demon-wing-right.webp']);
 let body;
 if(scene.kind==='EVIL_START')body=<LayeredSceneArt role="sealed-letter" kind={scene.kind} elapsedMs={t} imprint={imprint} readyAssets={readyAssets} resolveAsset={resolveAsset} reducedMotion={reducedMotion}/>;
 else if(scene.kind==='ROLE_CHANGE'){
  body=<>{demonReady?<div className="premium-succession-wings" style={{opacity:smooth(t,timing.scarlet.wingStart,timing.scarlet.wingStart+400)}}><DemonArt elapsedMs={Math.max(0,t-timing.scarlet.wingStart)} reduced={reducedMotion}/></div>:null}<LayeredSceneArt role="scarlet_woman" kind={scene.kind} elapsedMs={t} imprint={imprint} readyAssets={readyAssets} resolveAsset={resolveAsset} reducedMotion={reducedMotion}/></>;
 }else if(scene.kind==='OLD_DEMON_CONTINUATION'){
  const src=privateAssetUrl('imp-defeated');body=<svg className="layered-scene-art" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet">{available([src])?<g transform={`translate(0 ${smooth(t,500,2500)*25})`}><image href={resolveAsset?.(src)??src} x={0} y={0} width={600} height={500} preserveAspectRatio="xMidYMid meet"/></g>:null}{!reducedMotion?Array.from({length:8},(_,i)=>{const p=smooth(t,500+i*100,2400+i*100);return <circle key={i} cx={300+Math.sin(p*5+i)*p*80} cy={350-p*280} r={2+(1-p)*5} fill="#b0472c" opacity={Math.sin(p*Math.PI)*.7}/>;}):null}</svg>;
 }else if(role==='butler')body=available(['/art/effects/v4/butler-bow.webp'])?<ButlerBow elapsedMs={t} reducedMotion={reducedMotion}/>:null;
 else if(role==='slayer')body=available(['/art/effects/v6/birdhead-shotgun.webp','/art/effects/v3/glass-cloud.webp'])?<HuntingRifleScene elapsedMs={t} fireAt={1200} reduced={reducedMotion}/>:null;
 else if(role==='imp')body=demonReady?<DemonArt elapsedMs={t} reduced={reducedMotion}/>:null;
 else body=<LayeredSceneArt role={role} kind={scene.kind} elapsedMs={t} imprint={imprint} readyAssets={readyAssets} resolveAsset={resolveAsset} reducedMotion={reducedMotion}/>;
 return <div className={`role-scene-art role-scene-art--${role}${reducedMotion?' is-reduced':''}`} aria-hidden="true"><div className="role-scene-art__halo"/>{body}<div className="role-scene-art__floor"/></div>;
}
