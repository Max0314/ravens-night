import { RoomSheet } from "./RoomPage.js";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { acknowledgeDraft, editDraft, type WhisperDrafts } from "../whisper-drafts.js";
import { Button } from "@ravens/ui";
import { leaveWhisper, respondWhisper, sendWhisper, type PrivateView } from "../api.js";
import "../styles/town-social.css";

export function SocialRoom({ code, view, open, onClose, onRefresh, drafts, setDrafts }: {
  code: string; view: PrivateView; open: boolean; onClose: () => void;
  onRefresh: () => void | Promise<void>; drafts: WhisperDrafts; setDrafts: Dispatch<SetStateAction<WhisperDrafts>>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const close = useRef(onClose); close.current = onClose;
  const social = view.social;
  const night = ["FIRST_NIGHT", "OTHER_NIGHT", "ROLE_REVEAL"].includes(view.game?.phase ?? "");
  const active = social?.activeWhisper;
  const pending = social?.invitations.filter(invitation => invitation.status.toUpperCase() === "PENDING") ?? [];
  useEffect(() => { if (night && open) close.current(); }, [night, open]);
  useEffect(() => { setError(undefined); }, [active?.id, open]);
  const draft = active ? drafts[active.id]?.text ?? "" : "";
  const names = (seat: number) => view.game?.seats.find(player => player.seat === seat)?.nickname ?? `${seat}号`;
  const partner = active?.participants.filter(seat => seat !== view.participant.seat).map(names).join("、");
  const closedDrafts = Object.entries(drafts).filter(([id, item]) => id !== active?.id && item.text);
  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setError(undefined);
    try { await operation(); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作未完成，请重试"); }
    finally { setBusy(false); }
  }
  if (!open || night) return null;
  const actions = <>
    {active ? <><form className="town-whisper-compose" onSubmit={event => {
      event.preventDefault();
      if (draft.trim() && !busy) void run(async () => {
        const version = drafts[active.id]!.version;
        await sendWhisper(code, active.id, draft.trim(), () => setDrafts(current => acknowledgeDraft(current, active.id, version)));
      });
    }}><label className="sr-only" htmlFor="whisper-message">私聊内容</label><input id="whisper-message" maxLength={500} value={draft} onChange={event => setDrafts(current => editDraft(current, active.id, event.target.value, partner ?? "玩家"))} placeholder="输入消息" autoComplete="off" /><Button disabled={busy || !draft.trim()} type="submit">发送</Button></form><button className="town-whisper-leave" disabled={busy} type="button" onClick={() => void run(() => leaveWhisper(code))}>结束私聊</button></> : null}
    {pending.map(invitation => <div className="town-whisper-response" key={invitation.id}>{invitation.toSeat === view.participant.seat ? <><Button disabled={busy} onClick={() => void run(() => respondWhisper(code, invitation.id, true))}>接受邀请</Button><Button variant="quiet" disabled={busy} onClick={() => void run(() => respondWhisper(code, invitation.id, false))}>婉拒</Button></> : <Button variant="quiet" disabled={busy} onClick={() => void run(() => leaveWhisper(code))}>撤回邀请</Button>}</div>)}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </>;
  return <RoomSheet title={active ? `与 ${partner} 私聊` : pending.length ? "私聊邀请" : "私聊已结束"} onClose={onClose} actions={actions}><section className="social-room social-room--town" aria-label="玩家会客室">
    <p className="town-whisper-privacy">关系全桌可见，消息仅双方可见</p>
    {pending.map(invitation => <p className="whisper-invitation" key={invitation.id}>{invitation.toSeat === view.participant.seat ? `${names(invitation.fromSeat)} 邀请你私聊` : `已邀请 ${names(invitation.toSeat)}，等待回应`}</p>)}
    {active ? <ol className="town-whisper-messages" aria-live="polite" aria-label="私聊消息">{active.messages.length ? active.messages.map(message => <li key={message.id} className={message.seat === view.participant.seat ? "is-mine" : ""}><small>{names(message.seat)}</small><p>{message.text}</p></li>) : <li className="whisper-room__empty">暂无消息</li>}</ol> : !pending.length ? <p>返回城镇，点击玩家头像发起新的邀请。</p> : null}
    {closedDrafts.length ? <details className="town-whisper-drafts" open={!active && !pending.length}><summary>未发送的草稿（{closedDrafts.length}）</summary>{closedDrafts.map(([id, item]) => <section className="closed-draft" key={id}><strong>与 {item.label} 的草稿</strong><textarea aria-label="已结束耳语草稿" readOnly value={item.text} /><button type="button" onClick={() => void navigator.clipboard?.writeText(item.text).catch(() => setError("请长按草稿复制"))}>复制</button><button type="button" onClick={() => setDrafts(current => { const next = { ...current }; delete next[id]; return next; })}>丢弃</button></section>)}</details> : null}
  </section></RoomSheet>;
}
