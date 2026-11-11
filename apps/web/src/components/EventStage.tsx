import {playerLabel} from '@ravens/ui';
import {useGameClock} from "../use-game-clock.js";
import type {RoomView} from "../api.js";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {experienceTiming, type ExperienceEvent } from "@ravens/contracts";
import type { GameView } from "../api.js";
import { effectsAudioEnabled, enableEffectsAudio, scheduleCue, silenceEffects } from "./experience-audio.js";
import "../styles/experience.css";
import {Avatar} from "./Avatar.js";

export interface PrivateReceipt { id: string; kind: "POISON" | "PROTECT" | "DIVINE" | "SEALED"; target: string; targetSeats?:number[] }
type PublicEvent = Partial<ExperienceEvent> & { seq: number; message: string };
export function isCinematic(event: PublicEvent): event is ExperienceEvent { return Boolean(event.id && event.kind && event.kind !== "NOTICE" && event.startsAt && event.durationMs); }
export function eventAt(events: PublicEvent[], now: number, seen: Set<string>): ExperienceEvent | undefined {
  return events.filter(isCinematic).find((event) => !seen.has(event.id) && now >= event.startsAt - 1_500 && now < event.startsAt + event.durationMs);
}
export function publicEventsAt(events: PublicEvent[], now: number): PublicEvent[] { return events.filter((event) => (event.startsAt ?? 0) <= now); }
function loadCursor(gameKey: string): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(`ravens_events_${gameKey}`) ?? "[]") as string[]); } catch { return new Set(); } }

