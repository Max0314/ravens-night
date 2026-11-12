import {experienceTiming,type ExperienceKind,type PresentationVersion,type PrivateSceneDescriptor} from '@ravens/contracts';
import {privateAudioAllowed} from '../participation-audio.js';
import {cinematicTiming as contact} from './cinematic-timing.js';
type Scope='public'|'private'|'ui'|'book';
export interface AudioPlayback {rate?:number;outcome?:string|undefined;resultVisible?:boolean;resume?:boolean;mode?:'START'|'RESUME'|'SEEK';paused?:boolean;seekKey?:number|string;playbackId?:string}
export type SemanticCue='press'|'select'|'open'|'close'|'success'|'error'|'paper-lift'|'paper-turn';
interface Playing {id:string;scope:Scope;at:number;sample:string;gain:GainNode;bell:boolean;end:number}
let ctx:AudioContext|undefined,output:GainNode|undefined,unlockFlight:Promise<void>|undefined;
let enabled=readPreference(),status='',semanticSeq=0;
const buffers=new Map<string,Promise<AudioBuffer>>(),sizes=new Map<string,number>(),played=new Map<string,number>(),epochs=new Map<string,number>();
const sources=new Map<AudioBufferSourceNode,Playing>();
function readPreference(){try{return localStorage.getItem('ravens_effects_audio')==='on';}catch{return false;}}
function destination(audio:AudioContext){if(!output){output=audio.createGain();output.gain.value=.72;if(typeof audio.createDynamicsCompressor==='function'){const limit=audio.createDynamicsCompressor();limit.threshold.value=-1;limit.knee.value=0;limit.ratio.value=20;limit.attack.value=.002;limit.release.value=.1;output.connect(limit);limit.connect(audio.destination);}else output.connect(audio.destination);}return output;}
export function effectsAudioEnabled(){return enabled;}
export function effectsAudioStatus(){return status;}
function report(value:string){status=value;window.dispatchEvent(new Event('ravens:audio-status'));}
export async function unlockEffectsAudio(){
 if(typeof window==='undefined')return;
 const Audio=window.AudioContext??(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!Audio){report('当前浏览器不支持演出音效');return;}ctx??=new Audio();
 if(ctx.state==='running'){report('');return;}if(unlockFlight)return unlockFlight;const audio=ctx;
 unlockFlight=(async()=>{try{await audio.resume();report(audio.state==='running'?'':'点击开启声音后重试');if(audio.state==='running')window.dispatchEvent(new Event('ravens-effects-unlocked'));}catch{report('声音尚未解锁，请再次点击开启');}})().finally(()=>{unlockFlight=undefined;});return unlockFlight;
}
export async function enableEffectsAudio(value=true){enabled=value;try{localStorage.setItem('ravens_effects_audio',value?'on':'off');}catch{/* Tab preference remains. */}window.dispatchEvent(new Event('ravens-effects-audio'));if(!value){silenceEffects();return;}await unlockEffectsAudio();}
function allowed(scope:Scope){return enabled&&ctx?.state==='running'&&!document.hidden&&(scope!=='private'||privateAudioAllowed());}
let activeLoads=0;const loadWaiters:Array<()=>void>=[];
function takeLoadSlot(){if(activeLoads<4){activeLoads++;return Promise.resolve();}return new Promise<void>(resolve=>loadWaiters.push(resolve));}
function releaseLoadSlot(){const next=loadWaiters.shift();if(next)next();else activeLoads--;}
function load(sample:string):Promise<AudioBuffer>{
 const old=buffers.get(sample);if(old){buffers.delete(sample);buffers.set(sample,old);return old;}
 const prefix=sample.match(/^(v[134]):/),version=prefix?.[1]??'v2',name=sample.replace(/^v[134]:/,'');
 const pending=(async()=>{await takeLoadSlot();try{const response=await fetch('/audio/effects/'+version+'/'+name+'.mp3');if(!response.ok)throw Error('missing audio');const data=await response.arrayBuffer();if(!ctx)throw Error('locked');const buffer=await ctx.decodeAudioData(data);sizes.set(sample,(buffer.length??0)*(buffer.numberOfChannels??1)*4);let bytes=[...sizes.values()].reduce((a,b)=>a+b,0);for(const [key]of buffers){if(bytes<=24*1024*1024)break;if(key===sample||[...sources.values()].some(s=>s.sample===key))continue;bytes-=sizes.get(key)??0;sizes.delete(key);buffers.delete(key);}return buffer;}finally{releaseLoadSlot();}})().catch(error=>{buffers.delete(sample);sizes.delete(sample);report('部分音效未加载，请检查连接后重试');throw error;});buffers.set(sample,pending);return pending;
}
function claim(key:string,at:number){if(played.has(key))return false;played.set(key,at);if(played.size>1200)played.delete(played.keys().next().value!);return true;}
function stop(source:AudioBufferSourceNode,record:Playing,fade=40){const audio=ctx;if(audio){if(record.at>audio.currentTime){try{source.stop(audio.currentTime);}catch{}sources.delete(source);return;}try{record.gain.gain.setValueAtTime(record.gain.gain.value,audio.currentTime);record.gain.gain.linearRampToValueAtTime(0,audio.currentTime+fade/1000);source.stop(audio.currentTime+fade/1000);}catch{/* Ended. */}}sources.delete(source);}
export function cancelEventAudio(id:string){epochs.set(id,(epochs.get(id)??0)+1);for(const [source,row]of sources)if(row.id===id)stop(source,row);for(const [key,time]of played)if(key.startsWith(id+':')&&time>(ctx?.currentTime??0))played.delete(key);}
export function completeEventAudio(id:string){for(const [source,row]of sources)if(row.id===id&&!row.bell)stop(source,row);}
export function silenceEffects(scope?:Scope){const ids=new Set<string>();for(const [source,row]of sources)if(!scope||row.scope===scope){ids.add(row.id);stop(source,row);}for(const id of epochs.keys())if(!scope||id.startsWith(scope+':'))ids.add(id);for(const id of ids)cancelEventAudio(id);}
export function cancelSemantic(scope:'ui'|'book'){silenceEffects(scope);}
if(typeof window!=='undefined'){
 window.addEventListener('ravens:participation-audio',()=>{if(!privateAudioAllowed())silenceEffects('private');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)silenceEffects();});
 window.addEventListener('ravens:ui-feedback',event=>{const detail=(event as CustomEvent<SemanticCue|{cue:SemanticCue;scope:'ui'|'private'}>).detail,cue=typeof detail==='string'?detail:detail.cue;if(['press','select','open','close','success','error'].includes(cue))playSemantic(cue,{scope:typeof detail==='string'?'ui':detail.scope});});
}
function sampleAt(id:string,cue:string,sample:string,delay:number,scope:Scope,rate=1,volume=.6,offset=0,lateWindow=100,bell=false,onStarted?:(buffer:AudioBuffer,when:number)=>void){
 const audio=ctx;if(!audio||!allowed(scope)||delay<0)return;
 if(!epochs.has(id))epochs.set(id,0);const epoch=epochs.get(id),at=audio.currentTime+delay/1000;
 if(!claim(id+':'+cue,at))return;
 void load(sample).then(buffer=>{
  if(ctx!==audio||epochs.get(id)!==epoch||!allowed(scope)||(audio.currentTime-at)*1000>lateWindow||offset>=buffer.duration)return;
  const vocal=/^(hurt-|cough-|butler-voice)/.test(sample),group=(s:Playing)=>/^(hurt-|cough-|butler-voice)/.test(s.sample);const own=[...sources].filter(([,s])=>s.scope===scope&&!s.bell&&group(s)===vocal&&s.at<=at&&s.end>at);if(own.length>=(scope==='ui'||scope==='book'||vocal?1:3))stop(own[0]![0],own[0]![1]);
  if(!bell&&scope!=='ui'&&scope!=='book')for(const row of sources.values())if(row.bell){const duckAt=Math.max(at,audio.currentTime);row.gain.gain.setValueAtTime(row.gain.gain.value,duckAt);row.gain.gain.linearRampToValueAtTime(.035,duckAt+.04);row.gain.gain.linearRampToValueAtTime(.2,duckAt+.34);}
  const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;source.connect(gain);gain.connect(destination(audio));sources.set(source,{id,scope,at,sample,gain,bell,end:at+(buffer.duration-offset)/rate});source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};const when=Math.max(audio.currentTime,at);source.start(when,offset);onStarted?.(buffer,when);
 }).catch(()=>{/* Missing media never blocks interaction. */});
}
const hash=(id:string)=>[...id].reduce((v,c)=>(Math.imul(v,31)+c.charCodeAt(0))>>>0,0);
let previousPrivateUi='';
export function playSemantic(cue:SemanticCue,options:{variant?:number;scope?:'ui'|'book'|'private'}={}){
 const scope=options.scope??(cue.startsWith('paper-')?'book':'ui');if(!allowed(scope))return;if(scope==='private'){if(previousPrivateUi)cancelEventAudio(previousPrivateUi);}else cancelSemantic(scope);const variant=options.variant??semanticSeq;
 const sample=cue==='paper-turn'?'paper-turn-'+(1+variant%4):cue==='paper-lift'?'paper-lift-'+(1+variant%2):'ui-'+cue;
 const id=scope+':ui:'+(++semanticSeq);if(scope==='private')previousPrivateUi=id;sampleAt(id,cue,sample,0,scope,1,scope==='book'?.23:.16,0,200);
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
  else if(cue==='nominate'||cue==='paper')cueAt(at,cue+':'+at,version===4?(cue==='nominate'?'nomination':'vote-stamp'):(cue==='nominate'?'ui-open':'ui-success'),.2);
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
// Measured output MP3 peaks/onsets, recorded by the immutable v4 manifest.
const materialLead={cork:9.75,pour:24.6,chop:[10.63,10.09,10.86],coffinOpen:5.35,coffinSettle:11.45} as const;
export function roleAudioCues(scene:PrivateSceneDescriptor):RoleAudioCue[]{
 const role=scene.themeRoleId,variant=1+hash(scene.id)%4;
 // Scene kind takes priority over the role that received the envelope.
 if(scene.kind==='EVIL_START')return[[600,'paper-lift-1',.25],[1100,'paper-turn-'+variant,.38]];
 if(scene.kind==='OLD_DEMON_CONTINUATION')return[[600,'wing-air',.17]];
 if(scene.kind==='ROLE_CHANGE')return[[500,'role-scarlet_woman',.5]];
 if(role==='butler')return[[500,'role-butler',.3],[contact.butler.voice,'butler-voice',.74]];
 if(role==='poisoner')return[[contact.poison.uncork-materialLead.cork,'v4:poison-cork',.56,'transient',contact.poison.uncork],[contact.poison.pour-materialLead.pour,'v4:poison-pour',.48],[contact.poison.bubbles,'poison-bubbles',.4],...(scene.kind==='ACTION_SUBMITTED'?[[contact.poison.cough,'cough-'+(1+hash(scene.id)%3),.42] as RoleAudioCue]:[])];
 if(role==='monk'&&scene.kind==='ACTION_SUBMITTED')return[[contact.shield.cue,'v1:shield',.74,'transient',contact.shield.contact]];
 if(role==='imp'&&scene.kind==='ACTION_SUBMITTED')return[[contact.demon.flap,'wing-flap',.43,'transient'],[contact.demon.air,'wing-air',.22],[contact.demon.open,'wing-root',.32,'transient'],[contact.demon.left,'v3:slash-left',.78,'transient'],[contact.demon.right,'v3:slash-right',.78,'transient']];
 if(role==='chef')return contact.chef.map((at,i)=>[at-materialLead.chop[i]!,'v4:chef-chop-'+(i+1),.5,'transient',at]);
 if(role==='undertaker')return[[contact.coffin.start-materialLead.coffinOpen,'v4:coffin-open',.42],[contact.coffin.open-materialLead.coffinSettle,'v4:coffin-settle',.36,'transient',contact.coffin.open]];
 if(role==='librarian'||role==='spy')return[[contact.book.middle,'paper-turn-'+variant,.4]];
 return[[500,'role-'+role,.5]];
}
/** Prepare private media before its local art clock starts. Public timelines never wait. */
export async function prepareRoleAudio(scene:PrivateSceneDescriptor):Promise<void>{
 if(!enabled||!ctx||!privateAudioAllowed())return;
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
export async function auditionSample(sample:string){if(!/^(?:v[134]:)?[a-z0-9_-]+$/.test(sample)||!allowed('ui'))return;silenceEffects('ui');const id='ui:audition:'+(++semanticSeq);epochs.set(id,0);try{await load(sample);if(allowed('ui')&&epochs.get(id)===0)sampleAt(id,'audition',sample,0,'ui',1,sample==='v1:shield'?.74:.6,0,500);}catch{}}
