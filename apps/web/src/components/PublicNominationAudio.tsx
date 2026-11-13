import {useLayoutEffect,useRef} from 'react';
import type {GameView,RoomView} from '../api.js';
import {useGameClock} from '../use-game-clock.js';
import {roomAudioDelivery} from '../room-audio-delivery.js';
import type {EffectsPlayback} from './EventStage.js';
import {createBallotCountdownAudio,createNominationAudio,prepareNominationAudio,type BallotAudioWindow} from './experience-audio.js';

export function ballotAudioWindow(game:GameView|undefined):BallotAudioWindow|undefined{
 const n=game?.nomination;
 if(!game||!['NOMINATION','VOTING'].includes(game.phase)||n?.mode!=='SIMULTANEOUS'||!n.ballotId||typeof n.voteStartsAt!=='number'||typeof n.voteEndsAt!=='number')return;
 return {id:n.ballotId,startsAt:n.voteStartsAt,endsAt:n.voteEndsAt};
}
/** Mount once in the stable PlayerGame/Display shell; opening a book must not unmount this owner. */
export function PublicNominationAudio({game,room,playback}:{game?:GameView;room?:RoomView;playback?:EffectsPlayback}){
 const clock=useGameClock(game,room),now=playback?.now??clock,key=(room?.roomInstanceId??room?.code??'')+':'+(game?.gameId??'legacy');
 const paused=playback?.paused??room?.timeline?.mode==='MANUAL',epoch=playback?.epoch??room?.timeline?.epoch??0;
 const latest=useRef({game,now,paused,epoch,playback,at:performance.now()});latest.current={game,now,paused,epoch,playback,at:performance.now()};
 const syncRef=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{
  const tails=createNominationAudio(key),ballot=createBallotCountdownAudio(key);
  const sync=(retry=false)=>{
   const state=latest.current,liveNow=state.now+(state.paused||state.playback?0:Math.max(0,performance.now()-state.at));
   const muted=state.paused||document.hidden;
   if(state.playback){const event=state.game?.events.find(e=>e.kind==='NOMINATION'||e.kind==='VOTE_RESULT');if(event)tails.preview(event,liveNow-(event.startsAt??0),{paused:muted,rate:state.playback.rate,mode:state.playback.mode??'START',seekKey:state.epoch});}
   else if(state.game){const delivery=roomAudioDelivery(state.game);tails.update(state.game.events,liveNow,{paused:muted,epoch:state.epoch,retry,context:state.game.day+':'+(state.game.contextId??state.game.nomination?.ballotId??state.game.phase),day:state.game.day,active:['DAY_DISCUSSION','NOMINATION','VOTING'].includes(state.game.phase),...(state.game.revision!==undefined?{revision:state.game.revision}:{}),...(delivery?{delivery}:{})});}
   const presentation=state.game?.presentationUntil??0;
   ballot.update(state.playback?undefined:ballotAudioWindow(state.game),Math.max(liveNow,presentation),{paused:muted||presentation>liveNow,epoch:state.epoch,retry});
  };
  const changed=()=>{void prepareNominationAudio();sync(true);};const visibility=()=>sync(true);syncRef.current=()=>sync();
  for(const name of ['ravens-effects-audio','ravens-effects-unlocked'])window.addEventListener(name,changed);
  document.addEventListener('visibilitychange',visibility);changed();
  return()=>{syncRef.current=()=>{};tails.dispose();ballot.dispose();for(const name of ['ravens-effects-audio','ravens-effects-unlocked'])window.removeEventListener(name,changed);document.removeEventListener('visibilitychange',visibility);};
 },[key,!!playback]);
 useLayoutEffect(()=>{syncRef.current();});
 return null;
}
