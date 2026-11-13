import {useEffect,useRef,useState} from 'react';
import {unlockEffectsAudio} from './experience-audio.js';
import './lobby-music.css';

export const lobbyMusicTrack={id:'M19',name:'短暂的人世',src:'/audio/music/v1/lobby-m19.mp3'} as const;
function preference(){try{return localStorage.getItem('ravens_lobby_music')!=='off';}catch{return true;}}
/** Mount once above Lobby/PlayerGame. active follows public room phase, never the local role confirmation. */
export function LobbyMusic({active}:{active:boolean}){
 const[wanted,setWanted]=useState(preference),[playing,setPlaying]=useState(false),[starting,setStarting]=useState(false),[message,setMessage]=useState('');
 const wantedRef=useRef(wanted),attemptRef=useRef<()=>void>(()=>{}),stopRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  if(!active)return;
  const audio=new Audio(lobbyMusicTrack.src);audio.loop=true;audio.preload='auto';audio.volume=.8;audio.muted=false;
  let disposed=false,pending=false,confirmed=false,generation=0,timer:ReturnType<typeof setTimeout>|undefined;
  const clearTimer=()=>{clearTimeout(timer);timer=undefined;};
  const showBlocked=(text:string)=>{clearTimer();pending=false;confirmed=false;setPlaying(false);setStarting(false);setMessage(text);};
  const watch=(request:number)=>{clearTimer();timer=setTimeout(()=>{if(disposed||request!==generation||!pending)return;generation++;audio.pause();showBlocked('音乐尚未开始，请轻点开启重试；可继续游戏');},8000);};
  const markPlaying=()=>{
   if(disposed||!wantedRef.current||document.hidden){audio.pause();return;}
   if(audio.paused||audio.muted||audio.readyState<2)return;
   clearTimer();pending=false;confirmed=true;setStarting(false);setPlaying(true);setMessage('');
  };
  const attempt=(gesture=false)=>{
   if(disposed||!wantedRef.current||document.hidden||confirmed&&!audio.paused||pending&&!gesture)return;
   // Retry directly in click/touch/key even when an automatic play request never settled.
   const request=++generation;if(audio.error)audio.load();pending=true;setStarting(true);setMessage('正在载入《短暂的人世》…');watch(request);void unlockEffectsAudio();
   try{void audio.play().then(()=>{
    if(disposed||!wantedRef.current||document.hidden){audio.pause();return;}
    if(request!==generation)return;markPlaying();
   }).catch(()=>{if(disposed||request!==generation)return;showBlocked('浏览器尚未开启音乐，请轻点开启；可继续游戏');});}
   catch{if(!disposed&&request===generation)showBlocked('音乐无法加载，请轻点开启重试；可继续游戏');}
  };
  const stop=()=>{generation++;clearTimer();pending=false;confirmed=false;audio.pause();setPlaying(false);setStarting(false);};attemptRef.current=()=>attempt(true);stopRef.current=stop;
  const gesture=(event:Event)=>{if(!(event.target instanceof Element&&event.target.closest('.lobby-music')))attempt(true);};
  const visibility=()=>{if(document.hidden)stop();else attempt();};
  const paused=()=>{if(disposed||!audio.paused)return;confirmed=false;setPlaying(false);setStarting(false);};
  const waiting=()=>{if(disposed||!wantedRef.current||document.hidden)return;confirmed=false;pending=true;setPlaying(false);setStarting(true);setMessage('音乐正在缓冲，可继续游戏');watch(generation);};
  const failed=()=>{if(disposed)return;generation++;audio.pause();showBlocked(audio.error?.code===2?'音乐连接中断，请轻点开启重试；可继续游戏':'音乐无法加载，请轻点开启重试；可继续游戏');};
  const stalled=()=>{if(audio.paused||audio.readyState<3)waiting();};
  const handlers={playing:markPlaying,pause:paused,waiting,stalled,error:failed};
  for(const [name,handler]of Object.entries(handlers))audio.addEventListener(name,handler);
  for(const name of ['pointerdown','touchend','click','keydown'])document.addEventListener(name,gesture);
  document.addEventListener('visibilitychange',visibility);audio.load();attempt();
  return()=>{disposed=true;generation++;clearTimer();audio.pause();attemptRef.current=()=>{};stopRef.current=()=>{};for(const [name,handler]of Object.entries(handlers))audio.removeEventListener(name,handler);for(const name of ['pointerdown','touchend','click','keydown'])document.removeEventListener(name,gesture);document.removeEventListener('visibilitychange',visibility);};
 },[active]);
 useEffect(()=>{if(!active){setPlaying(false);setStarting(false);setMessage('');}},[active]);
 function toggle(){const next=!(playing||starting);wantedRef.current=next;setWanted(next);try{localStorage.setItem('ravens_lobby_music',next?'on':'off');}catch{}if(next)attemptRef.current();else{stopRef.current();setMessage('');}}
 if(!active)return null;
 return <aside className="lobby-music" aria-label="大厅音乐"><button type="button" aria-pressed={playing} aria-busy={starting} onClick={toggle}>{starting?'取消开启大厅音乐':playing?'♫ 关闭大厅音乐':'♫ 开启大厅音乐'}</button>{message&&wanted?<small role="status">{message}</small>:null}</aside>;
}
