import {experienceTiming,type ExperienceKind,type PresentationVersion,type PrivateSceneDescriptor} from '@ravens/contracts';
import {privateAudioAllowed} from '../participation-audio.js';
import {cinematicTiming as contact} from './cinematic-timing.js';
import {roleAudioV6 as detailLead} from './role-audio-v6.js';
import {roleAudioV7 as ravenCoffinLead} from './role-audio-v7.js';
import {roleAudioV8 as remainingLead} from './role-audio-v8.js';
type Scope='public'|'private'|'ui'|'book'|'nomination'|'ballot';
export interface AudioPlayback {rate?:number;outcome?:string|undefined;resultVisible?:boolean;resume?:boolean;mode?:'START'|'RESUME'|'SEEK';paused?:boolean;seekKey?:number|string;playbackId?:string}
export type SemanticCue='press'|'select'|'open'|'close'|'success'|'error'|'paper-lift'|'paper-turn';
interface Playing {id:string;scope:Scope;at:number;sample:string;gain:GainNode;bell:boolean;end:number}
let ctx:AudioContext|undefined,output:GainNode|undefined,unlockAttempt=0;
let enabled=readPreference(),status='',semanticSeq=0;
let previewAudio:{enabled:boolean;volume:number}|undefined;
const bookOwners=new Set<object>(),nominationOwners=new Set<object>();
function previewPrivateAllowed(){return !!previewAudio||privateAudioAllowed();}
export function effectsAudioVolume(){return previewAudio?.volume??.72;}
export function setEffectsPreviewVolume(value:number){if(!previewAudio||!Number.isFinite(value))return;previewAudio.volume=Math.max(0,Math.min(1,value));if(output)output.gain.value=previewAudio.volume;}
/** The lab auditions private cues without changing the room's participation mode or master preference. */
export function beginEffectsPreview(){
 silenceEffects();previewAudio={enabled:false,volume:.72};if(output)output.gain.value=.72;
 window.dispatchEvent(new Event('ravens-effects-audio'));
 return()=>{silenceEffects();previewAudio=undefined;if(output)output.gain.value=.72;window.dispatchEvent(new Event('ravens-effects-audio'));};
}
const buffers=new Map<string,Promise<AudioBuffer>>(),sizes=new Map<string,number>(),played=new Map<string,number>(),epochs=new Map<string,number>();
const sources=new Map<AudioBufferSourceNode,Playing>();
function readPreference(){try{return localStorage.getItem('ravens_effects_audio')!=='off';}catch{return true;}}
function destination(audio:AudioContext){if(!output){output=audio.createGain();output.gain.value=effectsAudioVolume();if(typeof audio.createDynamicsCompressor==='function'){const limit=audio.createDynamicsCompressor();limit.threshold.value=-1;limit.knee.value=0;limit.ratio.value=20;limit.attack.value=.002;limit.release.value=.1;output.connect(limit);limit.connect(audio.destination);}else output.connect(audio.destination);}return output;}
export const globalAudioEvent='ravens:global-audio';
export function globalAudioEnabled(){return enabled;}
export function effectsAudioEnabled(){return previewAudio?.enabled??enabled;}
export function effectsAudioStatus(){return status;}
function report(value:string){status=value;window.dispatchEvent(new Event('ravens:audio-status'));}
export async function unlockEffectsAudio(){
 if(typeof window==='undefined')return;
 const Audio=window.AudioContext??(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!Audio){report('当前浏览器不支持演出音效');return;}ctx??=new Audio();
 if(ctx.state==='running'){report('');return;}const audio=ctx,attempt=++unlockAttempt;
 // A new user gesture must call resume synchronously even if an earlier automatic request is pending.
 try{await audio.resume();if(ctx!==audio||attempt!==unlockAttempt)return;report(audio.state==='running'?'':'点击开启声音后重试');if(audio.state==='running')window.dispatchEvent(new Event('ravens-effects-unlocked'));}
 catch{if(ctx===audio&&attempt===unlockAttempt&&audio.state!=='running')report('声音尚未解锁，请再次点击开启');}

}
/** Starts both WebAudio and the music event in this call stack, before the first await. */
export async function enableEffectsAudio(value=true){
 if(previewAudio){previewAudio.enabled=value;window.dispatchEvent(new Event('ravens-effects-audio'));if(!value){silenceEffects();return;}await unlockEffectsAudio();return;}
 enabled=value;try{localStorage.setItem('ravens_effects_audio',value?'on':'off');}catch{/* This tab keeps the total preference. */}
 if(!value){bookOwners.clear();silenceEffects();}
 const unlock=value?unlockEffectsAudio():Promise.resolve();
 window.dispatchEvent(new CustomEvent(globalAudioEvent,{detail:{enabled:value}}));
 window.dispatchEvent(new Event('ravens-effects-audio'));await unlock;
}

