import {experienceTiming} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {lobbyMusicTrack} from './LobbyMusic.js';
import {getEffectsAudioContext,unlockEffectsAudio} from './experience-audio.js';
export type ScoreTrack='M19'|'M15'|'M18'|'M01';
export const scoreTracks:Record<ScoreTrack,string>={M19:lobbyMusicTrack.src,M15:'/audio/music/v2/background-m15.mp3',M18:'/audio/music/v2/background-m18.mp3',M01:'/audio/music/v2/background-m01.mp3'};
/** Only public chronology/outcomes enter this selector; never a private room view. */
export function gameScoreTrack(game:GameView|undefined,now:number):ScoreTrack{
 if(!game||game.phase==='ABORTED')return'M19';
 const events=game.events.filter(e=>typeof e.startsAt==='number'&&e.startsAt<=now);
 const finale=events.find(e=>e.kind==='GAME_OVER'&&(e.outcome==='GOOD'||e.outcome==='EVIL')&&now>=e.startsAt!+experienceTiming('GAME_OVER',e.timingVersion??game.presentationVersion??1).resultOffset);
 const winner=finale?.outcome??(game.revealComplete?game.winner:undefined);
 if(winner==='GOOD')return'M01';if(winner==='EVIL')return'M19';
 const nights=events.filter(e=>e.kind==='NIGHT_FALLS');
 if(nights.some(e=>e.day!==undefined&&e.day>=2)||nights.length>=3||game.day>=3||game.phase==='OTHER_NIGHT'&&game.day>=2)return'M19';
 const transition=events.filter(e=>e.kind==='DAWN'||e.kind==='NIGHT_FALLS').sort((a,b)=>a.startsAt!-b.startsAt!||a.seq-b.seq).at(-1);
 if(transition?.kind==='DAWN')return'M15';
 if(transition?.kind==='NIGHT_FALLS')return(transition.day??game.day)===0?'M19':'M18';
 if(game.phase==='ROLE_REVEAL'||game.phase==='FIRST_NIGHT')return'M19';
 return game.phase==='OTHER_NIGHT'?'M18':'M15';
}
type Entry={audio:HTMLAudioElement;route?:{context:AudioContext;source:MediaElementAudioSourceNode;gain:GainNode};loopHead:boolean;lastTime:number|undefined;pending:boolean;generation:number;timer:ReturnType<typeof setTimeout>|undefined;cleanup:()=>void};
export interface ScorePlayback {track:ScoreTrack;active:boolean;ducked:boolean;context:string;volume?:number}
/** One owner, one cached HTML player per track; full music never enters WebAudio's decoded cache. */
export function createGameScorePlayer(report:(message:string)=>void=()=>{}){
 const entries=new Map<ScoreTrack,Entry>();let state:ScorePlayback={track:'M19',active:false,ducked:false,context:''},disposed=false,ready:ScoreTrack|undefined;
 let ramp:ReturnType<typeof setInterval>|undefined,transition:{to:ScoreTrack;at:number;from:Map<ScoreTrack,number>}|undefined,duckRamp:{at:number;from:number;to:number}|undefined,duckGain=1;
 let suspended:{at:number;track:ScoreTrack;context:string;ducked:boolean;ready:ScoreTrack|undefined;tracks:ScoreTrack[]}|undefined;
 const weights=new Map<ScoreTrack,number>();
 const clearRamp=()=>{clearInterval(ramp);ramp=undefined;};
 const pause=(entry:Entry)=>{entry.generation++;entry.pending=false;clearTimeout(entry.timer);entry.timer=undefined;if(ready&&entries.get(ready)===entry)ready=undefined;if(entry.route)entry.route.gain.gain.value=0;entry.audio.pause();};
 const stop=()=>{clearRamp();transition=undefined;duckRamp=undefined;suspended=undefined;ready=undefined;for(const entry of entries.values())pause(entry);};
 const suspend=(previous:ScorePlayback)=>{clearRamp();suspended={at:Date.now(),track:previous.track,context:previous.context,ducked:previous.ducked,ready,tracks:[...entries].filter(([id,e])=>!e.audio.paused&&(weights.get(id)??0)>0).map(([id])=>id)};for(const e of entries.values())pause(e);};
 const loopGain=(e:Entry)=>{
  const {duration,currentTime}=e.audio;
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(currentTime)||currentTime<0){e.loopHead=false;e.lastTime=undefined;return 1;}
  const span=Math.min(1.4,duration/2);
  // Native loop owns the playhead. Only a tail-to-head wrap enables the head envelope.
  if(e.lastTime!==undefined&&e.lastTime>=duration-span&&currentTime<span&&currentTime<e.lastTime)e.loopHead=true;
  if(currentTime>=span)e.loopHead=false;
  e.lastTime=currentTime;
  const p=Math.max(0,Math.min(1,(duration-currentTime)/span,e.loopHead?currentTime/span:1));
  return .5-.5*Math.cos(Math.PI*p);
 };
 const tick=()=>{
  if(transition){const p=Math.min(1,(Date.now()-transition.at)/2000);for(const [id,e]of entries){const from=transition.from.get(id)??0;weights.set(id,from+((id===transition.to?1:0)-from)*p);if(p===1&&id!==transition.to)pause(e);}if(p===1)transition=undefined;}
  if(duckRamp){const p=Math.min(1,(Date.now()-duckRamp.at)/240);duckGain=duckRamp.from+(duckRamp.to-duckRamp.from)*p;if(p===1)duckRamp=undefined;}
  let playing=false;
  for(const [id,e]of entries)if(e.route){const live=state.active&&!e.audio.paused&&!e.audio.muted&&e.route.context.state==='running';playing||=live;e.route.gain.gain.value=live?Math.max(0,Math.min(1,(state.volume??.8)*(weights.get(id)??0)*duckGain*loopGain(e))):0;}
  if(!transition&&!duckRamp&&!playing)clearRamp();
 };
 const animate=()=>{if(!ramp)ramp=setInterval(tick,40);tick();};
 const fade=()=>{transition={to:state.track,at:Date.now(),from:new Map(weights)};animate();};
 const duck=()=>{duckRamp={at:Date.now(),from:duckGain,to:state.ducked?.325:1};animate();};
 const accept=(id:ScoreTrack,e:Entry)=>{
  if(disposed||!state.active){e.audio.pause();return;}if(id!==state.track&&!(weights.get(id)??0)){e.audio.pause();return;}
  if(e.audio.paused||e.audio.muted||e.audio.readyState<2||e.route?.context.state!=='running')return;
  if(id!==state.track){clearTimeout(e.timer);e.timer=undefined;e.pending=false;animate();return;}
  clearTimeout(e.timer);e.timer=undefined;e.pending=false;const changed=ready!==id;ready=id;report('');if(changed)fade();else animate();
 };
 function entry(id:ScoreTrack){
  const existing=entries.get(id);if(existing)return existing;
  const audio=new Audio(scoreTracks[id]);audio.loop=true;audio.preload='auto';audio.muted=true;
  const e:Entry={audio,loopHead:false,lastTime:undefined,pending:false,generation:0,timer:undefined,cleanup:()=>{}};
  const playing=()=>accept(id,e),failed=()=>{if(disposed||id!==state.track)return;pause(e);report('音乐无法加载，请轻点音符重试；可继续游戏');};
  const waiting=()=>{if(id!==state.track||!state.active)return;e.pending=true;watch(id,e,e.generation);};
  const stalled=()=>{if(audio.paused||audio.readyState<3)waiting();};
  for(const [name,fn]of Object.entries({playing,error:failed,waiting,stalled}))audio.addEventListener(name,fn);
  e.cleanup=()=>{for(const [name,fn]of Object.entries({playing,error:failed,waiting,stalled}))audio.removeEventListener(name,fn);};entries.set(id,e);weights.set(id,0);audio.load();return e;
 }
 function route(id:ScoreTrack,e:Entry){
  if(e.route)return true;
  const context=getEffectsAudioContext();if(!context){report('音乐尚未解锁，请轻点音符重试；可继续游戏');return false;}
  try{
   const source=context.createMediaElementSource(e.audio),gain=context.createGain();gain.gain.value=0;source.connect(gain);gain.connect(context.destination);e.route={context,source,gain};
   const resumed=()=>accept(id,e),cleanup=e.cleanup;context.addEventListener('statechange',resumed);
   e.cleanup=()=>{cleanup();context.removeEventListener('statechange',resumed);source.disconnect();gain.disconnect();};e.audio.muted=false;return true;
  }catch{e.audio.pause();report('当前浏览器无法控制音乐音量，请重试；可继续游戏');return false;}
 }
 function watch(id:ScoreTrack,e:Entry,generation:number){clearTimeout(e.timer);e.timer=setTimeout(()=>{if(disposed||generation!==e.generation||!e.pending)return;pause(e);if(id===state.track)report('音乐尚未开始，请轻点音符重试；可继续游戏');},8000);}
 function attempt(gesture=false,id=state.track){
  if(disposed||!state.active)return false;
  // Creation/resume starts before play in this same stack, including a fresh retry gesture.
  if(gesture||getEffectsAudioContext()?.state!=='running')void unlockEffectsAudio();
  const e=entry(id);if(!route(id,e))return false;
  if(!e.audio.paused&&!e.pending){accept(id,e);return false;}if(e.pending&&!gesture)return false;
  const generation=++e.generation;e.pending=true;if(e.audio.error)e.audio.load();watch(id,e,generation);
  try{void e.audio.play().then(()=>{if(disposed||!state.active){e.audio.pause();return;}if(generation===e.generation)accept(id,e);}).catch(()=>{if(disposed||generation!==e.generation)return;e.pending=false;clearTimeout(e.timer);if(id===state.track)report('浏览器尚未开启音乐，请轻点音符重试；可继续游戏');});}
  catch{e.pending=false;clearTimeout(e.timer);if(id===state.track)report('音乐无法加载，请轻点音符重试；可继续游戏');}return true;
 }
 return{
  update(next:ScorePlayback){if(disposed)return false;const previous=state;state=next;
   if(!state.active){if(previous.active)suspend(previous);else if(!suspended)duckGain=state.ducked?.325:1;return false;}
   if(!previous.active&&suspended){const saved=suspended;suspended=undefined;
    if(saved.track===state.track&&saved.context===state.context){const delay=Date.now()-saved.at;if(transition)transition.at+=delay;if(duckRamp)duckRamp.at+=delay;ready=saved.ready;if(saved.ducked!==state.ducked)duck();for(const id of saved.tracks)if(id!==state.track&&(weights.get(id)??0)>0)attempt(false,id);return attempt();}
    transition=undefined;duckRamp=undefined;ready=undefined;duckGain=state.ducked?.325:1;for(const [id,e]of entries)if(id!==state.track){pause(e);weights.set(id,0);}return attempt();
   }
   if(previous.ducked!==next.ducked)duck();
   if(previous.context!==next.context){for(const [id,e]of entries)if(id!==next.track){pause(e);weights.set(id,0);}transition=undefined;}
   if(previous.track!==next.track){for(const [id,e]of entries)if(id!==next.track&&e.pending)pause(e);return attempt();}
   else if(!previous.active)return attempt();else if(previous.context!==next.context&&ready===next.track)fade();else if(previous.volume!==next.volume)tick();return false;
  },
  gesture:()=>attempt(true),
  dispose(){disposed=true;stop();for(const e of entries.values())e.cleanup();entries.clear();},
 };
}
