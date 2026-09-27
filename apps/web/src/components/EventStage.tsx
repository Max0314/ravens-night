import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ExperienceEvent } from "@ravens/contracts";
import type { GameView } from "../api.js";
import { effectsAudioEnabled, enableEffectsAudio, scheduleCue, silenceEffects } from "./experience-audio.js";
import "../styles/experience.css";

export interface PrivateReceipt { id: string; kind: "POISON" | "PROTECT" | "DIVINE" | "SEALED"; target: string }
type PublicEvent = Partial<ExperienceEvent> & { seq: number; message: string };
export function isCinematic(event: PublicEvent): event is ExperienceEvent { return Boolean(event.id && event.kind && event.kind !== "NOTICE" && event.startsAt && event.durationMs); }
export function eventAt(events: PublicEvent[], now: number, seen: Set<string>): ExperienceEvent | undefined {
  return events.filter(isCinematic).find((event) => !seen.has(event.id) && now >= event.startsAt - 1_500 && now < event.startsAt + event.durationMs);
}
export function publicEventsAt(events: PublicEvent[], now: number): PublicEvent[] { return events.filter((event) => (event.startsAt ?? 0) <= now); }
function loadCursor(gameKey: string): Set<string> { try { return new Set(JSON.parse(sessionStorage.getItem(`ravens_events_${gameKey}`) ?? "[]") as string[]); } catch { return new Set(); } }

