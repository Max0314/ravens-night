import { useState } from "react";
import { Button } from "@ravens/ui";
import { createRecoveryCode, inviteWhisper, leaveWhisper, respondWhisper, sendWhisper, type PrivateView } from "../api.js";

export function SocialRoom({ code, view, onRefresh }: { code: string; view: PrivateView; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [draft, setDraft] = useState("");
  const [recovery, setRecovery] = useState<{ recoveryCode: string; expiresAt: number }>();
  const [copied, setCopied] = useState(false);
  const social = view.social;
  const night = ["FIRST_NIGHT", "OTHER_NIGHT", "ROLE_REVEAL"].includes(view.game?.phase ?? "");
  const active = social?.activeWhisper;
  const names = (seat: number) => view.game?.seats.find((player) => player.seat === seat)?.nickname ?? `${seat} 号`;
  async function run(operation: () => Promise<unknown>) { setBusy(true); setError(undefined); try { await operation(); onRefresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "这封信未能送达"); } finally { setBusy(false); } }
  return <section className="social-room" aria-label="玩家会客室"><header><div><p>THE PARLOUR</p><h2>会客室</h2></div><span>{night ? "夜间休息" : "白天开放"}</span></header><p>耳语内容只在参与者的设备上显示。死亡玩家同样可以参与白天交流。</p>
    {night ? <p className="social-room__quiet">夜深了，所有私聊暂时停止。天亮后可继续交谈。</p> : <>
      {social?.invitations.filter((invitation) => invitation.status === "PENDING" || invitation.status === "pending").map((invitation) => <div className="whisper-invitation" key={invitation.id}><p>{invitation.toSeat === view.participant.seat ? `${names(invitation.fromSeat)} 邀你私下聊聊` : `已邀请 ${names(invitation.toSeat)}，等待回应`}</p>{invitation.toSeat === view.participant.seat ? <div><Button disabled={busy} onClick={() => void run(() => respondWhisper(code, invitation.id, true))}>接受邀请</Button><Button variant="quiet" disabled={busy} onClick={() => void run(() => respondWhisper(code, invitation.id, false))}>婉拒</Button></div> : <Button variant="quiet" disabled={busy} onClick={() => void run(() => leaveWhisper(code))}>撤回邀请</Button>}</div>)}
      {active ? <div className="whisper-room"><div className="whisper-room__title"><strong>与 {active.participants.filter((seat) => seat !== view.participant.seat).map(names).join("、")} 的耳语</strong><button disabled={busy} type="button" onClick={() => void run(() => leaveWhisper(code))}>返回广场</button></div><ol aria-live="polite" aria-label="私聊消息">{active.messages.length ? active.messages.map((message) => <li key={message.id} className={message.seat === view.participant.seat ? "is-mine" : ""}><small>{names(message.seat)}</small><p>{message.text}</p></li>) : <li className="whisper-room__empty">房门已掩上，现在可以交谈。</li>}</ol><form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void run(async () => { await sendWhisper(code, active.id, draft.trim()); setDraft(""); }); }}><label className="sr-only" htmlFor="whisper-message">私聊内容</label><input id="whisper-message" maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="低声说些什么…" autoComplete="off" /><Button disabled={busy || !draft.trim()} type="submit">发送</Button></form></div> : <div className="whisper-invite-grid">{view.game?.seats.filter((seat) => seat.seat !== view.participant.seat).map((seat) => <button key={seat.seat} type="button" disabled={busy || !seat.connected} onClick={() => void run(() => inviteWhisper(code, seat.seat))}><span>{seat.seat}</span><strong>{seat.nickname}</strong><small>{seat.connected ? "邀请耳语" : "暂时离线"}</small></button>)}</div>}
    </>}
    <details className="device-recovery"><summary>在另一台设备恢复我的座位</summary><p>先生成一次性恢复码，再在新设备的加入页面输入。恢复后，旧设备会退出你的座位。</p>{recovery ? <div><strong>{recovery.recoveryCode}</strong><small>有效至 {new Date(recovery.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} · 不要转发给他人</small><Button variant="quiet" onClick={() => void navigator.clipboard.writeText(recovery.recoveryCode).then(() => setCopied(true)).catch(() => setError("复制失败，请长按上方恢复码复制"))}>{copied ? "已复制恢复码" : "复制恢复码"}</Button></div> : <Button variant="quiet" disabled={busy} onClick={() => void run(async () => setRecovery(await createRecoveryCode(code)))}>生成恢复码</Button>}</details>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
