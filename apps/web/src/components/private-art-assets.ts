import type {PrivateSceneDescriptor} from '@ravens/contracts';
const v4=new Set(['book-shell','book-paper','book-paper-back','coffin-base','coffin-lid-front','coffin-lid-back','washer-basin-back','washer-basin-front','washer-linen','chef-board-clean','chef-carrot','crystal-shell','crystal-mist','poison-glass','poison-stopper','poison-mist','drunk-glass','raven-body','raven-wing','investigator-stamp','scarlet-cloak']);
const v5=new Set(['mayor-scepter','poison-vapour']);
export const privateAssetUrl=(name:string)=>name==='mayor'?'/art/effects/v5/mayor-base.webp':v5.has(name)?`/art/effects/v5/${name}.webp`:`/art/effects/${v4.has(name)?'v4':'v3'}/${name}.webp`;
export function privateArtUrls(scene:PrivateSceneDescriptor):string[]{
 const role=scene.themeRoleId;let names:string[];
 if(scene.kind==='EVIL_START')names=['sealed-letter','book-paper'];
 else if(scene.kind==='OLD_DEMON_CONTINUATION')names=['imp-defeated'];
 else if(scene.kind==='ROLE_CHANGE')names=['scarlet-cloak'];
 else if(role==='butler')names=[]; // ButlerBow owns its bounded atlas and advertises its URL below.
 else if(role==='imp'||role==='slayer')names=[];
 else if(role==='librarian'||role==='spy')names=['book-shell','book-paper','book-paper-back'];
 else if(role==='undertaker')names=['coffin-base','coffin-lid-front','coffin-lid-back'];
 else if(role==='washerwoman')names=['washer-basin-back','washer-basin-front','washer-linen'];
 else if(role==='chef')names=['chef-board-clean','chef-carrot','chef-cleaver'];
 else if(role==='fortune_teller')names=['crystal-shell','crystal-mist'];
 else if(role==='poisoner')names=['poison-glass','poison-stopper','poison-mist','poison-vapour'];
 else if(role==='mayor')names=['mayor','mayor-scepter'];
 else if(role==='drunk')names=['drunk-glass'];
 else if(role==='ravenkeeper')names=['raven-body','raven-wing'];
 else if(role==='scarlet_woman')names=['scarlet-cloak'];
 else if(role==='investigator')names=['investigator','investigator-stamp','book-paper'];
 else names=[role,...(role==='baron'||role==='saint'?['book-paper']:[])];
 const urls=names.map(privateAssetUrl);
 const normal=scene.kind!=='EVIL_START'&&scene.kind!=='OLD_DEMON_CONTINUATION'&&scene.kind!=='ROLE_CHANGE';
 if((normal&&role==='imp')||scene.kind==='ROLE_CHANGE')urls.push('/art/effects/v4/demon-body.webp','/art/effects/v4/demon-wing-left.webp','/art/effects/v4/demon-wing-right.webp');
 if(normal&&role==='slayer')urls.push('/art/effects/v5/short-shotgun.webp','/art/effects/v3/glass-cloud.webp');
 if(normal&&role==='butler')urls.push('/art/effects/v4/butler-bow.webp');
 if(normal&&role==='imp'&&scene.kind==='ACTION_SUBMITTED')urls.push(...['claw-screen-left','claw-screen-right','claw-avatar-left','claw-avatar-right'].map(privateAssetUrl));
 return urls;
}
export interface PreparedPrivateArt {ready:string[];failed:string[];timedOut:string[]}
type LoadResult={src:string;status:'ready'|'failed'|'timedOut'};
const cache=new Map<string,Promise<LoadResult>>();
function load(src:string):Promise<LoadResult>{let pending=cache.get(src);if(pending)return pending;pending=new Promise(resolve=>{const image=new Image();let done=false;const finish=(status:LoadResult['status'])=>{if(done)return;done=true;clearTimeout(timeout);image.onload=null;image.onerror=null;if(status!=='ready')cache.delete(src);resolve({src,status});};const timeout=setTimeout(()=>finish('timedOut'),6000);image.onload=()=>{if(image.decode)void image.decode().then(()=>finish('ready'),()=>finish('failed'));else finish('ready');};image.onerror=()=>finish('failed');image.src=src;});cache.set(src,pending);while(cache.size>48)cache.delete(cache.keys().next().value!);return pending;}
export async function preparePrivateArt(scene:PrivateSceneDescriptor):Promise<PreparedPrivateArt>{const result:PreparedPrivateArt={ready:[],failed:[],timedOut:[]};for(const item of await Promise.all(privateArtUrls(scene).map(load)))result[item.status].push(item.src);return result;}
