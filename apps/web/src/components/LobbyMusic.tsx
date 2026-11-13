import {useEffect,useRef,useState} from 'react';
import {unlockEffectsAudio} from './experience-audio.js';
import './lobby-music.css';

export const lobbyMusicTrack={id:'M19',name:'短暂的人世',src:'/audio-candidates/2026-11-12-v1/M19.mp3'} as const;
function preference(){try{return localStorage.getItem('ravens_lobby_music')!=='off';}catch{return true;}}
/** Mount once above Lobby/PlayerGame. active follows public room phase, never the local role confirmation. */
export function LobbyMusic({active}:{active:boolean}){
 const[wanted,setWanted]=useState(preference),[playing,setPlaying]=useState(false),[starting,setStarting]=useState(false),[blocked,setBlocked]=useState(false);
 const wantedRef=useRef(wanted),attemptRef=useRef<()=>void>(()=>{}),stopRef=useRef<()=>void>(()=>{});
 useEffect(()=>{
  if(!active)return;
  const audio=new Audio(lobbyMusicTrack.src);audio.loop=true;audio.preload='none';audio.volume=.24;let disposed=false,pending=false,generation=0;
  const attempt=()=>{
   if(disposed||pending||!wantedRef.current||document.hidden||!audio.paused)return;
   const request=++generation;pending=true;setStarting(true);setBlocked(false);void unlockEffectsAudio();
   void audio.play().then(()=>{
    if(disposed||!wantedRef.current||document.hidden){audio.pause();return;}
    if(request!==generation)return;pending=false;setStarting(false);setPlaying(true);setBlocked(false);
   }).catch(()=>{if(disposed||request!==generation)return;pending=false;setStarting(false);setPlaying(false);if(wantedRef.current)setBlocked(true);});
  };
  const stop=()=>{generation++;pending=false;audio.pause();setPlaying(false);setStarting(false);};attemptRef.current=attempt;stopRef.current=stop;
  const gesture=(event:Event)=>{if(!(event.target instanceof Element&&event.target.closest('.lobby-music')))attempt();};
  const visibility=()=>{if(document.hidden)stop();else attempt();};
  document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);document.addEventListener('visibilitychange',visibility);attempt();
  return()=>{disposed=true;generation++;audio.pause();attemptRef.current=()=>{};stopRef.current=()=>{};document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);};
 },[active]);
 useEffect(()=>{if(!active){setPlaying(false);setStarting(false);setBlocked(false);}},[active]);
 function toggle(){const next=!(playing||starting);wantedRef.current=next;setWanted(next);try{localStorage.setItem('ravens_lobby_music',next?'on':'off');}catch{}if(next)attemptRef.current();else{stopRef.current();setBlocked(false);}}
 if(!active)return null;
 return <aside className="lobby-music" aria-label="大厅音乐"><button type="button" aria-pressed={playing} aria-busy={starting} onClick={toggle}>{starting?'取消开启大厅音乐':playing?'♫ 关闭大厅音乐':'♫ 开启大厅音乐'}</button>{blocked&&wanted?<small role="status">轻点开启《{lobbyMusicTrack.name}》，可继续游戏</small>:null}</aside>;
}
