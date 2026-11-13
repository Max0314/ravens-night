import type {PrivateSceneDescriptor} from '@ravens/contracts';
import {roleArt} from '../role-art.js';
import {prewarmImages,readyImages,type ImagePreparation} from './image-prewarm.js';
const v4=new Set(['book-shell','book-paper','book-paper-back','coffin-base','coffin-lid-front','coffin-lid-back','washer-basin-back','washer-basin-front','washer-linen','chef-board-clean','chef-carrot','crystal-shell','crystal-mist','poison-glass','poison-stopper','poison-mist','drunk-glass','raven-body','raven-wing','investigator-stamp','scarlet-cloak']);
const v8=new Set(['envelope-back','envelope-front','envelope-flap-front','envelope-flap-back','envelope-seal','envelope-paper','envelope-seal-broken-left','envelope-seal-broken-right','investigator-evidence','investigator-magnifier','investigator-lens-glint','raven-perch','raven-body','raven-head-neck','raven-tail','raven-wing-left','raven-wing-right','raven-feather','coffin-oblique-base','coffin-oblique-lining','coffin-oblique-lid-front','coffin-oblique-lid-back','coffin-oblique-lid-edge','recluse-door-base','recluse-lantern','saint-candle-base','saint-flame-1','saint-flame-2','saint-flame-3','carriage-base','carriage-door','carriage-wheel-near-front','carriage-wheel-near-rear','carriage-wheel-far-front','carriage-lantern-near','carriage-lantern-far','carriage-lantern-inner','carriage-paper-1','carriage-paper-2','virgin-document-base','virgin-lily','virgin-ribbon','empath-heart-base','empath-chain']);
const v5=new Set(['mayor-scepter','poison-vapour']);
export const privateAssetUrl=(name:string)=>v8.has(name)?`/art/effects/v8/${name}.webp`:name==='mayor'?'/art/effects/v5/mayor-base.webp':v5.has(name)?`/art/effects/v5/${name}.webp`:`/art/effects/${v4.has(name)?'v4':'v3'}/${name}.webp`;
export function privateArtUrls(scene:PrivateSceneDescriptor):string[]{
 const role=scene.themeRoleId;let names:string[];
 if(scene.kind==='EVIL_START')names=['envelope-back','envelope-front','envelope-flap-front','envelope-flap-back','envelope-seal','envelope-paper','envelope-seal-broken-left','envelope-seal-broken-right'];
 else if(scene.kind==='OLD_DEMON_CONTINUATION')names=['imp-defeated'];
 else if(scene.kind==='ROLE_CHANGE')names=['scarlet-cloak'];
 else if(role==='butler')names=[]; // ButlerBow owns its bounded atlas and advertises its URL below.
 else if(role==='imp'||role==='slayer')names=[];
 else if(role==='librarian'||role==='spy')names=['book-shell','book-paper','book-paper-back'];
 else if(role==='undertaker')names=['coffin-oblique-base','coffin-oblique-lining','coffin-oblique-lid-front','coffin-oblique-lid-back','coffin-oblique-lid-edge'];
 else if(role==='washerwoman')names=['washer-basin-back','washer-basin-front','washer-linen'];
 else if(role==='chef')names=['chef-board-clean','chef-carrot','chef-cleaver'];
 else if(role==='fortune_teller')names=['crystal-shell','crystal-mist'];
 else if(role==='poisoner')names=['poison-glass','poison-stopper','poison-mist','poison-vapour'];
 else if(role==='recluse')names=['recluse-door-base','recluse-lantern'];
 else if(role==='virgin')names=['virgin-document-base','virgin-lily','virgin-ribbon'];
 else if(role==='empath')names=['empath-heart-base','empath-chain'];
 else if(role==='baron')names=['carriage-base','carriage-door','carriage-wheel-near-front','carriage-wheel-near-rear','carriage-wheel-far-front','carriage-lantern-near','carriage-lantern-far','carriage-lantern-inner','carriage-paper-1','carriage-paper-2','envelope-seal','envelope-seal-broken-left','envelope-seal-broken-right'];
 else if(role==='saint')names=['saint-candle-base','saint-flame-1','saint-flame-2','saint-flame-3'];
 else if(role==='mayor')names=['mayor','mayor-scepter','book-paper'];
 else if(role==='drunk')names=['drunk-glass'];
 else if(role==='ravenkeeper')names=['raven-perch','raven-body','raven-head-neck','raven-tail','raven-wing-left','raven-wing-right','raven-feather'];
 else if(role==='scarlet_woman')names=['scarlet-cloak'];
 else if(role==='investigator')names=['investigator-evidence','investigator-magnifier','investigator-lens-glint'];
 else names=[role];
 const urls=names.map(privateAssetUrl);
 const normal=scene.kind!=='EVIL_START'&&scene.kind!=='OLD_DEMON_CONTINUATION'&&scene.kind!=='ROLE_CHANGE';
 if((normal&&role==='imp')||scene.kind==='ROLE_CHANGE')urls.push('/art/effects/v4/demon-body.webp','/art/effects/v4/demon-wing-left.webp','/art/effects/v4/demon-wing-right.webp');
 if(normal&&role==='slayer')urls.push('/art/effects/v6/birdhead-shotgun.webp','/art/effects/v3/glass-cloud.webp');
 if(normal&&role==='butler')urls.push('/art/effects/v4/butler-bow.webp');
 if(normal&&role==='imp'&&scene.kind==='ACTION_SUBMITTED')urls.push(...['claw-screen-left','claw-screen-right','claw-avatar-left','claw-avatar-right'].map(privateAssetUrl));
 return urls;
}
export type PreparedPrivateArt=ImagePreparation;
export const preparePrivateArt=(scene:PrivateSceneDescriptor,onProgress?:(art:PreparedPrivateArt)=>void)=>prewarmImages(privateArtUrls(scene),onProgress);
export const readyPrivateArt=(scene:PrivateSceneDescriptor)=>readyImages(privateArtUrls(scene));
/** Only the next authorized scenes supplied by the caller, including their existing portrait fallback. */
export const prewarmPrivateArt=(scene:PrivateSceneDescriptor)=>prewarmImages([...privateArtUrls(scene),roleArt(scene.themeRoleId).portraitUrl]);