function allowed(scope:Scope){return effectsAudioEnabled()&&ctx?.state==='running'&&!document.hidden&&(scope!=='private'||previewPrivateAllowed());}
let activeLoads=0;const loadWaiters:Array<()=>void>=[];
function takeLoadSlot(){if(activeLoads<4){activeLoads++;return Promise.resolve();}return new Promise<void>(resolve=>loadWaiters.push(resolve));}
function releaseLoadSlot(){const next=loadWaiters.shift();if(next)next();else activeLoads--;}
function load(sample:string):Promise<AudioBuffer>{
 const old=buffers.get(sample);if(old){buffers.delete(sample);buffers.set(sample,old);return old;}
 const prefix=sample.match(/^(v[1345678]):/),version=prefix?.[1]??'v2',name=sample.replace(/^v[1345678]:/,'');
 const candidate=/^candidate:(L02|L03|L04|A03)$/.exec(sample)?.[1],url=candidate?'/audio-candidates/2026-11-12-v1/'+candidate+'.mp3':'/audio/effects/'+version+'/'+name+'.mp3';
 const pending=(async()=>{await takeLoadSlot();try{const response=await fetch(url);if(!response.ok)throw Error('missing audio');const data=await response.arrayBuffer();if(!ctx)throw Error('locked');const buffer=await ctx.decodeAudioData(data);sizes.set(sample,(buffer.length??0)*(buffer.numberOfChannels??1)*4);let bytes=[...sizes.values()].reduce((a,b)=>a+b,0);for(const [key]of buffers){if(bytes<=24*1024*1024)break;if(key===sample||[...sources.values()].some(s=>s.sample===key))continue;bytes-=sizes.get(key)??0;sizes.delete(key);buffers.delete(key);}return buffer;}finally{releaseLoadSlot();}})().catch(error=>{buffers.delete(sample);sizes.delete(sample);report('部分音效未加载，请检查连接后重试');throw error;});buffers.set(sample,pending);return pending;
}
/** Invoke directly in the book's user gesture; no global/private sound preference changes. */
export function prepareBookAudio(owner:object):Promise<boolean>{
 if(!effectsAudioEnabled())return Promise.resolve(false);
 bookOwners.add(owner);const unlock=unlockEffectsAudio();
 const media=ctx?Promise.allSettled(['paper-turn-1','paper-turn-2','paper-turn-3','paper-turn-4','paper-lift-1','paper-lift-2'].map(load)):Promise.resolve([]);
 return Promise.all([unlock,media]).then(([,results])=>bookOwners.has(owner)&&allowed('book')&&results.every(row=>row.status==='fulfilled'));
}
export function releaseBookAudio(owner:object){bookOwners.delete(owner);cancelSemantic('book');}
function claim(key:string,at:number){if(played.has(key))return false;played.set(key,at);if(played.size>1200)played.delete(played.keys().next().value!);return true;}
function stop(source:AudioBufferSourceNode,record:Playing,fade=40){const audio=ctx;if(audio){if(record.at>audio.currentTime){try{source.stop(audio.currentTime);}catch{}sources.delete(source);return;}try{record.gain.gain.setValueAtTime(record.gain.gain.value,audio.currentTime);record.gain.gain.linearRampToValueAtTime(0,audio.currentTime+fade/1000);source.stop(audio.currentTime+fade/1000);}catch{/* Ended. */}}sources.delete(source);}
export function cancelEventAudio(id:string){epochs.set(id,(epochs.get(id)??0)+1);for(const [source,row]of sources)if(row.id===id)stop(source,row);for(const [key,time]of played)if(key.startsWith(id+':')&&time>(ctx?.currentTime??0))played.delete(key);}
export function completeEventAudio(id:string){for(const [source,row]of sources)if(row.id===id&&!row.bell)stop(source,row);}
export function silenceEffects(scope?:Scope){const ids=new Set<string>();for(const [source,row]of sources)if(!scope||row.scope===scope){ids.add(row.id);stop(source,row);}for(const id of epochs.keys())if(!scope||id.startsWith(scope+':'))ids.add(id);for(const id of ids)cancelEventAudio(id);}
export function cancelSemantic(scope:'ui'|'book'){silenceEffects(scope);}
if(typeof window!=='undefined'){
 window.addEventListener('ravens:participation-audio',()=>{if(!previewPrivateAllowed())silenceEffects('private');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)silenceEffects();});
 window.addEventListener('ravens:ui-feedback',event=>{const detail=(event as CustomEvent<SemanticCue|{cue:SemanticCue;scope:'ui'|'private'}>).detail,cue=typeof detail==='string'?detail:detail.cue;if(['press','select','open','close','success','error'].includes(cue))playSemantic(cue,{scope:typeof detail==='string'?'ui':detail.scope});});
}
function sampleAt(id:string,cue:string,sample:string,delay:number,scope:Scope,rate=1,volume=.6,offset=0,lateWindow=100,bell=false,onStarted?:(buffer:AudioBuffer,when:number,source:AudioBufferSourceNode)=>void){
 const audio=ctx;if(!audio||!allowed(scope)||delay<0)return;
 if(!epochs.has(id))epochs.set(id,0);const epoch=epochs.get(id),at=audio.currentTime+delay/1000;
 if(!claim(id+':'+cue,at))return;
 void load(sample).then(buffer=>{
  if(ctx!==audio||epochs.get(id)!==epoch||!allowed(scope)||(audio.currentTime-at)*1000>lateWindow||offset>=buffer.duration)return;
  const vocal=/^(v6:washer-whisper|hurt-|cough-|butler-voice)/.test(sample),group=(s:Playing)=>/^(v6:washer-whisper|hurt-|cough-|butler-voice)/.test(s.sample);const own=[...sources].filter(([,s])=>s.scope===scope&&!s.bell&&group(s)===vocal&&s.at<=at&&s.end>at);if(scope!=='nomination'&&own.length>=(scope==='ui'||scope==='book'||vocal?1:3))stop(own[0]![0],own[0]![1]);
  if(!bell&&scope!=='ui'&&scope!=='book')for(const row of sources.values())if(row.bell){const duckAt=Math.max(at,audio.currentTime);row.gain.gain.setValueAtTime(row.gain.gain.value,duckAt);row.gain.gain.linearRampToValueAtTime(.035,duckAt+.04);row.gain.gain.linearRampToValueAtTime(.2,duckAt+.34);}
  const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;source.connect(gain);gain.connect(destination(audio));sources.set(source,{id,scope,at,sample,gain,bell,end:at+(buffer.duration-offset)/rate});source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};const when=Math.max(audio.currentTime,at);source.start(when,offset);onStarted?.(buffer,when,source);
 }).catch(()=>{/* Missing media never blocks interaction. */});
}
const hash=(id:string)=>[...id].reduce((v,c)=>(Math.imul(v,31)+c.charCodeAt(0))>>>0,0);
let previousPrivateUi='';
export function playSemantic(cue:SemanticCue,options:{variant?:number;scope?:'ui'|'book'|'private'}={}){
 // Generic acceptance sounds must not add a chime before a material scene.
 if(cue==='press'||cue==='select'||cue==='success')return;
 const scope=options.scope??(cue.startsWith('paper-')?'book':'ui');if(!allowed(scope))return;if(scope==='private'){if(previousPrivateUi)cancelEventAudio(previousPrivateUi);}else cancelSemantic(scope);const variant=options.variant??semanticSeq;
 const sample=cue==='paper-turn'?'paper-turn-'+(1+variant%4):cue==='paper-lift'?'paper-lift-'+(1+variant%2):'ui-'+cue;
 const id=scope+':ui:'+(++semanticSeq);if(scope==='private')previousPrivateUi=id;sampleAt(id,cue,sample,0,scope,1,scope==='book'?.65:.16,0,200);
}
let currentBell='';
const publicRanges=new Map<string,{key:number|string;at:number;generation:number}>();
const publicTails=new Map<string,{sample:string;origin:number;duration:number}>();
export function scheduleCue(id:string,kind:string,elapsed:number,version:PresentationVersion=1,emptyExecution=false,options:AudioPlayback={}){
 const mode=options.mode??(options.resume?'RESUME':'START'),epoch=epochs.get(id)??0,key=options.seekKey??epoch;
 if(mode==='SEEK'&&publicRanges.get(id)?.key!==key){publicRanges.set(id,{key,at:elapsed,generation:(publicRanges.get(id)?.generation??0)+1});if(publicRanges.size>1200)publicRanges.delete(publicRanges.keys().next().value!);}
 if(options.paused||!allowed('public'))return;
 const range=publicRanges.get(id),prefix='range:'+(range?.generation??0)+':',rate=options.rate??1,timing=experienceTiming(kind as ExperienceKind,version);
 const cueAt=(at:number,cue:string,sample:string,volume:number,continuous=false,bell=false)=>{
  const late=elapsed>at;if(late&&(!continuous||mode!=='RESUME'||range&&at<range.at))return;
  sampleAt(id,prefix+(late?'resume:'+epoch+':':'base:')+cue,sample,Math.max(0,(at-elapsed)/rate),'public',rate,volume,late?(elapsed-at)/1000:0,100,bell);
 };
 if((kind==='DAWN'||kind==='NIGHT_FALLS')&&currentBell!==id){if(currentBell)cancelEventAudio(currentBell);currentBell=id;}
 for(const [at,cue]of timing.cues){if(kind==='EXECUTION'&&emptyExecution)continue;
  if(cue==='bell'||cue==='dawn'||cue.startsWith('night-bell')||cue.startsWith('dawn-bell'))cueAt(at,cue+':'+at,kind==='DAWN'?'dawn-bell':'night-bell',.3,true,true);
  else if(cue==='shot'){cueAt(at,'shot:'+at,version<4?'v1:shot':'shot',.8);cueAt(at,'glass:'+at,version<4?'v1:glass':'glass-hit',.5);if(version===4)cueAt(at+80,'shards:'+at,'glass-shards',.35);}
  else if(cue==='mechanism')cueAt(at,'mechanism:'+at,version<4?'v1:impact':'guillotine-impact',.75);
  else if(cue==='tension'||cue==='frame')cueAt(at,cue+':'+at,'guillotine-tension',.3);
  else if(cue==='unlock'||cue==='release'||cue==='blade')cueAt(at,cue+':'+at,'guillotine-'+(cue==='release'?'unlock':cue),.45);
  else if(cue==='cock')cueAt(at,cue+':'+at,version<4?'v1:impact':'gun-cock',.3);
  else if((cue==='nominate'||cue==='paper')&&!(nominationOwners.size&&['NOMINATION','VOTE_RESULT'].includes(kind)))cueAt(at,cue+':'+at,version===4?(cue==='nominate'?'nomination':'vote-stamp'):(cue==='nominate'?'ui-open':'ui-success'),.2);
 }
 if(emptyExecution)cueAt(300,'empty:wind','guillotine-wind',.4,true);
 const fresh=elapsed>=timing.resultOffset&&elapsed-timing.resultOffset<=500&&(!range||range.at<timing.resultOffset);
 const resultTail=(cue:string,sample:string,volume:number)=>{
  const semantic=prefix+'outcome:'+cue,tailKey=id+':'+semantic,tail=publicTails.get(tailKey);
  if(mode==='RESUME'){if(tail?.sample===sample){const offset=(elapsed-tail.origin)/1000;if(offset>=0&&offset<tail.duration)sampleAt(id,semantic+':resume:'+epoch,sample,0,'public',rate,volume,offset,150);}return;}
  if(!fresh)return;const scheduledAt=ctx?.currentTime??0;
  sampleAt(id,semantic,sample,0,'public',rate,volume,0,500-(elapsed-timing.resultOffset),false,(buffer,when)=>{if(!publicTails.has(tailKey)){publicTails.set(tailKey,{sample,origin:elapsed+(when-scheduledAt)*1000*rate,duration:buffer.duration});if(publicTails.size>1200)publicTails.delete(publicTails.keys().next().value!);}});
 };
 if(options.resultVisible&&options.outcome==='DEATH'&&['SHOT','EXECUTION','DAWN'].includes(kind)&&!emptyExecution)resultTail('death',version<4?'v1:scream':(kind==='DAWN'?'hurt-night':'hurt-shot')+'-'+(1+hash(id)%3),.58);
 if(version===4&&options.resultVisible&&options.outcome==='DEATH'&&fresh&&!emptyExecution&&['SHOT','EXECUTION','DAWN'].includes(kind)){sampleAt(id,prefix+'outcome:blood','blood-impact',0,'public',rate,.35,0,500);if(kind==='DAWN')sampleAt(id,prefix+'outcome:bone','bone-crack',100/rate,'public',rate,.25,0,500);}
 if(kind==='GAME_OVER'&&options.resultVisible&&(options.outcome==='GOOD'||options.outcome==='EVIL'))resultTail('finale',(version<4?'v1:':'')+(options.outcome==='GOOD'?'good':'evil'),.78);
}
export function schedulePrivateCue(id:string,kind:string,elapsed:number,options:AudioPlayback={}){
 const role=({POISON:'poisoner',PROTECT:'monk',BUTLER:'butler',DEMON:'imp'} as Record<string,string>)[kind];if(!role)return;
 scheduleRoleCue({version:1,id,kind:'ACTION_SUBMITTED',themeRoleId:role,shown:{type:'TARGET_SUBMITTED',action:kind==='POISON'?'POISON':kind==='PROTECT'?'PROTECT':kind==='BUTLER'?'MASTER':'KILL',seats:[]}},elapsed,options);
}
/** The optional contact marks a transient inside a clip's lead-in (v1 shield). */
export type RoleAudioCue=[at:number,sample:string,volume:number,continuity?:'continuous'|'transient',contactAt?:number];
// Measured decoded contacts/onsets, recorded by the v4 and v5 manifests.
const demonContact=contact.demon as typeof contact.demon&{avatarLeft?:number;avatarRight?:number};
const materialLead={slash:85,cork:9.75,pour:24.6,chop:[10.63,10.09,10.86]} as const;
function detailCue(at:number,name:keyof typeof detailLead,volume:number,transient=false):RoleAudioCue{return[at-detailLead[name][transient?'peak':'onset'],'v6:'+name,volume,transient?'transient':'continuous',at];}
function ravenCoffinCue(at:number,name:keyof typeof ravenCoffinLead,volume:number,transient=false):RoleAudioCue{return[at-ravenCoffinLead[name][transient?'peak':'onset'],'v7:'+name,volume,transient?'transient':'continuous',at];}
function remainingCue(at:number,name:keyof typeof remainingLead,volume:number,transient=false):RoleAudioCue{return[at-remainingLead[name][transient?'peak':'onset'],'v8:'+name,volume,transient?'transient':'continuous',at];}
const cloakCues=()=>[remainingCue(contact.scarlet.start,'cloak-unfold',.58),remainingCue(contact.scarlet.open,'cloak-hem',.5)];
export function roleAudioCues(scene:PrivateSceneDescriptor):RoleAudioCue[]{
 const role=scene.themeRoleId,variant=1+hash(scene.id)%4;
 // Scene kind takes priority over the role that received the envelope.
 if(scene.kind==='EVIL_START')return[detailCue(contact.envelope.seal,'envelope-seal',.38,true),detailCue(contact.envelope.flapStart,'envelope-flap',.5),detailCue(contact.envelope.paperStart,'envelope-draw',.5)];
 if(scene.kind==='OLD_DEMON_CONTINUATION')return[[600,'wing-air',.17]];
 if(scene.kind==='ROLE_CHANGE')return cloakCues();
 if(role==='washerwoman')return[detailCue(contact.washer.dipStart,'washer-dip',.44),detailCue(contact.washer.scrubStart,'washer-scrub',.48),detailCue(contact.washer.dripStart,'washer-drops',.46),detailCue(contact.washer.dipStart,'washer-whisper',.7)];
 if(role==='fortune_teller')return[detailCue(contact.crystal.start,'crystal-resonance',.6),detailCue(contact.crystal.answer,'crystal-shiver',.48)];
 if(role==='investigator')return[detailCue(contact.investigator.scanStart,'investigator-lens',.52),detailCue(contact.investigator.turn,'investigator-evidence',.52)];
 if(role==='butler')return[[500,'role-butler',.3],[contact.butler.voice,'butler-voice',.74]];
 if(role==='poisoner')return[[contact.poison.uncork-materialLead.cork,'v4:poison-cork',.56,'transient',contact.poison.uncork],[contact.poison.pour-materialLead.pour,'v4:poison-pour',.48],[contact.poison.bubbles,'poison-bubbles',.4],...(scene.kind==='ACTION_SUBMITTED'?[[contact.poison.cough,'cough-'+(1+hash(scene.id)%3),.42] as RoleAudioCue]:[])];
 if(role==='monk'&&scene.kind==='ACTION_SUBMITTED')return[[contact.shield.cue,'v1:shield',.74,'transient',contact.shield.contact]];
 if(role==='imp'&&scene.kind==='ACTION_SUBMITTED')return[[contact.demon.flap,'wing-flap',.43,'transient'],[contact.demon.air,'wing-air',.22],[contact.demon.open,'wing-root',.32,'transient'],...[contact.demon.left,contact.demon.right,demonContact.avatarLeft??2050,demonContact.avatarRight??2350].map((at,i)=>[at-materialLead.slash,'v5:slash-'+(i%2?'right':'left'),.92,'transient',at] as RoleAudioCue)];
 if(role==='chef')return contact.chef.map((at,i)=>[at-materialLead.chop[i]!,'v4:chef-chop-'+(i+1),.5,'transient',at]);
 if(role==='ravenkeeper')return[ravenCoffinCue(contact.raven.attention,'raven-short-call',.42),ravenCoffinCue(contact.raven.flapStart,'raven-wing-open',.54),ravenCoffinCue(contact.raven.flapStart,'raven-feathers',.4),ravenCoffinCue(contact.raven.spread,'raven-wing-fold',.5)];
 if(role==='undertaker')return[ravenCoffinCue(contact.coffin.start,'coffin-hinge',.5),ravenCoffinCue(contact.coffin.open,'coffin-settle',.4,true)];
 if(role==='empath')return[contact.empath.left,contact.empath.left+contact.empath.echoDelay,contact.empath.right,contact.empath.right+contact.empath.echoDelay].map((at,i)=>remainingCue(at,'empath-pulse',i%2?.4:.6,true));
 if(role==='soldier')return[remainingCue(contact.armor.contact,'soldier-shield',.58,true)];
 if(role==='mayor')return[remainingCue(contact.mayor.contact,'scepter-contact',.58,true),remainingCue(contact.mayor.document,'mayor-document',.5)];
 if(role==='drunk')return[remainingCue(contact.drunk.lean,'cup-sway-left',.5),remainingCue(contact.drunk.return,'cup-sway-right',.5)];
 if(role==='scarlet_woman')return cloakCues();
 if(role==='virgin')return[remainingCue(contact.flower.ribbon,'flower-ribbon',.5)];
 if(role==='librarian'||role==='spy')return[[contact.book.middle,'paper-turn-'+variant,.4]];
 return[[500,'role-'+role,.5]];
}
/** Prepare private media before its local art clock starts. Public timelines never wait. */
export async function prepareRoleAudio(scene:PrivateSceneDescriptor):Promise<void>{
 if(!effectsAudioEnabled()||!ctx||!previewPrivateAllowed())return;
 let timer:ReturnType<typeof setTimeout>|undefined;
 await Promise.race([Promise.allSettled(roleAudioCues(scene).map(([,sample])=>load(sample))),new Promise<void>(resolve=>{timer=setTimeout(()=>{report('声音加载较慢，本段先继续；可在记录中重播');resolve();},6000);})]);
 clearTimeout(timer);
}
export function scheduleRoleCue(scene:PrivateSceneDescriptor,elapsed:number,options:AudioPlayback={}){
 const id='private:'+(options.playbackId??scene.id),rate=options.rate??1,cues=roleAudioCues(scene),mode=options.mode??(options.resume?'RESUME':'START'),epoch=epochs.get(id)??0;
 for(const [at,sample,volume,continuity='continuous',contactAt=at]of cues){
  const late=elapsed>at;if(late&&(mode!=='RESUME'||continuity==='transient'&&elapsed>=contactAt))continue;
  const offset=late?(elapsed-at)/1000:0,key=(mode==='START'?'':mode.toLowerCase()+':'+epoch+':')+at+':'+sample;
  sampleAt(id,key,sample,Math.max(0,(at-elapsed)/rate),'private',rate,volume,offset,150);
 }
}
export async function auditionSample(sample:string){if(!/^(?:v[1345678]:)?[a-z0-9_-]+$/.test(sample)||!allowed('ui'))return;silenceEffects('ui');const id='ui:audition:'+(++semanticSeq);epochs.set(id,0);try{await load(sample);if(allowed('ui')&&epochs.get(id)===0)sampleAt(id,'audition',sample,0,'ui',1,sample==='v1:shield'?.74:.6,0,500);}catch{}}


