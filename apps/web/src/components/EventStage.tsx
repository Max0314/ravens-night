import {PublicTransitionQueue} from '../presentations/public-transitions.js';
import {DawnReveal} from './DawnReveal.js';
import {victoryCause,victoryCaption} from './victory-cause.js';
import {prewarmPublicArt} from './public-art-assets.js';
import {AtmosphericSky} from './AtmosphericSky.js';
import {ArtImage} from './PremiumArt.js';
import {FeedbackButton} from '@ravens/ui';
import {playerLabel,formatPlayerText} from '@ravens/ui';
import {useGameClock} from "../use-game-clock.js";
import type {RoomView} from "../api.js";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {experienceTiming, type ExperienceEvent } from "@ravens/contracts";
import type { GameView } from "../api.js";
import { effectsAudioEnabled, scheduleCue, schedulePrivateCue, cancelEventAudio, completeEventAudio, silenceEffects } from "./experience-audio.js";
import "../styles/experience.css";
import {BloodSpray,ShotImpact,ExecutionGallows,PoisonArt,PoisonScreen,DemonScreen,ShieldArt,ButlerArt,DemonArt,Claw,VictoryArt} from './effects-art.js';
import {privateAudioAllowed} from '../participation-audio.js';
import '../styles/effects-v3.css';
import {Avatar} from "./Avatar.js";
import {FractureLayer,GlassRefraction,GuillotineScene,ResultBlood,ExecutionBloodScreen} from './SharpEffects.js';
import {ButlerBow,butlerBowTiming} from './ButlerBow.js';
import {HuntingRifleScene} from './CinematicPublicArt.js';

export interface PrivateReceipt { id: string; kind: "POISON" | "PROTECT" | "DIVINE" | "SEALED" | "BUTLER" | "DEMON"; target: string; targetSeats?:number[] }
export interface EffectsPlayback {now:number;paused:boolean;rate:number;epoch:number;mode?:'START'|'RESUME'|'SEEK'}
export function privateSceneDuration(kind:PrivateReceipt['kind']){return kind==='BUTLER'?butlerBowTiming.durationMs:kind==='DEMON'?4200:4000;}
export const noticeEvent=(event:PublicEvent)=>event.kind==='NOMINATION'||event.kind==='VOTE_RESULT';
type PublicEvent = Partial<ExperienceEvent> & { seq: number; message: string };
export function isCinematic(event: PublicEvent): event is ExperienceEvent { return Boolean(event.id && event.kind && event.kind !== "NOTICE" && event.startsAt && event.durationMs); }
export function eventAt(events: PublicEvent[], now: number, seen: Set<string>): ExperienceEvent | undefined {
  return events.filter(isCinematic).filter(event=>!noticeEvent(event)).find((event) => !seen.has(event.id) && now >= event.startsAt - 1_500 && now < event.startsAt + event.durationMs);
}
export function publicEventsAt(events: PublicEvent[], now: number): PublicEvent[] { return events.filter((event) => (event.startsAt ?? 0) <= now); }
function loadCursor(gameKey: string): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(`ravens_events_${gameKey}`) ?? "[]") as string[]); } catch { return new Set(); } }

