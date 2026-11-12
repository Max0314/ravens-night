import {FeedbackButton} from '@ravens/ui';
import { useEffect, useState } from "react";
import { invitationQr, invitationUrl, displayInvitationUrl } from "../invite.js";
export function InviteTools({ code, voiceRoomUrl }: { code: string; voiceRoomUrl?: string | undefined }) {
  const [qr,setQr]=useState<string>();
  const [notice,setNotice]=useState("");
  useEffect(()=>{let active=true;void invitationQr(code,240).then(value=>{if(active)setQr(value);}).catch(()=>undefined);return()=>{active=false;};},[code]);
  async function copy(value: string) { try { if(!navigator.clipboard)throw Error();await navigator.clipboard.writeText(value);setNotice("已复制"); } catch {setNotice("请长按下方链接复制，或使用二维码");} }
  return <><a className="room-display-entry" href={displayInvitationUrl(code)} target="_blank" rel="noopener noreferrer">公共大屏 ↗</a><details className="invite-tools"><summary>邀请与语音</summary><p>房间码 <strong>{code}</strong></p>{qr ? <img src={qr} width="160" height="160" alt={`房间 ${code} 邀请二维码`}/> : null}<input aria-label="邀请链接" readOnly value={invitationUrl(code)} onFocus={event=>event.currentTarget.select()}/><FeedbackButton type="button" onClick={()=>void copy(invitationUrl(code))}>复制邀请链接</FeedbackButton>{voiceRoomUrl ? <><a href={voiceRoomUrl} target="_blank" rel="noopener noreferrer">进入语音频道 · {new URL(voiceRoomUrl).hostname}</a><input readOnly aria-label="语音链接" value={voiceRoomUrl}/><FeedbackButton type="button" onClick={()=>void copy(voiceRoomUrl)}>复制语音链接</FeedbackButton></> : null}<p role="status">{notice}</p></details></>;
}