export type NominationSoundEvent={id?:string;kind?:string;startsAt?:number;durationMs?:number;outcome?:string};
export function nominationSound(kind:string|undefined,outcome?:string){return kind==='NOMINATION'?'L03':kind==='VOTE_RESULT'?(outcome==='ON_BLOCK'?'L04':outcome==='NONE'||outcome==='TIED'?'L02':undefined):undefined;}
export function nominationSoundDuration(kind:string|undefined,outcome?:string){const sample=nominationSound(kind,outcome);return sample==='L03'?16000:sample==='L04'?20000:sample==='L02'?15000:0;}
export async function prepareNominationAudio(){if(!effectsAudioEnabled()||!ctx)return;await Promise.allSettled(['L02','L03','L04','A03'].map(id=>load('candidate:'+id)));}
function cancelOwnerEvent(id:string){for(const [source,row]of sources)if(row.id===id)stop(source,row,0);cancelEventAudio(id);}
const nominationDucked=new WeakSet<GainNode>();
function duckNominationTails(id:string,when:number){for(const row of sources.values())if(row.scope==='nomination'&&row.id!==id&&row.at<=when&&!nominationDucked.has(row.gain)){nominationDucked.add(row.gain);row.gain.gain.setValueAtTime(row.gain.gain.value,when);row.gain.gain.linearRampToValueAtTime(.12,when+.06);}}
/** A notice's visual lifetime never owns these long public tails. */
export function createNominationAudio(ownerId:string){
 const owner={},events=new Map<string,{id:string;at:number}>();nominationOwners.add(owner);let disposed=false,initialized=false,lastEpoch:number|string|undefined,previewKey='';
 const cancel=()=>{for(const row of events.values())cancelEventAudio(row.id);};
 const interrupt=(now:number)=>{cancel();for(const [key,row]of events)if(row.at>now)events.delete(key);};
 return {
  update(list:NominationSoundEvent[],now:number,options:{paused?:boolean;epoch?:number|string}={}){
   if(disposed)return;const initial=!initialized;initialized=true;if(lastEpoch!==undefined&&lastEpoch!==options.epoch)interrupt(now);lastEpoch=options.epoch;
   const blocked=options.paused||!allowed('nomination');if(blocked)interrupt(now);
   for(const event of list){const sample=nominationSound(event.kind,event.outcome),at=event.startsAt;if(!sample||!event.id||typeof at!=='number'||!Number.isFinite(at)||events.has(event.id))continue;
    if(at>now+1500)continue;const id='nomination:'+ownerId+':'+event.id;
    if(initial&&at<now||at<now-500||blocked){if(at<=now)events.set(event.id,{id,at});continue;}
    events.set(event.id,{id,at});sampleAt(id,'full', 'candidate:'+sample,Math.max(0,at-now),'nomination',1,.52,0,500,false,(_buffer,when)=>duckNominationTails(id,when));
   }
  },
  preview(event:NominationSoundEvent,elapsed:number,options:AudioPlayback={}){
   if(disposed)return;const sample=nominationSound(event.kind,event.outcome),id='nomination:'+ownerId+':'+event.id,key=String(event.id)+':'+String(options.seekKey??0);
   if(key!==previewKey){cancel();previewKey=key;events.clear();}events.set(event.id??'',{id,at:0});
   if(options.paused||!allowed('nomination')){cancelEventAudio(id);return;}if(!sample||elapsed<0||elapsed>=nominationSoundDuration(event.kind,event.outcome))return;
   sampleAt(id,'preview:'+(epochs.get(id)??0),'candidate:'+sample,0,'nomination',options.rate??1,.52,elapsed/1000,150);
  },
  interrupt,
  dispose(){if(disposed)return;disposed=true;cancel();nominationOwners.delete(owner);},
 };
}
export interface BallotAudioWindow {id:string;startsAt:number;endsAt:number}
/** Offsets and the hard end are mapped from the current authoritative clock, never an 8s UI timer. */
export function createBallotCountdownAudio(ownerId:string){
 let disposed=false,current:{key:string;id:string;window:BallotAudioWindow;pending:boolean;scheduled:boolean;deadline:number;generation:number;retryAfter:number}|undefined,generation=0;
 let anchor={now:0,audio:0},lastEpoch:number|string|undefined;
 const cancel=()=>{generation++;if(current){cancelOwnerEvent(current.id);current.pending=false;current.scheduled=false;current.retryAfter=0;}};
 const finished=new Set<string>();
 const update=(window:BallotAudioWindow|undefined,now:number,options:{paused?:boolean;epoch?:number|string;retry?:boolean}={})=>{
  if(disposed)return;const audio=ctx;anchor={now,audio:audio?.currentTime??0};
  const valid=window&&Number.isFinite(window.startsAt)&&Number.isFinite(window.endsAt)&&window.endsAt-window.startsAt===8000,key=valid?window.id+':'+window.startsAt+':'+window.endsAt:'';
  if(current?.key!==key){cancel();current=valid?{key,id:'ballot:'+ownerId+':'+key,window,pending:false,scheduled:false,deadline:0,generation,retryAfter:0}:undefined;}
  if(!current)return;
  if(now>=current.window.endsAt){cancel();finished.add(key);return;}
  if(options.paused||!allowed('ballot')){cancel();lastEpoch=options.epoch;return;}
  if(finished.has(key)||!audio)return;
  const deadline=audio.currentTime+(current.window.endsAt-now)/1000;
  if(current.scheduled&&(lastEpoch!==options.epoch||Math.abs(deadline-current.deadline)>.12))cancel();lastEpoch=options.epoch;
  if(current.pending||current.scheduled||!options.retry&&now<current.retryAfter)return;current.pending=true;const request=++generation,row=current;
  void load('candidate:A03').then(()=>{
   if(disposed||current!==row||request!==generation||!allowed('ballot'))return;
   const liveNow=anchor.now+(audio.currentTime-anchor.audio)*1000,offset=Math.max(0,(liveNow-row.window.startsAt)/1000),delay=Math.max(0,row.window.startsAt-liveNow);
   if(liveNow>=row.window.endsAt){row.pending=false;finished.add(key);return;}
   row.deadline=audio.currentTime+(row.window.endsAt-liveNow)/1000;
   sampleAt(row.id,'segment:'+request,'candidate:A03',delay,'ballot',1,.48,offset,120,false,(_buffer,_when,source)=>{if(disposed||current!==row||request!==generation){try{source.stop();}catch{}return;}row.pending=false;row.scheduled=true;source.stop(row.deadline);});
  }).catch(()=>{if(current===row&&request===generation){row.pending=false;row.retryAfter=anchor.now+(audio.currentTime-anchor.audio)*1000+1000;}});
 };
 return {update,interrupt:cancel,dispose(){disposed=true;cancel();current=undefined;}};
}