export function EventStage({ game, receipt, preview = false, room, reading=false,blocked=false,onActivityChange,playback }: {blocked?:boolean;onActivityChange?:(active:boolean)=>void;playback?:EffectsPlayback; game?: GameView; receipt?: PrivateReceipt; preview?: boolean; room?: RoomView|undefined; reading?:boolean }) {
  const liveNow=useGameClock(game,room),now=playback?.now??liveNow;
  const nowRef=useRef(now);nowRef.current=now;
  const frozen=playback?.paused??room?.timeline?.mode==='MANUAL',rate=playback?.rate??1,clockEpoch=playback?.epoch??room?.timeline?.epoch;
  const [privateSound,setPrivateSound]=useState(privateAudioAllowed);
  useEffect(()=>{const sync=()=>setPrivateSound(privateAudioAllowed());window.addEventListener('ravens:participation-audio',sync);return()=>window.removeEventListener('ravens:participation-audio',sync);},[]);
  const [sound, setSound] = useState(effectsAudioEnabled),[audioEpoch,setAudioEpoch]=useState(0);
  useEffect(()=>{const sync=()=>setAudioEpoch(v=>v+1);window.addEventListener('ravens-effects-unlocked',sync);return()=>window.removeEventListener('ravens-effects-unlocked',sync);},[]);
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [privateScene, setPrivateScene] = useState<PrivateReceipt>();

  const [hidden,setHidden]=useState(document.hidden);
  useEffect(()=>{const sync=()=>{setHidden(document.hidden);if(document.hidden)silenceEffects();};document.addEventListener("visibilitychange",sync);return()=>document.removeEventListener("visibilitychange",sync);},[]);
  const gameKey = game?.gameId ?? "legacy";
  const publicArtKey=(game?.events??[]).filter(isCinematic).slice(-2).map(event=>`${event.id}:${event.kind}`).join('|');
  useEffect(()=>{
    // Only public kinds enter this bounded warmup; every outcome uses the same URL set.
    const phase=game?.phase;
    if(phase==='FIRST_NIGHT'||phase==='OTHER_NIGHT')void prewarmPublicArt('DAWN');
    else if(phase==='ROLE_REVEAL'||phase==='DAY_DISCUSSION'||phase==='NOMINATION'||phase==='VOTING')void prewarmPublicArt('NIGHT_FALLS');
    for(const event of (game?.events??[]).filter(isCinematic).slice(-2))void prewarmPublicArt(event.kind);
  },[gameKey,game?.phase,publicArtKey]);
  const seen = useRef(loadCursor(gameKey));
  const seenKey = useRef(gameKey);
  if (seenKey.current !== gameKey) { seen.current = loadCursor(gameKey); seenKey.current = gameKey; }
  const previousEvent = useRef<ExperienceEvent | undefined>(undefined);
  const publicAudio=useRef<{id:string;paused:boolean;epoch:number|undefined}>({id:'',paused:false,epoch:undefined});
  const noticeAudio=useRef<{id:string;paused:boolean;epoch:number|undefined}>({id:'',paused:false,epoch:undefined});
  const stageRef = useRef<HTMLElement>(null),privateRef=useRef<HTMLElement>(null);
  const privateStart=useRef({id:'',at:now});
  const receiptIds = useRef(new Set<string>());
  const quietEvents = useRef(new Set<string>()),quietKey=useRef(gameKey);
  if(quietKey.current!==gameKey){quietKey.current=gameKey;quietEvents.current.clear();}
  const transitions=useRef(new PublicTransitionQueue()),transitionKey=useRef(gameKey);
  if(transitionKey.current!==gameKey){transitions.current=new PublicTransitionQueue();transitionKey.current=gameKey;}
  const animationAnchor = useRef<{ id: string; delay: number } | undefined>(undefined);
  useEffect(() => {
    try { seen.current = new Set(JSON.parse(sessionStorage.getItem(`ravens_events_${gameKey}`) ?? "[]") as string[]); } catch { seen.current = new Set(); }
    setDismissed([]); previousEvent.current = undefined;
  }, [gameKey]);
  useEffect(()=>{if(frozen)silenceEffects();},[frozen]);
  useEffect(() => () => silenceEffects(), []);
  useEffect(() => { const sync = () => setSound(effectsAudioEnabled()); window.addEventListener("ravens-effects-audio", sync); return () => window.removeEventListener("ravens-effects-audio", sync); }, []);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)"); const change = () => setReduced(media.matches);
    media.addEventListener?.("change", change); return () => media.removeEventListener?.("change", change);
  }, []);
  useEffect(() => {
    if (!receipt) { setPrivateScene(undefined); return; }
    if (receiptIds.current.has(receipt.id)) return;
    receiptIds.current.add(receipt.id);privateStart.current={id:receipt.id,at:now};setPrivateScene(receipt);
  }, [receipt?.id]);
  const privateElapsed=now-privateStart.current.at;
  const visiblePrivate=privateScene&&privateElapsed>=0&&privateElapsed<privateSceneDuration(privateScene.kind)?privateScene:undefined;
  const excluded=new Set([...seen.current,...dismissed]);
  const live=eventAt(game?.events??[],now,excluded);
  const selected=transitions.current.select(game,live,now,blocked,reading,excluded);
  const active=selected.active;
  const elapsed=selected.elapsed;
  const critical=active?.kind==='EXECUTION'||active?.kind==='GAME_OVER';
  const quiet=!!active&&!critical&&(reading||quietEvents.current.has(active.id));
  useEffect(()=>{for(const id of selected.completed)remember(id);},[selected.completed.join(',')]);
  // Re-sample the authoritative clock per painted frame; do not invent a CSS clock.
  const [,renderMotion]=useState(0);
  useEffect(()=>{if(!active||frozen||hidden||playback||quiet||reduced)return;let frame=0;const tick=()=>{renderMotion(n=>n+1);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[active?.id,frozen,hidden,!!playback,quiet,reduced]);
  if(quiet&&active)quietEvents.current.add(active.id);
  const notice=(game?.events??[]).filter(isCinematic).find(event=>noticeEvent(event)&&!dismissed.includes(event.id)&&now>=event.startsAt&&now<event.startsAt+event.durationMs);
  useLayoutEffect(()=>{onActivityChange?.(!!active&&!quiet);return()=>onActivityChange?.(false);},[active?.id,quiet,onActivityChange]);
  if (active && (frozen || animationAnchor.current?.id !== `${active.id}:${clockEpoch??0}`)) animationAnchor.current = { id: `${active.id}:${clockEpoch??0}`, delay: -elapsed };
  if (!active) animationAnchor.current = undefined;
  const canSeek=typeof Element!=="undefined"&&typeof Element.prototype.getAnimations==="function";
  const staticMotion=reduced||!canSeek;

  useEffect(() => {
    // A clock correction or stale poll may briefly hide an event near its delivery
    // boundary. Only completion or an explicit skip is allowed to advance the cursor.
    if (!preview && previousEvent.current && previousEvent.current.id !== active?.id && previousEvent.current.id!==selected.waitingId && now >= previousEvent.current.startsAt + previousEvent.current.durationMs) { remember(previousEvent.current.id); previousEvent.current = undefined; }
    if (active&&!selected.deferred) previousEvent.current = active;
  }, [active?.id,now]);
  const resultVisible=Boolean(active?.outcome)&&elapsed>=(active?experienceTiming(active.kind,active.timingVersion??1).resultOffset:0);
  useEffect(()=>{
    if(!active){publicAudio.current={id:'',paused:false,epoch:undefined};return;}
    const changed=publicAudio.current.id!==active.id||publicAudio.current.epoch!==clockEpoch;
    const paused=frozen||hidden||quiet&&active.kind!=='SHOT',mode=playback?.mode&&changed?playback.mode:publicAudio.current.id===active.id&&publicAudio.current.paused?'RESUME':'START';
    scheduleCue(active.id,active.kind,elapsed,active.timingVersion??1,active.kind==='EXECUTION'&&active.targetSeat===undefined,{rate,outcome:active.outcome,resultVisible,mode,paused,seekKey:clockEpoch??0});
    publicAudio.current={id:active.id,paused,epoch:clockEpoch};
  },[active?.id,active?.outcome,resultVisible,frozen,hidden,sound,quiet,clockEpoch,audioEpoch,playback?.mode,rate]);
  useEffect(()=>{const id=active?.id,end=active?active.startsAt+active.durationMs:0;return()=>{if(id){if(nowRef.current>=end)completeEventAudio(id);else cancelEventAudio(id);}};},[active?.id,frozen,hidden,clockEpoch]);
  useEffect(()=>{
    if(!notice){noticeAudio.current={id:'',paused:false,epoch:undefined};return;}
    const changed=noticeAudio.current.id!==notice.id||noticeAudio.current.epoch!==clockEpoch,mode=playback?.mode&&changed?playback.mode:noticeAudio.current.id===notice.id&&noticeAudio.current.paused?'RESUME':'START';
    scheduleCue(notice.id,notice.kind,now-notice.startsAt,notice.timingVersion??1,false,{rate,mode,paused:frozen||hidden,seekKey:clockEpoch??0});noticeAudio.current={id:notice.id,paused:frozen||hidden,epoch:clockEpoch};
    return()=>cancelEventAudio(notice.id);
  },[notice?.id,frozen,hidden,sound,clockEpoch,audioEpoch,playback?.mode,rate]);
  useEffect(()=>{if(visiblePrivate&&!frozen&&!hidden&&privateSound)schedulePrivateCue(visiblePrivate.id,visiblePrivate.kind,privateElapsed,{rate});return()=>{if(privateScene)cancelEventAudio('private:'+privateScene.id);};},[privateScene?.id,frozen,hidden,sound,privateSound,clockEpoch,audioEpoch]);
  useLayoutEffect(()=>{
    for(const [element,position]of [[stageRef.current,elapsed],[privateRef.current,privateElapsed]] as const){
      for(const animation of element?.getAnimations?.({subtree:true})??[]){
        const effect=animation.effect as KeyframeEffect|null;if(effect?.target===element)continue;
        animation.currentTime=Math.max(0,position);animation.playbackRate=rate;
        if(frozen||hidden)animation.pause();else animation.play();
      }
    }
  },[active?.id,privateScene?.id,active?.outcome,resultVisible,frozen,hidden,clockEpoch,frozen?now:0]);
  useEffect(() => {
    if (!active || quiet || preview) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    stageRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { skip(); return; }
      if (event.key !== "Tab" || !stageRef.current) return;
      const buttons = [...stageRef.current.querySelectorAll<HTMLButtonElement>("button")];
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === stageRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); if (previous?.isConnected) previous.focus(); };
  }, [active?.id,quiet]);
  function remember(id: string) {
    const first=!seen.current.has(id);
    seen.current.add(id);
    try { sessionStorage.setItem(`ravens_events_${gameKey}`, JSON.stringify([...seen.current].slice(-150))); } catch { /* Deduplication still works in this tab. */ }
    if(first)window.dispatchEvent(new CustomEvent('ravens:public-event-seen',{detail:{gameId:gameKey,eventId:id}}));
  }
  function skip() { if (active) { cancelEventAudio(active.id); remember(active.id); setDismissed((all) => [...all, active.id]); } if(privateScene)cancelEventAudio('private:'+privateScene.id);setPrivateScene(undefined); }
  const event = active;
  const showResult = Boolean(event?.outcome) && elapsed >= (event?experienceTiming(event.kind,event.timingVersion??1).resultOffset:0);
  const target = game?.seats.find((seat) => seat.seat === event?.targetSeat);
  const actor = game?.seats.find((seat) => seat.seat === event?.actorSeat);
  const deaths = event?.seats ?? [];
  const dawnNames=deaths.map(seat=>playerLabel(seat,game?.seats.find(player=>player.seat===seat)?.nickname)).join('、');
  const emptyExecution=event?.kind==="EXECUTION"&&event.targetSeat===undefined;
  const virginNomination=showResult&&event?.kind==='EXECUTION'&&event.message.startsWith('处女的能力触发：')?game?.events.find(previous=>previous.seq===event.seq-1&&previous.kind==='NOMINATION'&&previous.actorSeat===event.targetSeat):undefined;
  const virgin=game?.seats.find(player=>player.seat===virginNomination?.targetSeat);
  const title = event ? ({ SHOT: showResult ? event.outcome === "DEATH" ? "枪声之后，一盏灯熄灭" : "枪声散去，无人倒下" : `${playerLabel(event.actorSeat,actor?.nickname)} 举起了枪`, EXECUTION: showResult ? emptyExecution ? "今天无人被处决" : event.outcome === "DEATH" ? "处决已完成" : "处决结束，无人死亡" : "钟楼宣读判决", DAWN: showResult ? deaths.length ? `${dawnNames}未能等到黎明` : "今夜，无人死亡" : "天亮了", NIGHT_FALLS: "夜幕降临", NOMINATION: "有人提出了指控", VOTE_RESULT: event.outcome === "TIED" ? "票数持平，处决席空置" : event.outcome === "ON_BLOCK" ? "处决席已有候选" : "这轮投票已经结束", GAME_OVER: !showResult ? "终章将至" : event.outcome === "GOOD" ? "晨光属于善良" : "暗夜属于邪恶", NOTICE: "钟楼来信" } as const)[event.kind] : "";
  return <>
    {notice?<aside className="event-notice" role="status"><span className="event-notice__seal" aria-hidden="true">{notice.kind==='NOMINATION'?'⚖':'✓'}</span>{notice.kind==='NOMINATION'?<><ScenePerson game={game} seat={notice.actorSeat}/><span>提名</span><ScenePerson game={game} seat={notice.targetSeat}/></>:<span>{formatPlayerText(notice.message)}</span>}<FeedbackButton type="button" aria-label="收起事件提示" onClick={()=>setDismissed(all=>[...all,notice.id])}>×</FeedbackButton></aside>:null}
    {event?.kind==='SHOT'?<><FractureLayer seed={event.id} elapsedMs={elapsed} impactAt={experienceTiming(event.kind,event.timingVersion??1).resultOffset} reduced={reduced}/><GlassRefraction seed={event.id} elapsedMs={elapsed} impactAt={experienceTiming(event.kind,event.timingVersion??1).resultOffset} reduced={reduced}/></>:null}
    {event&&quiet?<aside className="phase-reading-notice" role="status" aria-label="阶段变化"><span>{elapsed<0?event.kind==='DAWN'?'即将天亮':event.kind==='NIGHT_FALLS'?'即将入夜':'即将公布':title}</span></aside>:null}
    {event&&!quiet ? <section key={event.id} data-timing-version={event.timingVersion??1} ref={stageRef} tabIndex={-1} className={`event-stage event-stage--${event.kind.toLowerCase()}${showResult ? " is-result" : ""}${staticMotion ? " is-reduced" : ""}${frozen?" is-frozen":""}${emptyExecution?" is-empty-execution":""}${showResult&&event.outcome==="DEATH"?" has-death":""}`} role="dialog" aria-label="城镇公开演出" aria-modal={!preview} style={{ "--scene-delay": canSeek?"0ms":`${animationAnchor.current?.delay??0}ms`, "--scene-duration": `${event.durationMs}ms` } as CSSProperties}>
      {event.kind==='EXECUTION'?<ExecutionBloodScreen elapsedMs={elapsed} resultAt={experienceTiming(event.kind,event.timingVersion??1).resultOffset} death={event.outcome==='DEATH'} empty={emptyExecution} resultVisible={showResult} reduced={reduced}/>:null}
      {event.kind==="GAME_OVER"&&showResult&&(event.outcome==="GOOD"||event.outcome==="EVIL")?<VictoryArt winner={event.outcome} elapsedMs={elapsed-experienceTiming(event.kind,event.timingVersion??1).resultOffset} reduced={reduced} cause={victoryCause(game?.winReason)}/>:null}
      {event.kind==='DAWN'||event.kind==='NIGHT_FALLS'?<AtmosphericSky phase={event.kind} elapsedMs={elapsed} durationMs={event.durationMs} reduced={reduced}/>:null}
      <div className="event-stage__grain" aria-hidden="true" /><div className="event-stage__halo" aria-hidden="true" />
      <header><span>RAVENS AT MIDNIGHT</span><span>{preview ? "演出预览" : "全员公开事件"}</span></header>
      <div className="event-stage__body">
        <p className="event-stage__eyebrow">{virgin?<span className="event-stage__virgin-trigger"><Avatar id={String(virgin.seat)} name={virgin.nickname} url={virgin.avatar} loading="eager"/>{playerLabel(virgin.seat,virgin.nickname)} · 处女能力触发</span>:event.kind === "DAWN" ? `第 ${event.day ?? game?.day ?? 1} 天 · 黎明` : event.kind === "SHOT" ? "猎魔人 · 公开宣称" : event.kind === "EXECUTION" ? "城镇公决" : "钟声回响"}</p>
        <h1>{elapsed<0?"即将开始":title}</h1>
        <div className="event-stage__theatre" aria-hidden="true">
          {event.kind === "SHOT" ? <><HuntingRifleScene elapsedMs={elapsed} fireAt={experienceTiming(event.kind,event.timingVersion??1).cues.find(([,cue])=>cue==='shot')?.[0]??experienceTiming(event.kind,event.timingVersion??1).resultOffset} reduced={reduced}/><ScenePerson game={game} seat={event.actorSeat} label="开枪者" className="shot-actor"/><div className={`event-token${showResult && event.outcome === "DEATH" ? " event-token--fallen" : ""}`}><ScenePerson game={game} seat={event.targetSeat} label="射击目标"/>{showResult&&event.outcome==='DEATH'?<ResultBlood reduced={reduced} variant="right" elapsedMs={elapsed} resultAt={experienceTiming(event.kind,event.timingVersion??1).resultOffset}/>:null}</div></> : null}
          {event.kind === "EXECUTION" ? <GuillotineScene reduced={reduced} elapsedMs={elapsed} resultAt={experienceTiming(event.kind,event.timingVersion??1).resultOffset} empty={emptyExecution} resultVisible={showResult} death={showResult&&event.outcome==='DEATH'} blood={showResult&&event.outcome==='DEATH'?<ResultBlood reduced={reduced} elapsedMs={elapsed} resultAt={experienceTiming(event.kind,event.timingVersion??1).resultOffset}/>:undefined}>{!emptyExecution?<div className="event-token"><ScenePerson game={game} seat={event.targetSeat} label="被处决者"/></div>:null}</GuillotineScene> : null}
          {event.kind === "DAWN"&&showResult ? <DawnReveal players={game?.seats??[]} seats={deaths}/> : null}
          {event.kind==="NOMINATION"?<div className="nomination-tableau"><div className="nomination-orbit"/><ScenePerson game={game} seat={event.actorSeat} label="提名" className="nomination-actor"/><div className="nomination-summons"><ArtImage name="sealed-letter"/><span>→</span></div><ScenePerson game={game} seat={event.targetSeat} label="被提名" className="nomination-target"/></div>:null}
          {event.kind==="VOTE_RESULT"?<ScenePerson game={game} seat={event.targetSeat} label="本轮被提名" className="vote-result-person"/>:null}
          {!['SHOT', 'EXECUTION', 'DAWN', 'NOMINATION', 'NIGHT_FALLS'].includes(event.kind) ? <div className={`ceremony-seal ceremony-seal--${event.kind.toLowerCase()}`}><span>{event.kind === "VOTE_RESULT" ? `${event.votes ?? "—"}` : event.kind === "NIGHT_FALLS" ? "☾" : "⚜"}</span><small>{event.kind === "VOTE_RESULT" ? "票" : "RAVENS"}</small></div> : null}
        </div>
        <p className="event-stage__result" aria-live="polite">{showResult?virgin?'提名者立即被处决，今日提名结束。':event.kind==='DAWN'?'请继续白天讨论。':event.kind==='GAME_OVER'?victoryCaption(game?.winReason,formatPlayerText(event.message)):formatPlayerText(event.message):!["SHOT", "EXECUTION", "DAWN", "GAME_OVER"].includes(event.kind)?formatPlayerText(event.message):event.kind === "SHOT" ? `枪口指向 ${playerLabel(event.targetSeat,target?.nickname)}` : event.kind === "EXECUTION" ? emptyExecution ? "晚风穿过刑架，等待判决公布。" : `${playerLabel(event.targetSeat,target?.nickname)} 走向钟楼` : event.kind === "GAME_OVER" ? "结局即将揭晓。" : "等待黎明的消息。"}</p>
        {showResult && deaths.length > 0 && ["DAWN", "SHOT", "EXECUTION"].includes(event.kind) && event.outcome !== "NO_DEATH" ? <small className="event-stage__aftercare">死亡不等于离场。你仍可讨论，并保留一枚幽灵票。身份继续保密。</small> : null}
      </div>
      <footer><span>{reduced ? "已尊重减少动态效果偏好" : "所有屏幕共享同一段钟声"}</span><FeedbackButton type="button" onClick={skip}>跳过演出</FeedbackButton></footer>
      <div className="event-stage__progress" style={{ transform: `scaleX(${Math.min(1, Math.max(0, 1 - elapsed / event.durationMs))})` }} />
    </section> : null}
    {visiblePrivate ? <section data-private-feedback="true" ref={privateRef} key={visiblePrivate.id} className={`private-ritual private-ritual--${visiblePrivate.kind.toLowerCase()}${event&&elapsed>=0?' private-ritual--compact':''}${staticMotion?' is-reduced':''}${frozen?' is-frozen':''}`} style={{'--private-duration':`${privateSceneDuration(visiblePrivate.kind)}ms`,'--scene-duration':`${privateSceneDuration(visiblePrivate.kind)}ms`,'--scene-delay':canSeek?'0ms':`${-privateElapsed}ms`} as CSSProperties} role="status" aria-label="仅你可见的行动回执"><FeedbackButton type="button" onClick={()=>setPrivateScene(undefined)}>收起 ×</FeedbackButton><p>仅你可见 · 行动已提交</p>{visiblePrivate.kind==='POISON'?<PoisonScreen/>:visiblePrivate.kind==='DEMON'?<DemonScreen/>:null}<div className="private-ritual__art" aria-hidden="true">{visiblePrivate.kind==='POISON'?<PoisonArt/>:visiblePrivate.kind==='PROTECT'?<ShieldArt/>:visiblePrivate.kind==='BUTLER'?<ButlerBow elapsedMs={privateElapsed} reducedMotion={reduced}/>:visiblePrivate.kind==='DEMON'?<DemonArt elapsedMs={privateElapsed} reduced={reduced}/>:<div className="private-sigil">{visiblePrivate.kind==='DIVINE'?'✧':'☾'}</div>}</div><h2>{({POISON:'毒液倾下',PROTECT:'守护之盾',BUTLER:'谨遵吩咐',DEMON:'暗翼掠过',DIVINE:'问询已提交',SEALED:'选择已封存'} as const)[visiblePrivate.kind]}</h2><div className="private-ritual__players">{visiblePrivate.targetSeats?.map(seat=><div className="private-target" key={seat}><ScenePerson game={game} seat={seat}/>{visiblePrivate.kind==='DEMON'?<Claw/>:null}</div>)}</div><strong>{visiblePrivate.target}</strong><small>选择已提交，实际结果以规则结算为准。</small></section> : null}

  </>;
}


function ScenePerson({game,seat,label,className=""}:{game:GameView|undefined;seat:number|undefined;label?:string;className?:string}){
  if(seat===undefined)return null;
  const player=game?.seats.find(p=>p.seat===seat),name=player?.nickname??`${seat}号玩家`;
  return <div className={`scene-person ${className}`}><Avatar id={`seat-${seat}`} name={name} url={player?.avatar}/><span className="scene-person__seat">{seat}号</span><strong>{playerLabel(seat,player?.nickname)}</strong>{label?<small>{label}</small>:null}</div>;
}
function EmptyGallows(){
  return <div className="empty-gallows"><svg viewBox="0 0 320 320"><path className="empty-gallows__timber" d="M70 294V30H239M70 93L132 30M42 294H153"/><g className="empty-gallows__rope"><path d="M221 32V142"/><path d="M221 142C184 175 194 207 221 207C248 207 258 175 221 142Z"/><path d="M214 132H228M214 138H228M214 144H228"/></g></svg><div className="empty-gallows__wind"><i/><i/><i/></div><div className="empty-gallows__leaves"><i/><i/></div></div>;
}