export function EventStage({ game, receipt, preview = false }: { game?: GameView; receipt?: PrivateReceipt; preview?: boolean }) {
  const [clock, setClock] = useState(Date.now());
  const [sound, setSound] = useState(effectsAudioEnabled);
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [privateScene, setPrivateScene] = useState<PrivateReceipt>();
  const offset = useRef(game?.serverNow ? game.serverNow - Date.now() : 0);
  const observed = useRef(new Set<string>());
  const gameKey = game?.gameId ?? "legacy";
  const seen = useRef(loadCursor(gameKey));
  const seenKey = useRef(gameKey);
  if (seenKey.current !== gameKey) { seen.current = loadCursor(gameKey); seenKey.current = gameKey; }
  const previousEvent = useRef<ExperienceEvent | undefined>(undefined);
  const stageRef = useRef<HTMLElement>(null);
  const receiptIds = useRef(new Set<string>());
  const animationAnchor = useRef<{ id: string; delay: number } | undefined>(undefined);
  useEffect(() => {
    try { seen.current = new Set(JSON.parse(sessionStorage.getItem(`ravens_events_${gameKey}`) ?? "[]") as string[]); } catch { seen.current = new Set(); }
    setDismissed([]); observed.current.clear(); previousEvent.current = undefined;
  }, [gameKey]);
  useEffect(() => { if (game?.serverNow) offset.current = game.serverNow - Date.now(); }, [game?.serverNow]);
  useEffect(() => { const id = window.setInterval(() => setClock(Date.now()), 80); return () => window.clearInterval(id); }, []);
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
  const now = clock + offset.current;
  const active = eventAt(game?.events ?? [], now, new Set([...seen.current, ...dismissed]));
  const elapsed = active ? now - active.startsAt : 0;
  if (active && animationAnchor.current?.id !== active.id) animationAnchor.current = { id: active.id, delay: -elapsed };
  if (!active) animationAnchor.current = undefined;
  const reducedOrLate = reduced || Boolean(active && elapsed > active.durationMs - 1_000);
  useEffect(() => {
    // A clock correction or stale poll may briefly hide an event near its delivery
    // boundary. Only completion or an explicit skip is allowed to advance the cursor.
    if (previousEvent.current && previousEvent.current.id !== active?.id && now >= previousEvent.current.startsAt + previousEvent.current.durationMs) { remember(previousEvent.current.id); previousEvent.current = undefined; }
    if (active) previousEvent.current = active;
    if (!active || seen.current.has(active.id) || observed.current.has(active.id)) return;
    observed.current.add(active.id);
    if (!reduced) scheduleCue(active.id, active.kind, elapsed);
  }, [active?.id, reduced]);
  useEffect(() => {
    if (!active) return;
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
  }, [active?.id]);
  function remember(id: string) {
    seen.current.add(id);
    try { sessionStorage.setItem(`ravens_events_${gameKey}`, JSON.stringify([...seen.current].slice(-150))); } catch { /* Deduplication still works in this tab. */ }
  }
  function skip() { silenceEffects(); if (active) { remember(active.id); setDismissed((all) => [...all, active.id]); } setPrivateScene(undefined); }
  function toggleSound() { const next = !sound; setSound(next); void enableEffectsAudio(next).then(() => { if (next && active && !reduced) scheduleCue(active.id, active.kind, elapsed); }); }
  const event = active;
  const showResult = reducedOrLate || elapsed >= (event?.kind === "SHOT" ? 2_800 : event?.kind === "EXECUTION" ? 2_800 : 2_100);
  const target = game?.seats.find((seat) => seat.seat === event?.targetSeat);
  const actor = game?.seats.find((seat) => seat.seat === event?.actorSeat);
  const deaths = event?.seats ?? (event?.targetSeat ? [event.targetSeat] : []);
  const title = event ? ({ SHOT: showResult ? event.outcome === "DEATH" ? "枪声之后，一盏灯熄灭" : "枪声散去，无人倒下" : `${actor?.nickname ?? `${event.actorSeat ?? "?"} 号玩家`} 举起了枪`, EXECUTION: showResult ? event.outcome === "DEATH" ? "处决已完成" : "处决结束，无人死亡" : "钟楼宣读判决", DAWN: showResult ? deaths.length ? "他们未能等到黎明" : "今夜，无人死亡" : "天亮了", NIGHT_FALLS: "夜幕降临", NOMINATION: "有人提出了指控", VOTE_RESULT: event.outcome === "TIED" ? "票数持平，处决席空置" : event.outcome === "ON_BLOCK" ? "处决席已有候选" : "这轮投票已经结束", GAME_OVER: event.outcome === "GOOD" ? "晨光属于善良" : "暗夜属于邪恶", NOTICE: "钟楼来信" } as const)[event.kind] : "";
  return <>
    <button className="effects-audio" type="button" aria-pressed={sound} onClick={toggleSound} title={sound ? "关闭演出音效" : "点击启用演出音效"}>{sound ? "♪ 音效开" : "♪ 音效关"}</button>
    {event ? <section key={event.id} ref={stageRef} tabIndex={-1} className={`event-stage event-stage--${event.kind.toLowerCase()}${showResult ? " is-result" : ""}${reduced ? " is-reduced" : ""}`} role="dialog" aria-label="城镇公开演出" aria-modal="true" style={{ "--scene-delay": `${animationAnchor.current?.delay ?? 0}ms`, "--scene-duration": `${event.durationMs}ms` } as CSSProperties}>
      <div className="event-stage__grain" aria-hidden="true" /><div className="event-stage__halo" aria-hidden="true" />
      <header><span>RAVENS AT MIDNIGHT</span><span>{preview ? "演出预览" : "全员公开事件"}</span></header>
      <div className="event-stage__body">
        <p className="event-stage__eyebrow">{event.kind === "DAWN" ? `第 ${event.day ?? game?.day ?? 1} 天 · 黎明` : event.kind === "SHOT" ? "猎魔人 · 公开宣称" : event.kind === "EXECUTION" ? "城镇公决" : "钟声回响"}</p>
        <h1>{title}</h1>
        <div className="event-stage__theatre" aria-hidden="true">
          {event.kind === "SHOT" ? <><div className="shot-smoke"><i /><i /><i /></div><div className="shot-gun"><Pistol /></div><div className="shot-flare" /><div className={`event-token${showResult && event.outcome === "DEATH" ? " event-token--fallen" : ""}`}><span>{target?.seat ?? event.targetSeat}</span><b>☾</b><strong>{target?.nickname ?? "目标玩家"}</strong><div className="seal-fracture" /></div></> : null}
          {event.kind === "EXECUTION" ? <><div className="execution-arch"><div className="execution-blade" /><span>⚜</span><div className={`event-token${showResult && event.outcome === "DEATH" ? " event-token--fallen" : ""}`}><span>{target?.seat ?? event.targetSeat}</span><b>☾</b><strong>{target?.nickname ?? "被处决者"}</strong></div></div><div className="execution-dust" /></> : null}
          {event.kind === "DAWN" ? <div className="dawn-tableau"><div className="dawn-sun" /><div className="dawn-windows"><i /><i /><i /></div>{showResult ? <div className="dawn-memorial">{deaths.length ? deaths.map((seat) => <div key={seat}><span className="memorial-candle" /><strong>{game?.seats.find((player) => player.seat === seat)?.nickname ?? `${seat} 号`}</strong><small>{seat} 号 · 已死亡</small></div>) : <div><span className="memorial-candle is-lit" /><strong>所有灯火，仍然亮着</strong></div>}</div> : null}</div> : null}
          {!['SHOT', 'EXECUTION', 'DAWN'].includes(event.kind) ? <div className={`ceremony-seal ceremony-seal--${event.kind.toLowerCase()}`}><span>{event.kind === "VOTE_RESULT" ? `${event.votes ?? "—"}` : event.kind === "NOMINATION" ? event.targetSeat : event.kind === "NIGHT_FALLS" ? "☾" : "⚜"}</span><small>{event.kind === "VOTE_RESULT" ? "票" : "RAVENS"}</small></div> : null}
        </div>
        <p className="event-stage__result" aria-live="polite">{showResult || !["SHOT", "EXECUTION", "DAWN"].includes(event.kind) ? event.message : event.kind === "SHOT" ? `枪口指向 ${target?.nickname ?? `${event.targetSeat} 号玩家`}` : event.kind === "EXECUTION" ? `${target?.nickname ?? `${event.targetSeat} 号玩家`} 走向钟楼` : "每个人都屏住呼吸，等待今夜的消息。"}</p>
        {showResult && deaths.length > 0 && ["DAWN", "SHOT", "EXECUTION"].includes(event.kind) && event.outcome !== "NO_DEATH" ? <small className="event-stage__aftercare">死亡不等于离场。你仍可讨论，并保留一枚幽灵票。身份继续保密。</small> : null}
      </div>
      <footer><button type="button" onClick={toggleSound}>{sound ? "关闭音效" : "启用音效"}</button><span>{reduced ? "已尊重减少动态效果偏好" : "所有屏幕共享同一段钟声"}</span><button type="button" onClick={skip}>跳过演出</button></footer>
      <div className="event-stage__progress" style={{ transform: `scaleX(${Math.min(1, Math.max(0, 1 - elapsed / event.durationMs))})` }} />
    </section> : null}
    {privateScene ? <section className={`private-ritual private-ritual--${privateScene.kind.toLowerCase()}${event && elapsed >= 0 ? " private-ritual--compact" : ""}`} style={{ "--private-duration": preview ? "3600ms" : "1200ms" } as CSSProperties} role="status" aria-label="仅你可见的行动回执"><button type="button" onClick={() => setPrivateScene(undefined)}>收起 ×</button><p>PRIVATE · 仅你可见</p><div className="private-ritual__art" aria-hidden="true">{privateScene.kind === "POISON" ? <><div className="poison-vial"><span /></div><div className="poison-drop" /><div className="poison-mist"><i /><i /><i /></div></> : <div className="private-sigil">{privateScene.kind === "PROTECT" ? "◇" : privateScene.kind === "DIVINE" ? "✧" : "☾"}</div>}</div><h2>{privateScene.kind === "POISON" ? "毒液已悄然倾下" : privateScene.kind === "PROTECT" ? "守护的烛火已点亮" : privateScene.kind === "DIVINE" ? "你的问题已交给星辰" : "选择已经封存"}</h2><strong>{privateScene.target}</strong><small>行动已记录。实际结果以规则结算为准。</small></section> : null}
  </>;
}

