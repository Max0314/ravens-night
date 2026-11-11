import {RoomSheet,PlayerTile} from "./RoomPage.js";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { acknowledgeDraft, editDraft, type WhisperDrafts } from "../whisper-drafts.js";
import { Button } from "@ravens/ui";
import { inviteWhisper, leaveWhisper, respondWhisper, sendWhisper, type PrivateView } from "../api.js";

export function SocialRoom({ code, view, onRefresh, drafts, setDrafts }: { code: string; view: PrivateView; onRefresh: () => void | Promise<void>; drafts: WhisperDrafts; setDrafts: Dispatch<SetStateAction<WhisperDrafts>> }) {
  const [open,setOpen]=useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();

  const social = view.social;
  const night = ["FIRST_NIGHT", "OTHER_NIGHT", "ROLE_REVEAL"].includes(view.game?.phase ?? "");
  const active = social?.activeWhisper;
  useEffect(()=>{if(active)setOpen(true);},[active?.id]);
  const draft = active ? drafts[active.id]?.text ?? "" : "";
  const names = (seat: number) => view.game?.seats.find((player) => player.seat === seat)?.nickname ?? `${seat} 号`;
  async function run(operation: () => Promise<unknown>) { setBusy(true); setError(undefined); try { await operation(); await onRefresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "这封信未能送达"); } finally { setBusy(false); } }
  return <><button type="button" className="social-entry" onClick={()=>setOpen(true)}>耳语{active?" · 当前会话":social?.invitations.some(i=>i.status.toUpperCase()==="PENDING")?" · 新邀请":""}</button>{open?<RoomSheet title="耳语" onClose={()=>setOpen(false)}><section className="social-room" aria-label="玩家会客室"><header><span>{night ? "夜间休息" : "仅参与者可见"}</span></header>
    {night ? <p className="social-room__quiet">夜深了，所有私聊暂时停止。天亮后可继续交谈。</p> : <>
      {social?.invitations.filter((invitation) => invitation.status === "PENDING" || invitation.status === "pending").map((invitation) => <div className="whisper-invitation" key={invitation.id}><p>{invitation.toSeat === view.participant.seat ? `${names(invitation.fromSeat)} 邀你私下聊聊` : `已邀请 ${names(invitation.toSeat)}，等待回应`}</p>{invitation.toSeat === view.participant.seat ? <div><Button disabled={busy} onClick={() => void run(() => respondWhisper(code, invitation.id, true))}>接受邀请</Button><Button variant="quiet" disabled={busy} onClick={() => void run(() => respondWhisper(code, invitation.id, false))}>婉拒</Button></div> : <Button variant="quiet" disabled={busy} onClick={() => void run(() => leaveWhisper(code))}>撤回邀请</Button>}</div>)}
      {active ? <div className="whisper-room"><div className="whisper-room__title"><strong>与 {active.participants.filter((seat) => seat !== view.participant.seat).map(names).join("、")} 的耳语</strong><button disabled={busy} type="button" onClick={() => void run(() => leaveWhisper(code))}>返回广场</button></div><ol aria-live="polite" aria-label="私聊消息">{active.messages.length ? active.messages.map((message) => <li key={message.id} className={message.seat === view.participant.seat ? "is-mine" : ""}><small>{names(message.seat)}</small><p>{message.text}</p></li>) : <li className="whisper-room__empty">房门已掩上，现在可以交谈。</li>}</ol><form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) void run(async () => { const version=drafts[active.id]!.version; await sendWhisper(code, active.id, draft.trim(),()=>setDrafts(current=>acknowledgeDraft(current,active.id,version))); }); }}><label className="sr-only" htmlFor="whisper-message">私聊内容</label><input id="whisper-message" maxLength={500} value={draft} onChange={(event) => setDrafts(current=>editDraft(current,active.id,event.target.value,active.participants.filter(s=>s!==view.participant.seat).map(names).join("、")))} placeholder="低声说些什么…" autoComplete="off" /><Button disabled={busy || !draft.trim()} type="submit">发送</Button></form></div> : <div className="whisper-invite-grid">{view.game?.seats.filter((seat) => seat.seat !== view.participant.seat).map((seat) => <PlayerTile key={seat.seat} player={seat} disabled={busy||!seat.connected} onClick={()=>void run(()=>inviteWhisper(code,seat.seat))} detail={seat.connected?"邀请耳语":"暂时离线"}/>)}</div>}
    </>}
    {Object.entries(drafts).filter(([id,draft])=>id!==active?.id && draft.text).map(([id,draft])=><section className="closed-draft" key={id}><strong>与 {draft.label} 的未发送草稿</strong><p>耳语已结束，仅可复制或丢弃。</p><textarea aria-label="已结束耳语草稿" readOnly value={draft.text}/><button type="button" onClick={()=>void navigator.clipboard?.writeText(draft.text).catch(()=>setError("请长按草稿复制"))}>复制</button><button type="button" onClick={()=>setDrafts(current=>{const next={...current};delete next[id];return next;})}>丢弃</button></section>)}

    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section></RoomSheet>:null}</>;
}
