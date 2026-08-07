import { Button, Panel, SeatRing } from "@ravens/ui";
import { useEffect, useState } from "react";
import type { RoomPlayMode, RoomView } from "../api.js";
import { invitationQr, invitationUrl } from "../invite.js";

const modeCopy: Record<RoomPlayMode, { eyebrow: string; title: string; detail: string }> = {
  IN_PERSON: { eyebrow: "围桌线下", title: "公共大屏可直接用邀请码加入", detail: "大家围坐讨论；手机只显示自己的私密身份和夜间行动。" },
  REMOTE: { eyebrow: "纯线上", title: "每个人都带着自己的公开城镇", detail: "手机或电脑同时呈现公开局面与私密信息；建议进入同一语音/视频频道。" },
  HYBRID: { eyebrow: "混合模式", title: "现场与远程玩家共享这张桌子", detail: "现场使用公共大屏，远程玩家在个人页面查看同一份公开局面。" },
};

export function Lobby({ room, onBegin, onLeave, onTutorial, onRoles, canBegin, busy, error }: { room: RoomView; onBegin: () => void; onLeave: () => void; onTutorial: () => void; onRoles: () => void; canBegin: boolean; busy: boolean; error?: string }) {
  const players = room.participants.filter((participant) => participant.mode === "PLAYER");
  const seats = Array.from({ length: room.playerCount }, (_, index) => {
    const player = players.find((candidate) => candidate.seat === index + 1);
    return { seat: index + 1, nickname: player?.nickname ?? "等待加入", alive: true, connected: player?.connected ?? false };
  });
  const playMode = room.playMode ?? "IN_PERSON";
  const mode = modeCopy[playMode];
  return <main className={`lobby lobby--${playMode.toLowerCase()}${canBegin ? " lobby--host" : ""}`}>
    <section className="lobby__heading"><p>房间邀请码</p><h1>{room.code}</h1><p>{players.length}/{room.playerCount} 位玩家已入座</p><div className="lobby__guide-links"><button type="button" onClick={onTutorial}>教程</button><button type="button" onClick={onRoles}>角色表</button><button className="lobby__leave" type="button" onClick={onLeave} disabled={busy}>退出房间</button></div></section>
    <SeatRing seats={seats} />
    <Panel className="lobby__status">
      <section className="lobby__mode"><p>{mode.eyebrow}</p><h2>{mode.title}</h2><span>{mode.detail}</span>{room.voiceRoomUrl ? <a href={room.voiceRoomUrl} target="_blank" rel="noreferrer">进入语音/视频频道 ↗</a> : playMode !== "IN_PERSON" ? <small>房主没有附上语音链接；请自行约定讨论频道。</small> : null}</section>
      <p className="lobby__host">当前房主：<strong>{room.organizerName ?? players[0]?.nickname ?? "等待首位玩家"}</strong>{canBegin ? "（你）" : ""}</p>
      <h2>{players.length === room.playerCount ? "所有人都已抵达" : "等待其他村民…"}</h2>
      <p>扫描二维码，或访问本站后输入相同邀请码。公共大屏可直接选择“电视公共大屏”加入。</p>
      <InviteTools code={room.code} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {canBegin ? <Button onClick={onBegin} disabled={players.length < room.playerCount || busy}>{busy ? "正在敲响钟声…" : "开始新手教学"}</Button> : <p className="lobby__waiting">等待房主 {room.organizerName ?? players[0]?.nickname ?? ""} 开始教学</p>}
    </Panel>
  </main>;
}

function InviteTools({ code }: { code: string }) {
  const [qr, setQr] = useState<string>();
  const [copied, setCopied] = useState(false);
  useEffect(() => { let active = true; void invitationQr(code, 240).then((value) => { if (active) setQr(value); }).catch(() => undefined); return () => { active = false; }; }, [code]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(invitationUrl(code)); setCopied(true); window.setTimeout(() => setCopied(false), 1_800); }
    catch { setCopied(false); }
  };
  return <details className="lobby__invite"><summary>扫码或复制邀请链接</summary><div>{qr ? <img src={qr} alt={`加入房间 ${code} 的二维码`} /> : <span className="qr-placeholder">正在生成二维码…</span>}<button type="button" onClick={() => void copy()}>{copied ? "已复制" : "复制加入链接"}</button></div></details>;
}
