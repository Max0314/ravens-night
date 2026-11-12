import {experienceTiming,type ExperienceKind,type PresentationVersion} from '@ravens/contracts';
import {privateAudioAllowed} from '../participation-audio.js';
type Scope='public'|'private';
type Sample='shot'|'glass'|'impact'|'scream'|'poison'|'shield'|'butler'|'demon'|'good'|'evil';
export interface AudioPlayback{rate?:number;outcome?:string|undefined;resultVisible?:boolean;}
let ctx:AudioContext|undefined;
let output:GainNode|undefined;
let unlockFlight:Promise<void>|undefined;
function destination(audio:AudioContext){if(!output){output=audio.createGain();output.gain.value=.72;output.connect(audio.destination);}return output;}
let enabled=readPreference();
let status='';
const buffers=new Map<Sample,Promise<AudioBuffer>>(),played=new Map<string,number>(),epochs=new Map<string,number>();
const sources=new Map<AudioScheduledSourceNode,{id:string;scope:Scope;at:number}>();
function readPreference(){try{return localStorage.getItem('ravens_effects_audio')==='on';}catch{return false;}}
export function effectsAudioEnabled(){return enabled;}
export function effectsAudioStatus(){return status;}
function report(value:string){status=value;window.dispatchEvent(new Event('ravens:audio-status'));}
export async function unlockEffectsAudio(){
 if(typeof window==='undefined')return;
 const Audio=window.AudioContext??(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!Audio){report('当前浏览器不支持演出音效');return;}
 ctx??=new Audio();
 if(ctx.state==='running'){report('');return;}
 if(unlockFlight)return unlockFlight;
 const audio=ctx;
 unlockFlight=(async()=>{try{await audio.resume();report(audio.state==='running'?'':'点击开启声音后重试');if(audio.state==='running')window.dispatchEvent(new Event('ravens-effects-unlocked'));}catch{report('声音尚未解锁，请再次点击开启');}})().finally(()=>{unlockFlight=undefined;});
 return unlockFlight;
}
export async function enableEffectsAudio(value=true){
 enabled=value;try{localStorage.setItem('ravens_effects_audio',value?'on':'off');}catch{/* Keep this tab's choice. */}
 window.dispatchEvent(new Event('ravens-effects-audio'));
 if(!value){silenceEffects();return;}
 await unlockEffectsAudio();
 if(ctx?.state==='running')void Promise.allSettled((['shot','glass','impact','scream','poison','shield','butler','demon','good','evil'] as Sample[]).map(load));
}
function load(sample:Sample):Promise<AudioBuffer>{
 let pending=buffers.get(sample);if(pending)return pending;
 pending=(async()=>{const response=await fetch(`/audio/effects/v1/${sample}.mp3`);if(!response.ok)throw Error('音效资源无法载入');const bytes=await response.arrayBuffer();if(!ctx)throw Error('声音尚未解锁');return ctx.decodeAudioData(bytes);})().catch(error=>{buffers.delete(sample);report('部分音效未加载，请检查连接后重试');throw error;});
 buffers.set(sample,pending);return pending;
}
function keyFor(id:string,cue:string){return `${id}:${cue}`;}
function claim(key:string,time:number){if(played.has(key))return false;played.set(key,time);if(played.size>800)played.delete(played.keys().next().value!);return true;}
function track(source:AudioScheduledSourceNode,id:string,scope:Scope,at:number){sources.set(source,{id,scope,at});source.onended=()=>{sources.delete(source);source.disconnect();};}
export function cancelEventAudio(id:string){
 epochs.set(id,(epochs.get(id)??0)+1);
 for(const [source,record]of sources){if(record.id!==id)continue;try{source.stop();}catch{/* Finished. */}sources.delete(source);}
 for(const [key,time]of played)if(key.startsWith(id+':')&&time>(ctx?.currentTime??0))played.delete(key);
}
export function silenceEffects(scope?:Scope){
 const ids=new Set<string>();for(const [source,record]of sources){if(scope&&record.scope!==scope)continue;ids.add(record.id);try{source.stop();}catch{/* Finished. */}sources.delete(source);}
 // Also cancel pending decodes, not only already created sources.
 for(const id of epochs.keys())if(!scope||scope==='private'&&id.startsWith('private:'))ids.add(id);
 for(const id of ids)cancelEventAudio(id);
}
if(typeof window!=='undefined')window.addEventListener('ravens:participation-audio',()=>{if(!privateAudioAllowed())silenceEffects('private');});
function sampleAt(id:string,cue:string,sample:Sample,delay:number,scope:Scope,rate:number,volume:number,lateWindow=80){
 const audio=ctx;if(!enabled||audio?.state!=='running'||scope==='private'&&!privateAudioAllowed()||delay<0)return;
 if(!epochs.has(id))epochs.set(id,0);const epoch=epochs.get(id),at=audio.currentTime+delay/1000;
 const key=keyFor(id,cue);if(!claim(key,at))return;
 void load(sample).then(buffer=>{
  if(!enabled||ctx!==audio||audio.state!=='running'||epochs.get(id)!==epoch||scope==='private'&&!privateAudioAllowed())return;
  if((audio.currentTime-at)*1000>lateWindow)return;
  const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;source.connect(gain);gain.connect(destination(audio));track(source,id,scope,at);source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};source.start(Math.max(audio.currentTime,at));
 }).catch(()=>{/* The interaction and its visuals remain available. */});
}
function bellAt(id:string,cue:string,delay:number,rate:number){
 const audio=ctx;if(!enabled||audio?.state!=='running'||delay<0)return;const at=audio.currentTime+delay/1000;if(!claim(keyFor(id,cue),at))return;
 for(const [i,multiple]of [1,2.76,5.4].entries()){const source=audio.createOscillator(),gain=audio.createGain();source.frequency.value=174*multiple*rate;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.035/(i+1),at+.005);gain.gain.exponentialRampToValueAtTime(.0001,at+1.5/rate);source.connect(gain);gain.connect(destination(audio));track(source,id,'public',at);source.start(at);source.stop(at+1.6/rate);}
}
function windAt(id:string,cue:string,delay:number,rate:number){
 const audio=ctx;if(!enabled||audio?.state!=='running'||delay<0)return;const at=audio.currentTime+delay/1000;if(!claim(keyFor(id,cue),at))return;
 const buffer=audio.createBuffer(1,Math.round(audio.sampleRate*1.3),audio.sampleRate),data=buffer.getChannelData(0);let last=0;
 for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.03)/1.02;data[i]=last*Math.sin(i/data.length*Math.PI);}
 const source=audio.createBufferSource(),gain=audio.createGain();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=.16;source.connect(gain);gain.connect(destination(audio));track(source,id,'public',at);source.start(at);
}
export function scheduleCue(id:string,kind:string,elapsed:number,version:PresentationVersion=1,emptyExecution=false,options:AudioPlayback={}){
 if(!enabled||!ctx||ctx.state!=='running'||document.hidden)return;
 const rate=options.rate??1,timing=experienceTiming(kind as ExperienceKind,version);
 for(const [at,cue]of timing.cues){
  const delay=(at-elapsed)/rate;if(delay<0)continue;
  if(cue==='bell'||cue==='dawn')bellAt(id,`base:${at}`,delay,rate);
  else if(cue==='shot'){sampleAt(id,`base:shot:${at}`,'shot',delay,'public',rate,.8);sampleAt(id,`base:glass:${at}`,'glass',delay,'public',rate,.5);}
  else if(cue==='mechanism'){if(emptyExecution)windAt(id,`base:wind:${at}`,delay,rate);else sampleAt(id,`base:mechanism:${at}`,'impact',delay,'public',rate,.8);}
  else if(cue==='cock'||cue==='paper'||cue==='frame'||cue==='nominate'||cue==='tail')sampleAt(id,`base:${cue}:${at}`,'impact',delay,'public',rate,cue==='paper'||cue==='nominate'?.16:cue==='tail'?.12:.22);
 }
 const fresh=elapsed>=timing.resultOffset&&elapsed-timing.resultOffset<=500;
 if(options.resultVisible&&options.outcome==='DEATH'&&['SHOT','EXECUTION','DAWN'].includes(kind)&&fresh&&!emptyExecution)sampleAt(id,'outcome:death','scream',0,'public',rate,.58,500-(elapsed-timing.resultOffset));
 if(kind==='GAME_OVER'&&options.resultVisible&&fresh&&(options.outcome==='GOOD'||options.outcome==='EVIL'))sampleAt(id,'outcome:finale',options.outcome==='GOOD'?'good':'evil',0,'public',rate,.78,500-(elapsed-timing.resultOffset));
}
export function schedulePrivateCue(id:string,kind:string,elapsed:number,options:AudioPlayback={}){
 if(!privateAudioAllowed()||document.hidden)return;
 const sample:Sample|undefined=({POISON:'poison',PROTECT:'shield',BUTLER:'butler',DEMON:'demon'} as Record<string,Sample>)[kind];
 if(!sample)return;
 sampleAt('private:'+id,'base:ritual',sample,(120-elapsed)/(options.rate??1),'private',options.rate??1,.74);
}