function Pistol() {
  return <svg viewBox="0 0 640 330" role="img" aria-label="雕花燧发手枪"><defs><linearGradient id="gunSteel" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e8e7de" /><stop offset=".24" stopColor="#64707a" /><stop offset=".48" stopColor="#b0b4ab" /><stop offset=".6" stopColor="#313c48" /><stop offset="1" stopColor="#0c1720" /></linearGradient><linearGradient id="gunWood"><stop stopColor="#2c1513" /><stop offset=".45" stopColor="#6a3824" /><stop offset="1" stopColor="#24181a" /></linearGradient><linearGradient id="gunGold"><stop stopColor="#79512a" /><stop offset=".5" stopColor="#e0bd73" /><stop offset="1" stopColor="#926a38" /></linearGradient></defs><path d="M72 112 Q52 111 43 132 L24 203 Q20 219 35 231 L115 286 Q134 301 157 274 L231 181 L341 170 L367 128Z" fill="url(#gunWood)" stroke="#a97840" strokeWidth="4" /><path d="M231 173 Q242 236 290 210 Q315 193 300 171" fill="none" stroke="url(#gunGold)" strokeWidth="10" /><path d="M252 174 Q268 193 259 202" fill="none" stroke="#d4bc91" strokeWidth="7" /><path d="M105 112 L181 94 L572 93 L592 100 L592 132 L576 140 L200 146 L128 170Z" fill="url(#gunSteel)" stroke="#a3a4a0" strokeWidth="3" /><path d="M258 97 L572 97 M242 107 L568 107 M300 130 L570 130" stroke="#ddd2b1" strokeWidth="2" opacity=".6" /><path d="M198 99 L215 62 L246 60 L252 75 L231 79 L226 108" fill="url(#gunSteel)" stroke="#c1ae83" strokeWidth="4" /><path d="M280 94 L287 72 L309 76 L300 97" fill="url(#gunGold)" /><path d="M182 119 Q211 97 228 123 Q245 147 262 121 Q278 101 296 122" fill="none" stroke="url(#gunGold)" strokeWidth="4" /><path d="M72 151 Q97 155 133 186 Q152 208 120 252 M57 160 Q77 190 114 215" fill="none" stroke="#b28a51" strokeWidth="3" /><circle cx="205" cy="123" r="8" fill="url(#gunGold)" /><path d="M45 233 L122 288 L144 275" fill="none" stroke="url(#gunGold)" strokeWidth="12" /><path d="M570 92 L570 140 M583 95 L583 137" stroke="#c3b68d" strokeWidth="6" /><ellipse cx="596" cy="117" rx="8" ry="21" fill="#080b0e" stroke="#9d9d8f" strokeWidth="3" /></svg>;
}
