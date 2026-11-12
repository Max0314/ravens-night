import {experienceTiming,type ExperienceKind,type PresentationVersion,type PrivateSceneDescriptor} from '@ravens/contracts';
import {privateAudioAllowed} from '../participation-audio.js';
type Scope='public'|'private'|'ui'|'book';
export interface AudioPlayback {rate?:number;outcome?:string|undefined;resultVisible?:boolean;resume?:boolean}
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
 const version=sample.startsWith('v1:')?'v1':'v2',name=sample.replace(/^v1:/,'');
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
function sampleAt(id:string,cue:string,sample:string,delay:number,scope:Scope,rate=1,volume=.6,offset=0,lateWindow=100,bell=false){
 const audio=ctx;if(!audio||!allowed(scope)||delay<0)return;
 if(!epochs.has(id))epochs.set(id,0);const epoch=epochs.get(id),at=audio.currentTime+delay/1000;
 if(!claim(id+':'+cue,at))return;
 void load(sample).then(buffer=>{
  if(ctx!==audio||epochs.get(id)!==epoch||!allowed(scope)||(audio.currentTime-at)*1000>lateWindow||offset>=buffer.duration)return;
  const vocal=/^(hurt-|cough-|butler-voice)/.test(sample),group=(s:Playing)=>/^(hurt-|cough-|butler-voice)/.test(s.sample);const own=[...sources].filter(([,s])=>s.scope===scope&&!s.bell&&group(s)===vocal&&s.at<=at&&s.end>at);if(own.length>=(scope==='ui'||scope==='book'||vocal?1:3))stop(own[0]![0],own[0]![1]);
  if(!bell&&scope!=='ui'&&scope!=='book')for(const row of sources.values())if(row.bell){const duckAt=Math.max(at,audio.currentTime);row.gain.gain.setValueAtTime(row.gain.gain.value,duckAt);row.gain.gain.linearRampToValueAtTime(.035,duckAt+.04);row.gain.gain.linearRampToValueAtTime(.2,duckAt+.34);}
  const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;source.connect(gain);gain.connect(destination(audio));sources.set(source,{id,scope,at,sample,gain,bell,end:at+(buffer.duration-offset)/rate});source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};source.start(Math.max(audio.currentTime,at),offset);
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
export function scheduleCue(id:string,kind:string,elapsed:number,version:PresentationVersion=1,emptyExecution=false,options:AudioPlayback={}){
 if(!allowed('public'))return;const rate=options.rate??1,timing=experienceTiming(kind as ExperienceKind,version);
 if((kind==='DAWN'||kind==='NIGHT_FALLS')&&currentBell!==id){if(currentBell)cancelEventAudio(currentBell);currentBell=id;}
 for(const [at,cue]of timing.cues){const delay=(at-elapsed)/rate;if(delay<0)continue;
  if(cue==='bell'||cue==='dawn'||cue.startsWith('night-bell')||cue.startsWith('dawn-bell'))sampleAt(id,'base:'+at,kind==='DAWN'?'dawn-bell':'night-bell',delay,'public',rate,.3,0,100,true);
  else if(cue==='shot'){sampleAt(id,'base:shot:'+at,version<4?'v1:shot':'shot',delay,'public',rate,.8);sampleAt(id,'base:glass:'+at,version<4?'v1:glass':'glass-hit',delay,'public',rate,.5);if(version===4)sampleAt(id,'base:shards:'+at,'glass-shards',delay+80,'public',rate,.35);}
  else if(cue==='mechanism')sampleAt(id,'base:mechanism:'+at,version<4?'v1:impact':'guillotine-impact',delay,'public',rate,.75);
  else if(cue==='tension'||cue==='frame')sampleAt(id,'base:'+at,'guillotine-tension',delay,'public',rate,.3);
  else if(cue==='unlock'||cue==='release'||cue==='blade')sampleAt(id,'base:'+at,'guillotine-'+(cue==='release'?'unlock':cue),delay,'public',rate,.45);
  else if(cue==='cock')sampleAt(id,'base:'+at,version<4?'v1:impact':'gun-cock',delay,'public',rate,.3);
  else if(cue==='nominate'||cue==='paper')sampleAt(id,'base:'+at,version===4?(cue==='nominate'?'nomination':'vote-stamp'):(cue==='nominate'?'ui-open':'ui-success'),delay,'public',rate,.2);
 }
 if(emptyExecution)sampleAt(id,'empty:wind','guillotine-wind',Math.max(0,300-elapsed)/rate,'public',rate,.4);
 const fresh=elapsed>=timing.resultOffset&&elapsed-timing.resultOffset<=500;
 if(options.resultVisible&&options.outcome==='DEATH'&&['SHOT','EXECUTION','DAWN'].includes(kind)&&fresh&&!emptyExecution)sampleAt(id,'outcome:death',version<4?'v1:scream':(kind==='DAWN'?'hurt-night':'hurt-shot')+'-'+(1+hash(id)%3),0,'public',rate,.58,0,500-(elapsed-timing.resultOffset));
 if(version===4&&options.resultVisible&&options.outcome==='DEATH'&&fresh&&!emptyExecution&&['SHOT','EXECUTION','DAWN'].includes(kind)){sampleAt(id,'outcome:blood','blood-impact',0,'public',rate,.35,0,500);if(kind==='DAWN')sampleAt(id,'outcome:bone','bone-crack',100,'public',rate,.25,0,500);}
 if(kind==='GAME_OVER'&&options.resultVisible&&fresh&&(options.outcome==='GOOD'||options.outcome==='EVIL'))sampleAt(id,'outcome:finale',(version<4?'v1:':'')+(options.outcome==='GOOD'?'good':'evil'),0,'public',rate,.78,0,500-(elapsed-timing.resultOffset));
}
export function schedulePrivateCue(id:string,kind:string,elapsed:number,options:AudioPlayback={}){const sample=({POISON:'poison',PROTECT:'shield',BUTLER:'butler',DEMON:'demon'} as Record<string,string>)[kind];if(sample)sampleAt('private:'+id,'base:ritual','v1:'+sample,(120-elapsed)/(options.rate??1),'private',options.rate??1,.74);}
export function scheduleRoleCue(scene:PrivateSceneDescriptor,elapsed:number,options:AudioPlayback={}){
 const id='private:'+scene.id,rate=options.rate??1,role=scene.themeRoleId;
 const theme=scene.kind==='ROLE_CHANGE'?'scarlet_woman':role;const cues:Array<[number,string,number]>=[[500,'role-'+theme,.5]];
 if(scene.kind==='ACTION_SUBMITTED'){
  if(role==='butler')cues.push([1450,'butler-voice',.74]);
  if(role==='poisoner')cues.push([750,'poison-bottle',.55],[1100,'poison-bubbles',.4],[1700,'cough-'+(1+hash(scene.id)%3),.35]);
  if(role==='imp')cues.push([600,'wing-flap',.55],[850,'wing-air',.4],[1100,'wing-root',.5],[1450,'slash-left',.6],[1750,'slash-right',.6]);
 }
 for(const [at,sample,volume]of cues){const late=elapsed>at;if(late&&!options.resume)continue;const offset=late?(elapsed-at)/1000:0;sampleAt(id,(options.resume?'resume:'+epochs.get(id)+':':'')+at+':'+sample,sample,Math.max(0,(at-elapsed)/rate),'private',rate,volume,offset,150);}
}
export function auditionSample(sample:string){if(!/^[a-z0-9_-]+$/.test(sample))return;sampleAt('ui:audition:'+(++semanticSeq),'audition',sample,0,'ui',1,.5,0,500);}
