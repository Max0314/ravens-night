import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {GameView,RoomView} from '../api.js';
import type {GuideMode} from './GuideOverlay.js';
import {eventAt} from './EventStage.js';
import {useGameClock} from '../use-game-clock.js';
import {afterRoleReferenceBack} from '../use-back-layer.js';
import './guide-return.css';

export type GuideSurface=GuideMode|'role-reference';
export type RoleReferenceClose='dismiss'|'town-action'|'scene-dismiss'|'discard';

const GuidePriorityContext=createContext({suspended:false,criticalActive:false});
export const useGuidePriority=()=>useContext(GuidePriorityContext);
export function criticalGuideEvent(game:GameView|undefined,now:number,seen:ReadonlySet<string>){
 return eventAt((game?.events??[]).filter(event=>event.gameId===game?.gameId&&(event.kind==='EXECUTION'||event.kind==='GAME_OVER')),now,new Set(seen));
}
function cursor(gameId:string|undefined){try{return sessionStorage.getItem(`ravens_events_${gameId??'legacy'}`)??'[]';}catch{return '[]';}}
function seenEvents(raw:string):Set<string>{try{return new Set(JSON.parse(raw) as string[]);}catch{return new Set();}}
/** Keep the live book mounted while public execution/endgame takes the stage. */
export function GuidePriorityBoundary({enabled,mode,game,room,onClose,children}:{enabled:boolean;mode:GuideSurface|undefined;game:GameView|undefined;room:RoomView|undefined;onClose:(reason?:RoleReferenceClose)=>void;children:ReactNode}){
 const now=useGameClock(game,room),[stowed,setStowed]=useState(false),[hidden,setHidden]=useState(document.hidden),[,refresh]=useState(0);
 const returnButton=useRef<HTMLButtonElement>(null);
 const close=useRef(onClose);close.current=onClose;
 const handoff=useRef(false);
 const completed=useRef(new Set<string>()),raw=cursor(game?.gameId),lastCursor=useRef(raw);lastCursor.current=raw;
 const excluded=new Set([...seenEvents(raw),...completed.current]);
 const critical=enabled&&!hidden?criticalGuideEvent(game,now,excluded):undefined;
 const criticalActive=!!mode&&!!critical,suspended=enabled&&!!mode&&(criticalActive||stowed)&&!hidden;
 const roleReference=mode==='role-reference';
 const canResume=useRef(false);canResume.current=roleReference&&suspended&&!criticalActive&&!hidden;
 const referenceOpen=useRef(roleReference);referenceOpen.current=roleReference;
 handoff.current=enabled&&!!mode&&(criticalActive||stowed);
 useEffect(()=>{if(suspended&&!criticalActive)returnButton.current?.focus({preventScroll:true});},[suspended,criticalActive]);
 useEffect(()=>{if(criticalActive)setStowed(true);else if(!mode)setStowed(false);},[criticalActive,mode]);
 useEffect(()=>{
  const remember=(event:Event)=>{
   const detail=(event as CustomEvent<{gameId:string;eventId:string}>).detail;
   if(detail?.gameId!==(game?.gameId??'legacy')||typeof detail.eventId!=='string'||completed.current.has(detail.eventId))return;
   completed.current.add(detail.eventId);refresh(value=>value+1);
  };
  const check=()=>{const next=cursor(game?.gameId);if(lastCursor.current!==next){lastCursor.current=next;refresh(value=>value+1);}};
  window.addEventListener('ravens:public-event-seen',remember);window.addEventListener('click',check);window.addEventListener('keydown',check);
  return()=>{window.removeEventListener('ravens:public-event-seen',remember);window.removeEventListener('click',check);window.removeEventListener('keydown',check);};
 },[game?.gameId]);
 useEffect(()=>{
  const discard=()=>{
   if(!handoff.current&&!referenceOpen.current)return;
   setStowed(false);
   close.current(referenceOpen.current?'discard':undefined);
  };
  const visibility=()=>{setHidden(document.hidden);if(document.hidden)discard();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('ravens:cover-private',discard);
  return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('ravens:cover-private',discard);};
 },[]);
 const value=useMemo(()=>({suspended,criticalActive}),[suspended,criticalActive]);
 function resume(){
  if(!roleReference){setStowed(false);return;}
  const button=returnButton.current;
  afterRoleReferenceBack(()=>{if(canResume.current&&button?.isConnected&&!document.hidden)setStowed(false);});
 }
 return <GuidePriorityContext.Provider value={value}>{children}{suspended&&!criticalActive?<aside className="guide-return"
  aria-label={roleReference?'角色表阅读位置':'手册阅读位置'}>
  <button ref={returnButton} type="button" onClick={resume}>{roleReference?'返回角色表':'返回手册'}</button>
  <button type="button" onClick={()=>{setStowed(false);close.current(roleReference?'scene-dismiss':undefined);}}>
   {roleReference&&game?.phase==='GAME_OVER'?'查看结算':'继续城镇'}
  </button>
 </aside>:null}</GuidePriorityContext.Provider>;
}
