import { useBackLayer } from "../use-back-layer.js";
import { InviteTools } from "./InviteTools.js";
import { GramophonePlayer } from "./GramophonePlayer.js";
import { ResultBoard } from "./ResultBoard.js";
import { effectsAudioEnabled, enableEffectsAudio } from "./experience-audio.js";
import type { GuideMode } from "./GuideOverlay.js";
import { useEffect, useState } from "react";
import { abortRoom, cancelTutorialRoom, claimRoomHost, createRecoveryCode, hasPendingCommand, removeRoomPlayer, reopenRoom, retryPendingCommand, type PrivateView, type RoomView } from "../api.js";

/** The same recovery/management entry is reachable before, during and after a game. */
export function RoomTools({ room, participantId, view, onChanged, onLeft, onGuide }: { room: RoomView; participantId: string; view?: PrivateView; onChanged: () => Promise<void>; onLeft?: () => void; onGuide?: (mode: GuideMode) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [recovery, setRecovery] = useState<{ recoveryCode: string; expiresAt: number }>();
  const [confirmation, setConfirmation] = useState<{ text: string; run: () => Promise<unknown> }>();
  const [open,setOpen]=useState(false);
  useBackLayer(open,()=>setOpen(false));
  useBackLayer(Boolean(confirmation),()=>setConfirmation(undefined));
  const [sound,setSound]=useState(effectsAudioEnabled);
  const host = room.organizerId === participantId;
  const locked = (room.game?.presentationUntil ?? 0) > (room.serverNow ?? Date.now());
  useEffect(() => {
    const hide = () => { if (document.hidden) { setRecovery(undefined); setConfirmation(undefined); } };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => { setConfirmation(undefined); setRecovery(undefined); }, [room.setupId, participantId]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try {
      const result = await action();
      setConfirmation(undefined);
      if (result && typeof result === "object" && "left" in result && result.left === true) { onLeft?.(); return; }
      await onChanged();
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "操作失败"); await onChanged().catch(() => undefined); }
    finally { setBusy(false); }
  }
  return <details className="room-tools" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>更多</summary><section aria-label="房间操作">
    <strong>房间 {room.code}</strong>
    <InviteTools code={room.code} voiceRoomUrl={room.voiceRoomUrl}/>
    {onGuide ? <div>{(["roles","tutorial",...(view?.role?["mine"]:[])] as GuideMode[]).map(mode=><button type="button" key={mode} onClick={event=>{setOpen(false);onGuide(mode);}}>{mode==="mine"?"我的角色":mode==="roles"?"角色表":"规则帮助"}</button>)}</div> : null}
    {room.game ? <button type="button" onClick={event=>{setOpen(false);window.dispatchEvent(new Event("ravens:cover-private"));}}>遮住私密内容</button> : null}
    <label><input type="checkbox" checked={sound} onChange={event=>{setSound(event.target.checked);void enableEffectsAudio(event.target.checked);}}/>演出音效</label><GramophonePlayer/>
    {room.state === "LOBBY" ? <details><summary>上局战报</summary><ResultBoard code={room.code}/></details> : null}
    <button type="button" disabled={busy} onClick={() => void run(async () => setRecovery(await createRecoveryCode(room.code)))}>{recovery && recovery.expiresAt <= Date.now() ? "重新生成恢复码" : "换设备恢复码"}</button>
    {recovery ? <div className="room-tools__recovery"><code>{recovery.recoveryCode}</code><small>10分钟内在新设备输入；请私下保存</small></div> : null}
    {!host && room.organizerId && (room.hostClaimAt ?? Infinity) <= (room.serverNow ?? Date.now()) ? <button type="button" disabled={busy} onClick={() => setConfirmation({ text: "房主已离线5分钟，接任后你可以中止或重开本局。", run: () => claimRoomHost(room.code, room.organizerId!) })}>接任房主</button> : null}
    {host && room.state === "TUTORIAL" ? <button type="button" disabled={busy} onClick={() => setConfirmation({ text: "取消本次教学，所有人返回大厅并重新准备。", run: () => cancelTutorialRoom(room.code) })}>取消教学</button> : null}
    {host && room.state === "RUNNING" ? <button type="button" disabled={busy || locked || view?.canAbort === false} onClick={() => setConfirmation({ text: "本局不判胜负，所有人返回大厅并重新准备。", run: () => reopenRoom(room.code) })}>重开本局</button> : null}
    {host && ["GAME_OVER", "ABORTED"].includes(room.state) ? <button type="button" disabled={busy || locked || view?.canRestart === false} onClick={() => void run(() => reopenRoom(room.code))}>{room.state === "GAME_OVER" ? "下一把" : "返回大厅"}</button> : null}
    {host && ["LOBBY", "TUTORIAL"].includes(room.state) ? <details><summary>移除玩家</summary>{room.participants.filter(p => p.mode === "PLAYER" && p.id !== participantId).map(p => <button type="button" key={p.id} disabled={busy} onClick={() => setConfirmation({ text: `移除 ${p.nickname}？${room.state === "TUTORIAL" ? "本次教学会同时取消，" : ""}所有人须重新准备。`, run: () => removeRoomPlayer(room.code, p.id, room.state === "TUTORIAL") })}>{p.seat}号 {p.nickname}</button>)}</details> : null}
    {hasPendingCommand(room.code) ? <button type="button" disabled={busy} onClick={() => void run(() => retryPendingCommand(room.code))}>重试待确认操作</button> : null}
    {confirmation ? <div role="alertdialog" aria-label="确认房间操作"><p>{confirmation.text}</p><button type="button" disabled={busy} onClick={() => void run(confirmation.run)}>确认</button><button type="button" disabled={busy} onClick={() => setConfirmation(undefined)}>取消</button></div> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section></details>;
}
