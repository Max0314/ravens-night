import {useEffect,useRef} from 'react';
import type {RoomView} from '../api.js';
import {useGameClock} from '../use-game-clock.js';
import {createGameScorePlayer,gameScoreTrack} from './game-score.js';
import {globalAudioEnabled,globalAudioEvent,effectsPreviewActive,scoreDuckingActive,reportAudioStatus,unlockEffectsAudio} from './experience-audio.js';

/** Replace the old opening owner at the single stable App slot. No controls or child renders. */
export function GameScoreOwner({screen,room}:{screen:string;room?:RoomView|undefined}){
 const now=useGameClock(room?.game,room),latest=useRef({screen,room,now});latest.current={screen,room,now};
 const sync=useRef<()=>void>(()=>{});
 useEffect(()=>{
  const player=createGameScorePlayer(reportAudioStatus);
  const active=()=>{const s=latest.current;return !['LOADING','LOGIN','DISPLAY'].includes(s.screen)&&globalAudioEnabled()&&!document.hidden&&!effectsPreviewActive()&&s.room?.timeline?.mode!=='MANUAL';};
  const update=()=>{const s=latest.current;return player.update({track:gameScoreTrack(s.screen==='GAME'?s.room?.game:undefined,s.now),active:active(),ducked:scoreDuckingActive(),context:(s.room?.roomInstanceId??s.room?.code??'menu')+':'+(s.room?.game?.gameId??'setup')});};
  const gesture=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('[data-global-audio-control]'))return;if(active())void unlockEffectsAudio();if(!update())player.gesture();};
  const total=()=>{if(!update()&&globalAudioEnabled())player.gesture();};
  sync.current=update;window.addEventListener(globalAudioEvent,total);
  window.addEventListener('ravens-effects-audio',update);document.addEventListener('visibilitychange',update);
  for(const name of ['pointerdown','touchend','click','keydown'])document.addEventListener(name,gesture);
  update();return()=>{sync.current=()=>{};player.dispose();window.removeEventListener(globalAudioEvent,total);window.removeEventListener('ravens-effects-audio',update);document.removeEventListener('visibilitychange',update);for(const name of ['pointerdown','touchend','click','keydown'])document.removeEventListener(name,gesture);};
 },[]);
 useEffect(()=>{sync.current();});
 return null;
}
