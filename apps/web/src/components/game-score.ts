import {experienceTiming} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {lobbyMusicTrack} from './LobbyMusic.js';
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
type Entry={audio:HTMLAudioElement;pending:boolean;generation:number;timer:ReturnType<typeof setTimeout>|undefined;cleanup:()=>void};
export interface ScorePlayback {track:ScoreTrack;active:boolean;ducked:boolean;context:string}
/** One owner, one cached HTML player per track; full music never enters WebAudio's decoded cache. */
export function createGameScorePlayer(report:(message:string)=>void=()=>{}){
 const entries=new Map<ScoreTrack,Entry>();let state:ScorePlayback={track:'M19',active:false,ducked:false,context:''},disposed=false,ready:ScoreTrack|undefined;
 let ramp:ReturnType<typeof setInterval>|undefined,transition:{to:ScoreTrack;at:number;from:Map<ScoreTrack,number>}|undefined,duckRamp:{at:number;from:number;to:number}|undefined,duckGain=.8;
 const weights=new Map<ScoreTrack,number>();
 const clearRamp=()=>{clearInterval(ramp);ramp=undefined;};
 const pause=(entry:Entry)=>{entry.generation++;entry.pending=false;clearTimeout(entry.timer);entry.timer=undefined;entry.audio.pause();};
 const stop=()=>{clearRamp();transition=undefined;duckRamp=undefined;ready=undefined;for(const entry of entries.values())pause(entry);};
 const tick=()=>{
  if(transition){const p=Math.min(1,(Date.now()-transition.at)/2000);for(const [id,e]of entries){const from=transition.from.get(id)??0;weights.set(id,from+((id===transition.to?1:0)-from)*p);if(p===1&&id!==transition.to)pause(e);}if(p===1)transition=undefined;}
  if(duckRamp){const p=Math.min(1,(Date.now()-duckRamp.at)/240);duckGain=duckRamp.from+(duckRamp.to-duckRamp.from)*p;if(p===1)duckRamp=undefined;}
  for(const [id,e]of entries)e.audio.volume=Math.max(0,Math.min(1,(weights.get(id)??0)*duckGain));
  if(!transition&&!duckRamp)clearRamp();
 };
 const animate=()=>{if(!ramp)ramp=setInterval(tick,40);tick();};
 const fade=()=>{transition={to:state.track,at:Date.now(),from:new Map(weights)};animate();};
 const duck=()=>{duckRamp={at:Date.now(),from:duckGain,to:state.ducked?.26:.8};animate();};
 const accept=(id:ScoreTrack,e:Entry)=>{
  if(disposed||!state.active){e.audio.pause();return;}if(id!==state.track){if(!(weights.get(id)??0))e.audio.pause();return;}
  if(e.audio.paused||e.audio.muted||e.audio.readyState<2)return;
  clearTimeout(e.timer);e.timer=undefined;e.pending=false;const changed=ready!==id;ready=id;report('');if(changed)fade();
 };
 function entry(id:ScoreTrack){
  const existing=entries.get(id);if(existing)return existing;
  const audio=new Audio(scoreTracks[id]);audio.loop=true;audio.preload='auto';audio.volume=0;audio.muted=false;
  const e:Entry={audio,pending:false,generation:0,timer:undefined,cleanup:()=>{}};
  const playing=()=>accept(id,e),failed=()=>{if(disposed||id!==state.track)return;pause(e);report('音乐无法加载，请轻点音符重试；可继续游戏');};
  const waiting=()=>{if(id!==state.track||!state.active)return;e.pending=true;watch(id,e,e.generation);};
  const stalled=()=>{if(audio.paused||audio.readyState<3)waiting();};
  for(const [name,fn]of Object.entries({playing,error:failed,waiting,stalled}))audio.addEventListener(name,fn);
  e.cleanup=()=>{for(const [name,fn]of Object.entries({playing,error:failed,waiting,stalled}))audio.removeEventListener(name,fn);};entries.set(id,e);weights.set(id,0);audio.load();return e;
 }
 function watch(id:ScoreTrack,e:Entry,generation:number){clearTimeout(e.timer);e.timer=setTimeout(()=>{if(disposed||id!==state.track||generation!==e.generation||!e.pending)return;pause(e);report('音乐尚未开始，请轻点音符重试；可继续游戏');},8000);}
 function attempt(gesture=false){
  if(disposed||!state.active)return false;const id=state.track,e=entry(id);
  if(!e.audio.paused&&!e.pending){if(ready!==id)accept(id,e);return false;}if(e.pending&&!gesture)return false;
  const generation=++e.generation;e.pending=true;if(e.audio.error)e.audio.load();watch(id,e,generation);
  try{void e.audio.play().then(()=>{if(disposed||!state.active){e.audio.pause();return;}if(id!==state.track){if(!(weights.get(id)??0))e.audio.pause();return;}if(generation===e.generation)accept(id,e);}).catch(()=>{if(disposed||generation!==e.generation||id!==state.track)return;e.pending=false;clearTimeout(e.timer);report('浏览器尚未开启音乐，请轻点音符重试；可继续游戏');});}
  catch{e.pending=false;clearTimeout(e.timer);report('音乐无法加载，请轻点音符重试；可继续游戏');}return true;
 }
 return{
  update(next:ScorePlayback){if(disposed)return false;const previous=state;state=next;
   if(!state.active){if(previous.active)stop();duckGain=state.ducked?.26:.8;return false;}
   if(previous.ducked!==next.ducked)duck();
   if(previous.context!==next.context){for(const [id,e]of entries)if(id!==next.track){pause(e);weights.set(id,0);}transition=undefined;}
   if(previous.track!==next.track){for(const [id,e]of entries)if(id!==next.track&&e.pending)pause(e);return attempt();}
   else if(!previous.active)return attempt();else if(previous.context!==next.context&&ready===next.track)fade();return false;
  },
  gesture:()=>attempt(true),
  dispose(){disposed=true;stop();for(const e of entries.values())e.cleanup();entries.clear();},
 };
}