export function EventStage({ game, receipt, preview = false, room, reading=false }: { game?: GameView; receipt?: PrivateReceipt; preview?: boolean; room?: RoomView|undefined; reading?:boolean }) {
  const now=useGameClock(game,room);
  const frozen=room?.timeline?.mode==="MANUAL";
  const [sound, setSound] = useState(effectsAudioEnabled);
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [privateScene, setPrivateScene] = useState<PrivateReceipt>();

  const [hidden,setHidden]=useState(document.hidden);
  useEffect(()=>{const sync=()=>{setHidden(document.hidden);if(document.hidden)silenceEffects();};document.addEventListener("visibilitychange",sync);return()=>document.removeEventListener("visibilitychange",sync);},[]);
  const gameKey = game?.gameId ?? "legacy";
  const seen = useRef(loadCursor(gameKey));
  const seenKey = useRef(gameKey);
  if (seenKey.current !== gameKey) { seen.current = loadCursor(gameKey); seenKey.current = gameKey; }
  const previousEvent = useRef<ExperienceEvent | undefined>(undefined);
  const stageRef = useRef<HTMLElement>(null);
  const receiptIds = useRef(new Set<string>());
  const quietEvents = useRef(new Set<string>()),quietKey=useRef(gameKey);
  if(quietKey.current!==gameKey){quietKey.current=gameKey;quietEvents.current.clear();}
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
    receiptIds.current.add(receipt.id);
    setPrivateScene(receipt);
    const timer = window.setTimeout(() => setPrivateScene(undefined), preview ? 3_600 : 1_200);
    return () => window.clearTimeout(timer);
  }, [receipt?.id]);

  const active = eventAt(game?.events ?? [], now, new Set([...seen.current, ...dismissed]));
  const quiet=!!active&&(active.kind==='DAWN'||active.kind==='NIGHT_FALLS')&&(reading||quietEvents.current.has(active.id));
  if(quiet&&active)quietEvents.current.add(active.id);
  const elapsed = active ? now - active.startsAt : 0;
  if (active && (frozen || animationAnchor.current?.id !== `${active.id}:${room?.timeline?.epoch??0}`)) animationAnchor.current = { id: `${active.id}:${room?.timeline?.epoch??0}`, delay: -elapsed };
  if (!active) animationAnchor.current = undefined;
  const canSeek=typeof Element!=="undefined"&&typeof Element.prototype.getAnimations==="function";
  const staticMotion=reduced||!canSeek;
  const reducedOrLate = reduced || Boolean(active && elapsed > active.durationMs - 1_000);
  useEffect(() => {
    // A clock correction or stale poll may briefly hide an event near its delivery
    // boundary. Only completion or an explicit skip is allowed to advance the cursor.
    if (previousEvent.current && previousEvent.current.id !== active?.id && now >= previousEvent.current.startsAt + previousEvent.current.durationMs) { remember(previousEvent.current.id); previousEvent.current = undefined; }
    if (active) previousEvent.current = active;
    if(active&&!quiet&&!seen.current.has(active.id)&&!reduced&&!frozen&&!hidden)scheduleCue(active.id,active.kind,elapsed,active.timingVersion??1,active.kind==="EXECUTION"&&active.targetSeat===undefined);
    return()=>silenceEffects();
  }, [active?.id,reduced,frozen,sound,hidden,quiet,room?.timeline?.epoch]);
  useLayoutEffect(()=>{
    if(!active)return;
    for(const animation of stageRef.current?.getAnimations?.({subtree:true})??[]){
      const effect=animation.effect as KeyframeEffect|null;
      if(effect?.target===stageRef.current)continue;
      animation.currentTime=elapsed;
      if(frozen||hidden)animation.pause();else animation.play();
    }
  },[active?.id,frozen,hidden,room?.timeline?.epoch,frozen?now:0]);
  useEffect(() => {
    if (!active || quiet) return;
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
    seen.current.add(id);
    try { sessionStorage.setItem(`ravens_events_${gameKey}`, JSON.stringify([...seen.current].slice(-150))); } catch { /* Deduplication still works in this tab. */ }
  }
  function skip() { silenceEffects(); if (active) { remember(active.id); setDismissed((all) => [...all, active.id]); } setPrivateScene(undefined); }
  function toggleSound() { const next = !sound; setSound(next); void enableEffectsAudio(next).then(() => { if (next && active && !quiet && !reduced && !frozen) scheduleCue(active.id, active.kind, elapsed,active.timingVersion??1,active.kind==="EXECUTION"&&active.targetSeat===undefined); }); }
  const event = active;
  const showResult = Boolean(event?.outcome) && (reducedOrLate || elapsed >= (event?experienceTiming(event.kind,event.timingVersion??1).resultOffset:0));
  const target = game?.seats.find((seat) => seat.seat === event?.targetSeat);
  const actor = game?.seats.find((seat) => seat.seat === event?.actorSeat);
  const deaths = event?.seats ?? [];
  const emptyExecution=event?.kind==="EXECUTION"&&event.targetSeat===undefined;
  const title = event ? ({ SHOT: showResult ? event.outcome === "DEATH" ? "枪声之后，一盏灯熄灭" : "枪声散去，无人倒下" : `${playerLabel(event.actorSeat,actor?.nickname)} 举起了枪`, EXECUTION: showResult ? emptyExecution ? "今天无人被处决" : event.outcome === "DEATH" ? "处决已完成" : "处决结束，无人死亡" : "钟楼宣读判决", DAWN: showResult ? deaths.length ? "他们未能等到黎明" : "今夜，无人死亡" : "天亮了", NIGHT_FALLS: "夜幕降临", NOMINATION: "有人提出了指控", VOTE_RESULT: event.outcome === "TIED" ? "票数持平，处决席空置" : event.outcome === "ON_BLOCK" ? "处决席已有候选" : "这轮投票已经结束", GAME_OVER: !event.outcome ? "终章将至" : event.outcome === "GOOD" ? "晨光属于善良" : "暗夜属于邪恶", NOTICE: "钟楼来信" } as const)[event.kind] : "";
  return <>
    <button className="effects-audio" type="button" aria-pressed={sound} onClick={toggleSound} title={sound ? "关闭演出音效" : "点击启用演出音效"}>{sound ? "♪ 音效开" : "♪ 音效关"}</button>
    {event&&quiet?<aside className="phase-reading-notice" role="status"><span>{elapsed<0?event.kind==='DAWN'?'即将天亮':'即将入夜':title}</span><button type="button" onClick={skip}>知道了</button></aside>:null}
    {event&&!quiet ? <section key={event.id} data-timing-version={event.timingVersion??1} ref={stageRef} tabIndex={-1} className={`event-stage event-stage--${event.kind.toLowerCase()}${showResult ? " is-result" : ""}${staticMotion ? " is-reduced" : ""}${frozen?" is-frozen":""}${emptyExecution?" is-empty-execution":""}`} role="dialog" aria-label="城镇公开演出" aria-modal="true" style={{ "--scene-delay": canSeek?"0ms":`${animationAnchor.current?.delay??0}ms`, "--scene-duration": `${event.durationMs}ms` } as CSSProperties}>
      <div className="event-stage__grain" aria-hidden="true" /><div className="event-stage__halo" aria-hidden="true" />
      <header><span>RAVENS AT MIDNIGHT</span><span>{preview ? "演出预览" : "全员公开事件"}</span></header>
      <div className="event-stage__body">
        <p className="event-stage__eyebrow">{event.kind === "DAWN" ? `第 ${event.day ?? game?.day ?? 1} 天 · 黎明` : event.kind === "SHOT" ? "猎魔人 · 公开宣称" : event.kind === "EXECUTION" ? "城镇公决" : "钟声回响"}</p>
        <h1>{elapsed<0?"即将开始":title}</h1>
        <div className="event-stage__theatre" aria-hidden="true">
          {event.kind === "SHOT" ? <><div className="shot-smoke"><i /><i /><i /></div><div className="shot-gun"><Pistol /></div><div className="shot-flare" /><ScenePerson game={game} seat={event.actorSeat} label="开枪者" className="shot-actor"/><div className={`event-token${showResult && event.outcome === "DEATH" ? " event-token--fallen" : ""}`}><ScenePerson game={game} seat={event.targetSeat} label="射击目标"/><div className="seal-fracture" /></div></> : null}
          {event.kind === "EXECUTION" ? emptyExecution?<EmptyGallows/>:<><div className="execution-arch"><div className="execution-blade" /><span>⚜</span><div className={`event-token${showResult && event.outcome === "DEATH" ? " event-token--fallen" : ""}`}><ScenePerson game={game} seat={event.targetSeat} label="被处决者"/></div></div><div className="execution-dust" /></> : null}
          {event.kind === "DAWN" ? <div className="dawn-tableau"><div className="dawn-sun" /><div className="dawn-windows"><i /><i /><i /></div>{showResult ? <div className="dawn-memorial">{deaths.length ? deaths.map((seat) => <div key={seat}><ScenePerson game={game} seat={seat} label="已死亡" className="dawn-person"/><span className="memorial-candle" /></div>) : <div><span className="memorial-candle is-lit" /><strong>所有灯火，仍然亮着</strong></div>}</div> : null}</div> : null}
          {event.kind==="NOMINATION"?<div className="nomination-tableau"><div className="nomination-orbit"/><ScenePerson game={game} seat={event.actorSeat} label="提名" className="nomination-actor"/><div className="nomination-summons"><svg viewBox="0 0 100 100"><path d="M21 16H70L81 27V84H21Z"/><path d="M70 16V29H81M32 39H67M32 48H63M32 57H51"/><circle cx="63" cy="72" r="11"/><path d="M57 81L54 93L63 88L72 93L69 81"/></svg><span>→</span></div><ScenePerson game={game} seat={event.targetSeat} label="被提名" className="nomination-target"/></div>:null}
          {event.kind==="VOTE_RESULT"?<ScenePerson game={game} seat={event.targetSeat} label="本轮被提名" className="vote-result-person"/>:null}
          {!['SHOT', 'EXECUTION', 'DAWN', 'NOMINATION'].includes(event.kind) ? <div className={`ceremony-seal ceremony-seal--${event.kind.toLowerCase()}`}><span>{event.kind === "VOTE_RESULT" ? `${event.votes ?? "—"}` : event.kind === "NIGHT_FALLS" ? "☾" : "⚜"}</span><small>{event.kind === "VOTE_RESULT" ? "票" : "RAVENS"}</small></div> : null}
        </div>
        <p className="event-stage__result" aria-live="polite">{showResult || !["SHOT", "EXECUTION", "DAWN"].includes(event.kind) ? event.message : event.kind === "SHOT" ? `枪口指向 ${playerLabel(event.targetSeat,target?.nickname)}` : event.kind === "EXECUTION" ? emptyExecution ? "晚风穿过刑架，等待判决公布。" : `${playerLabel(event.targetSeat,target?.nickname)} 走向钟楼` : "每个人都屏住呼吸，等待今夜的消息。"}</p>
        {showResult && deaths.length > 0 && ["DAWN", "SHOT", "EXECUTION"].includes(event.kind) && event.outcome !== "NO_DEATH" ? <small className="event-stage__aftercare">死亡不等于离场。你仍可讨论，并保留一枚幽灵票。身份继续保密。</small> : null}
      </div>
      <footer><button type="button" onClick={toggleSound}>{sound ? "关闭音效" : "启用音效"}</button><span>{reduced ? "已尊重减少动态效果偏好" : "所有屏幕共享同一段钟声"}</span><button type="button" onClick={skip}>跳过演出</button></footer>
      <div className="event-stage__progress" style={{ transform: `scaleX(${Math.min(1, Math.max(0, 1 - elapsed / event.durationMs))})` }} />
    </section> : null}
    {privateScene ? <section className={`private-ritual private-ritual--${privateScene.kind.toLowerCase()}${event && elapsed >= 0 ? " private-ritual--compact" : ""}`} style={{ "--private-duration": preview ? "3600ms" : "1200ms" } as CSSProperties} role="status" aria-label="仅你可见的行动回执"><button type="button" onClick={() => setPrivateScene(undefined)}>收起 ×</button><p>PRIVATE · 仅你可见</p><div className="private-ritual__art" aria-hidden="true">{privateScene.kind === "POISON" ? <><div className="poison-vial"><span /></div><div className="poison-drop" /><div className="poison-mist"><i /><i /><i /></div></> : <div className="private-sigil">{privateScene.kind === "PROTECT" ? "◇" : privateScene.kind === "DIVINE" ? "✧" : "☾"}</div>}</div><h2>{privateScene.kind === "POISON" ? "毒液已悄然倾下" : privateScene.kind === "PROTECT" ? "守护的烛火已点亮" : privateScene.kind === "DIVINE" ? "你的问题已交给星辰" : "选择已经封存"}</h2><div className="private-ritual__players">{privateScene.targetSeats?.map(seat=><ScenePerson key={seat} game={game} seat={seat}/>)}</div><strong>{privateScene.target}</strong><small>行动已记录。实际结果以规则结算为准。</small></section> : null}
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

function Pistol() {
  return <svg viewBox="0 0 640 330" role="img" aria-label="雕花燧发手枪"><defs><linearGradient id="gunSteel" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e8e7de" /><stop offset=".24" stopColor="#64707a" /><stop offset=".48" stopColor="#b0b4ab" /><stop offset=".6" stopColor="#313c48" /><stop offset="1" stopColor="#0c1720" /></linearGradient><linearGradient id="gunWood"><stop stopColor="#2c1513" /><stop offset=".45" stopColor="#6a3824" /><stop offset="1" stopColor="#24181a" /></linearGradient><linearGradient id="gunGold"><stop stopColor="#79512a" /><stop offset=".5" stopColor="#e0bd73" /><stop offset="1" stopColor="#926a38" /></linearGradient></defs><path d="M72 112 Q52 111 43 132 L24 203 Q20 219 35 231 L115 286 Q134 301 157 274 L231 181 L341 170 L367 128Z" fill="url(#gunWood)" stroke="#a97840" strokeWidth="4" /><path d="M231 173 Q242 236 290 210 Q315 193 300 171" fill="none" stroke="url(#gunGold)" strokeWidth="10" /><path d="M252 174 Q268 193 259 202" fill="none" stroke="#d4bc91" strokeWidth="7" /><path d="M105 112 L181 94 L572 93 L592 100 L592 132 L576 140 L200 146 L128 170Z" fill="url(#gunSteel)" stroke="#a3a4a0" strokeWidth="3" /><path d="M258 97 L572 97 M242 107 L568 107 M300 130 L570 130" stroke="#ddd2b1" strokeWidth="2" opacity=".6" /><path d="M198 99 L215 62 L246 60 L252 75 L231 79 L226 108" fill="url(#gunSteel)" stroke="#c1ae83" strokeWidth="4" /><path d="M280 94 L287 72 L309 76 L300 97" fill="url(#gunGold)" /><path d="M182 119 Q211 97 228 123 Q245 147 262 121 Q278 101 296 122" fill="none" stroke="url(#gunGold)" strokeWidth="4" /><path d="M72 151 Q97 155 133 186 Q152 208 120 252 M57 160 Q77 190 114 215" fill="none" stroke="#b28a51" strokeWidth="3" /><circle cx="205" cy="123" r="8" fill="url(#gunGold)" /><path d="M45 233 L122 288 L144 275" fill="none" stroke="url(#gunGold)" strokeWidth="12" /><path d="M570 92 L570 140 M583 95 L583 137" stroke="#c3b68d" strokeWidth="6" /><ellipse cx="596" cy="117" rx="8" ry="21" fill="#080b0e" stroke="#9d9d8f" strokeWidth="3" /></svg>;
}
