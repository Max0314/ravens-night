import { useBackLayer } from "../use-back-layer.js";
import { Button } from "@ravens/ui";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { RoomView } from "../api.js";
import { Avatar } from "../components/Avatar.js";

export function Lobby({ room, onBegin, onLeave, onTutorial, onRoles, canBegin, busy, error, participantId, onReady, onReorder }: { room: RoomView; onBegin: (tutorialMode?: "SKIP" | "OPTIONAL") => void; onLeave: () => void; onTutorial: () => void; onRoles: () => void; canBegin: boolean; busy: boolean; error?: string; participantId?: string; onReady?: (ready: boolean) => void; onReorder?: (ids: string[]) => void }) {
  const players = room.participants.filter(p => p.mode === "PLAYER").sort((a,b) => (a.seat ?? 0)-(b.seat ?? 0));
  const ids = players.map(p => p.id);
  const [preview, setPreview] = useState<string[]>();
  const [selected, setSelected] = useState<string>();
  useBackLayer(Boolean(selected),()=>setSelected(undefined));
  const [tutorial, setTutorial] = useState(false);
  const [notice, setNotice] = useState("");
  const drag = useRef<{id: string; pointer: number; x: number; y: number; active: boolean; ids: string[]} | undefined>(undefined);
  const cancel = () => { drag.current = undefined; setPreview(undefined); };
  useEffect(() => { cancel(); setSelected(undefined); }, [room.setupId]);
  useEffect(() => { const hide = () => { if (document.hidden) cancel(); }; window.addEventListener("blur", cancel); document.addEventListener("visibilitychange", hide); return () => { window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", hide); }; }, []);
  const order = preview ?? ids;
  const mine = players.find(p => p.id === participantId);
  const current = players.find(p => p.id === selected);
  const offline = players.filter(p => !p.connected);
  const canStart = !busy && !preview && players.length === room.playerCount && players.every(p => p.connected && (p.id === participantId || p.ready));
  function submit(next: string[]) { cancel(); if (next.join() !== ids.join()) { onReorder?.(next); setNotice("座序调整后，所有人需重新准备"); } }
  function move(id: string, offset: number) { const next = [...ids], from = next.indexOf(id), to = from + offset; if (to < 0 || to >= next.length) return; [next[from],next[to]] = [next[to]!, next[from]!]; submit(next); }
  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    if (!d.active && Math.hypot(event.clientX-d.x,event.clientY-d.y) < 8) return;
    d.active = true;
    const target = document.elementFromPoint?.(event.clientX,event.clientY)?.closest<HTMLElement>("[data-player-id]")?.dataset.playerId;
    if (target && d.ids.includes(target)) { const next = [...d.ids]; next.splice(next.indexOf(d.id),1); next.splice(d.ids.indexOf(target),0,d.id); d.ids = next; }
    setPreview([...d.ids]);
  }
  return <main className="compact-lobby">
    <header><button type="button" onClick={onLeave} disabled={busy}>离开房间</button><h1>等待开局</h1><span>{players.length}/{room.playerCount} 人</span></header>
    <p className="lobby-readiness">{players.filter(p => p.ready).length}/{room.playerCount} 已准备{offline.length ? ` · 离线：${offline.map(p => p.nickname).join("、")}` : ""}</p>
    <div className="lobby-seat-grid" aria-label="玩家座位">
      {Array.from({length:room.playerCount},(_,index) => { const p=players.find(p=>p.id===order[index]); return p ? <article data-player-id={p.id} key={p.id} className={preview && drag.current?.id===p.id ? "is-dragging" : ""}>
        <button className="seat-card" type="button" onClick={()=>setSelected(p.id)} aria-label={`${index+1}号 ${p.nickname} ${p.ready ? "已准备" : "未准备"}`}><span className="seat-number">{index+1}{p.id===room.organizerId ? " ♛" : ""}</span><Avatar id={p.id} name={p.nickname} url={p.avatar}/><strong title={p.nickname}>{p.nickname}</strong><small>{!p.connected ? "离线" : p.ready ? "已准备" : "未准备"}</small></button>
        {canBegin && onReorder ? <button className="seat-drag-handle" aria-label={`拖动${p.nickname}`} type="button" disabled={busy} onPointerDown={event=>{ if (event.button!==0 || drag.current) return; event.currentTarget.setPointerCapture?.(event.pointerId); drag.current={id:p.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,active:false,ids:[...ids]}; }} onPointerMove={dragMove} onPointerUp={event=>{ const d=drag.current; if (!d || d.pointer!==event.pointerId) return; if (d.active) submit(d.ids); else cancel(); event.currentTarget.releasePointerCapture?.(event.pointerId); }} onPointerCancel={cancel} onLostPointerCapture={cancel}>⠿</button> : null}
      </article> : <article className="seat-empty" key={`empty-${index}`}><span>{index+1}</span><small>等待加入</small></article>; })}
    </div>
    {current ? <section className="seat-options" aria-label="座位详情"><strong>{current.seat}号 {current.nickname}</strong><button type="button" onClick={()=>setSelected(undefined)}>关闭</button>{canBegin && onReorder ? <div><button type="button" disabled={busy || ids.indexOf(current.id)===0} onClick={()=>move(current.id,-1)}>前移</button><button type="button" disabled={busy || ids.indexOf(current.id)===ids.length-1} onClick={()=>move(current.id,1)}>后移</button><small>移除玩家请使用“更多”</small></div> : null}</section> : null}
    <div className="lobby-help"><button type="button" onClick={onRoles}>角色表</button><button type="button" onClick={onTutorial}>规则</button></div>
    {canBegin ? <label className="tutorial-choice"><input type="checkbox" checked={tutorial} onChange={e=>setTutorial(e.target.checked)}/>开局前看简短教学</label> : null}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="form-error">{error}</p> : null}
    <footer className="lobby-primary">{canBegin ? <Button onClick={()=>onBegin(tutorial ? "OPTIONAL" : "SKIP")} disabled={!canStart}>{busy ? "正在提交…" : mine?.ready ? "开始游戏" : "准备并开始"}</Button> : mine && onReady ? <><Button disabled={busy} onClick={()=>onReady(!mine.ready)}>{mine.ready ? "取消准备" : "我已准备"}</Button><small>等待房主开始</small></> : null}</footer>
  </main>;
}
