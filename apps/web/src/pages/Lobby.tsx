import { Button, Panel, SeatRing } from "@ravens/ui";
import { useEffect, useState } from "react";
import type { RoomView } from "../api.js";
import { invitationQr, invitationUrl } from "../invite.js";

export function Lobby({ room, onBegin, onLeave, onTutorial, onRoles, canBegin, busy, error }: { room: RoomView; onBegin: () => void; onLeave: () => void; onTutorial: () => void; onRoles: () => void; canBegin: boolean; busy: boolean; error?: string }) {
  const players = room.participants.filter((participant) => participant.mode === "PLAYER");
  const seats = Array.from({ length: room.playerCount }, (_, index) => {
    const player = players.find((candidate) => candidate.seat === index + 1);
    return { seat: index + 1, nickname: player?.nickname ?? "等待加入", alive: true, connected: player?.connected ?? false };
  });
  return <main className="lobby"><section className="lobby__heading"><p>房间邀请码</p><h1>{room.code}</h1><p>{players.length}/{room.playerCount} 位玩家已入座</p><div className="lobby__guide-links"><button type="button" onClick={onTutorial}>教程</button><button type="button" onClick={onRoles}>角色表</button><button className="lobby__leave" type="button" onClick={onLeave} disabled={busy}>退出房间</button></div></section><SeatRing seats={seats} /><Panel className="lobby__status"><p className="lobby__host">当前房主：<strong>{room.organizerName ?? players[0]?.nickname ?? "等待首位玩家"}</strong>{canBegin ? "（你）" : ""}</p><h2>{players.length === room.playerCount ? "所有人都已抵达" : "等待其他村民…"}</h2><p>让大家扫描二维码，或访问本站后输入相同邀请码。电视电脑请选择“公共大屏”。房主退出时，权限会自动移交给下一位玩家。</p><InviteTools code={room.code} />{error ? <p className="form-error" role="alert">{error}</p> : null}{canBegin ? <Button onClick={onBegin} disabled={players.length < room.playerCount || busy}>{busy ? "正在敲响钟声…" : "开始新手教学"}</Button> : <p className="lobby__waiting">等待房主 {room.organizerName ?? players[0]?.nickname ?? ""} 开始教学</p>}</Panel></main>;
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
