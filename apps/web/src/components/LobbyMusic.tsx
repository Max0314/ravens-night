import {useEffect,useRef,useState} from 'react';
import {unlockEffectsAudio,globalAudioEnabled,globalAudioEvent,enableEffectsAudio} from './experience-audio.js';
import {GlobalAudioButton} from './GlobalAudioButton.js';

export const lobbyMusicTrack={id:'M19',name:'短暂的人世',src:'/audio/music/v1/lobby-m19.mp3'} as const;
/** Mount in the stable app shell. DAWN cutoff belongs to fadeOut, not active or personal confirmation. */
export interface OpeningMusicOptions {fadeOut?:boolean;ducked?:boolean}
export interface OpeningMusicProps extends OpeningMusicOptions {active:boolean}
export function useOpeningMusic(active:boolean,{fadeOut=false,ducked=false}:OpeningMusicOptions={}){
 const[wanted,setWanted]=useState(globalAudioEnabled),[playing,setPlaying]=useState(false),[starting,setStarting]=useState(false),[message,setMessage]=useState('');
 const wantedRef=useRef(wanted),fadeRef=useRef(fadeOut),duckRef=useRef(ducked),attemptRef=useRef<(unlock?:boolean)=>void>(()=>{}),stopRef=useRef<()=>void>(()=>{}),adjustRef=useRef<()=>void>(()=>{});
 fadeRef.current=fadeOut;duckRef.current=ducked;
 useEffect(()=>{
  if(!active)return;
  const audio=new Audio(lobbyMusicTrack.src);audio.loop=true;audio.preload='auto';audio.volume=fadeRef.current?0:duckRef.current?.26:.8;audio.muted=false;
  let disposed=false,pending=false,confirmed=false,generation=0,timer:ReturnType<typeof setTimeout>|undefined,rampTimer:ReturnType<typeof setInterval>|undefined,fading=false;
  const clearRamp=()=>{clearInterval(rampTimer);rampTimer=undefined;};
  const clearTimer=()=>{clearTimeout(timer);timer=undefined;};
  const showBlocked=(text:string)=>{clearTimer();pending=false;confirmed=false;setPlaying(false);setStarting(false);setMessage(text);};
  const watch=(request:number)=>{clearTimer();timer=setTimeout(()=>{if(disposed||request!==generation||!pending)return;generation++;audio.pause();showBlocked('音乐尚未开始，请轻点开启重试；可继续游戏');},8000);};
  const markPlaying=()=>{
   if(disposed||!wantedRef.current||document.hidden){audio.pause();return;}
   if(fadeRef.current){if(!confirmed)audio.pause();return;}
   if(audio.paused||audio.muted||audio.readyState<2)return;
   clearTimer();pending=false;confirmed=true;setStarting(false);setPlaying(true);setMessage('');
  };
  const attempt=(gesture=false,unlock=true)=>{
   if(disposed||fadeRef.current||!wantedRef.current||document.hidden||confirmed&&!audio.paused||pending&&!gesture)return;
   // Retry directly in click/touch/key even when an automatic play request never settled.
   const request=++generation;if(audio.error)audio.load();pending=true;setStarting(true);setMessage('正在载入《短暂的人世》…');watch(request);if(unlock)void unlockEffectsAudio();
   try{void audio.play().then(()=>{
    if(disposed||!wantedRef.current||document.hidden){audio.pause();return;}
    if(fadeRef.current){if(!confirmed)audio.pause();return;}
    if(request!==generation)return;markPlaying();
   }).catch(()=>{if(disposed||request!==generation)return;showBlocked('浏览器尚未开启音乐，请轻点开启；可继续游戏');});}
   catch{if(!disposed&&request===generation)showBlocked('音乐无法加载，请轻点开启重试；可继续游戏');}
  };
  const stop=()=>{generation++;clearTimer();clearRamp();pending=false;confirmed=false;audio.pause();setPlaying(false);setStarting(false);};stopRef.current=stop;
  const gesture=(event:Event)=>{if(!(event.target instanceof Element&&event.target.closest('[data-global-audio-control]')))attempt(true);};
  const ramp=(target:number,duration:number,finish=false)=>{
   clearRamp();const from=audio.volume,at=Date.now();if(from===target){if(finish)stop();return;}
   rampTimer=setInterval(()=>{if(disposed){clearRamp();return;}const progress=Math.min(1,(Date.now()-at)/duration);audio.volume=Math.max(0,Math.min(1,from+(target-from)*progress));if(progress===1){clearRamp();if(finish)stop();}},40);
  };
  attemptRef.current=(unlock=true)=>{if(fadeRef.current)return;ramp(duckRef.current?.26:.8,240);attempt(true,unlock);};
  const adjust=()=>{if(disposed)return;if(fadeRef.current){if(fading)return;fading=true;ramp(0,800,true);}else{fading=false;ramp(duckRef.current?.26:.8,240);attempt();}};adjustRef.current=adjust;
  const visibility=()=>{if(document.hidden)stop();else{if(!fadeRef.current)adjust();attempt();}};
  const paused=()=>{if(disposed||!audio.paused)return;confirmed=false;setPlaying(false);setStarting(false);};
  const waiting=()=>{if(disposed||fadeRef.current||!wantedRef.current||document.hidden)return;confirmed=false;pending=true;setPlaying(false);setStarting(true);setMessage('音乐正在缓冲，可继续游戏');watch(generation);};
  const failed=()=>{if(disposed)return;generation++;audio.pause();showBlocked(audio.error?.code===2?'音乐连接中断，请轻点开启重试；可继续游戏':'音乐无法加载，请轻点开启重试；可继续游戏');};
  const stalled=()=>{if(audio.paused||audio.readyState<3)waiting();};
  const handlers={playing:markPlaying,pause:paused,waiting,stalled,error:failed};
  for(const [name,handler]of Object.entries(handlers))audio.addEventListener(name,handler);
  for(const name of ['pointerdown','touchend','click','keydown'])document.addEventListener(name,gesture);
  document.addEventListener('visibilitychange',visibility);audio.load();attempt();
  return()=>{disposed=true;generation++;clearTimer();clearRamp();audio.pause();attemptRef.current=()=>{};stopRef.current=()=>{};adjustRef.current=()=>{};for(const [name,handler]of Object.entries(handlers))audio.removeEventListener(name,handler);for(const name of ['pointerdown','touchend','click','keydown'])document.removeEventListener(name,gesture);document.removeEventListener('visibilitychange',visibility);};
 },[active]);
 useEffect(()=>{adjustRef.current();},[active,fadeOut,ducked]);
 useEffect(()=>{if(!active){setPlaying(false);setStarting(false);setMessage('');}},[active]);
 useEffect(()=>{const sync=()=>{const next=globalAudioEnabled();wantedRef.current=next;setWanted(next);if(next)attemptRef.current(false);else{stopRef.current();setMessage('');}};window.addEventListener(globalAudioEvent,sync);return()=>window.removeEventListener(globalAudioEvent,sync);},[]);
 function toggle(){void enableEffectsAudio(!globalAudioEnabled());}

 return {playing,starting,blocked:!playing&&!starting&&!!message,wanted,message,toggle,available:active&&!fadeOut};
}
export type OpeningMusicController=ReturnType<typeof useOpeningMusic>;
/** Compatibility control: all callers now share the same compact total-sound preference. */
export function OpeningMusicControl({controller:music}:{controller:OpeningMusicController;compact?:boolean}){return music.available?<GlobalAudioButton/>:null;}
/** Invisible compatibility layer. Place GlobalAudioButton separately in the active page header. */
export function LobbyMusic({active,...options}:OpeningMusicProps){useOpeningMusic(active,options);return null;}
export const OpeningMusic=LobbyMusic;
export const useLobbyMusic=useOpeningMusic;
export const LobbyMusicControl=OpeningMusicControl;

export {GlobalAudioButton};
