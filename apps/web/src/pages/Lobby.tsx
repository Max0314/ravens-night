import { Button, Panel, SeatRing } from "@ravens/ui";
import { useEffect, useState } from "react";
import type { RoomPlayMode, RoomView } from "../api.js";
import { invitationQr, invitationUrl } from "../invite.js";
import { effectsAudioEnabled, enableEffectsAudio } from "../components/experience-audio.js";

const modeCopy: Record<RoomPlayMode, { eyebrow: string; title: string; detail: string }> = {
  IN_PERSON: { eyebrow: "围桌线下", title: "一部手机，也是完整的钟楼", detail: "围坐讨论；每个人都能在手机查看公开城镇与全局演出。大屏随时可以加入。" },
  REMOTE: { eyebrow: "纯线上", title: "每个人都带着自己的公开城镇", detail: "手机或电脑同时呈现公开局面与私密信息；建议进入同一语音/视频频道。" },
  HYBRID: { eyebrow: "混合模式", title: "现场与远程玩家共享这张桌子", detail: "现场使用公共大屏，远程玩家在个人页面查看同一份公开局面。" },
};

export function Lobby({ room, onBegin, onLeave, onTutorial, onRoles, canBegin, busy, error, participantId, onReady, onReorder }: { room: RoomView; onBegin: () => void; onLeave: () => void; onTutorial: () => void; onRoles: () => void; canBegin: boolean; busy: boolean; error?: string; participantId?: string; onReady?: (ready: boolean) => void; onReorder?: (ids: string[]) => void }) {
  const players = room.participants.filter((participant) => participant.mode === "PLAYER");
  const seats = Array.from({ length: room.playerCount }, (_, index) => {
    const player = players.find((candidate) => candidate.seat === index + 1);
    return { seat: index + 1, nickname: player?.nickname ?? "等待加入", alive: true, connected: player?.connected ?? false };
  });
  const playMode = room.playMode ?? "IN_PERSON";
  const mode = modeCopy[playMode];
  const [sound, setSound] = useState(effectsAudioEnabled);
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const mine = players.find((player) => player.id === participantId);
  const readyCount = players.filter((player) => player.ready).length;
  function move(index: number, offset: number) { const ids = ordered.map((player) => player.id); const target = index + offset; if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target]!, ids[index]!]; onReorder?.(ids); }
  return <main className={`lobby lobby--${playMode.toLowerCase()}${canBegin ? " lobby--host" : ""}`}>
    <section className="lobby__heading"><p>房间邀请码</p><h1>{room.code}</h1><p>{players.length}/{room.playerCount} 位玩家已入座</p><div className="lobby__guide-links"><button type="button" onClick={onTutorial}>教程</button><button type="button" onClick={onRoles}>角色表</button><button className="lobby__leave" type="button" onClick={onLeave} disabled={busy}>退出房间</button></div></section>
    <SeatRing seats={seats} />
    <Panel className="lobby__status">
      <section className="lobby__mode"><p>{mode.eyebrow}</p><h2>{mode.title}</h2><span>{mode.detail}</span>{room.voiceRoomUrl ? <a href={room.voiceRoomUrl} target="_blank" rel="noreferrer">进入语音/视频频道 ↗</a> : playMode !== "IN_PERSON" ? <small>房主没有附上语音链接；请自行约定讨论频道。</small> : null}</section>
      <p className="lobby__host">当前房主：<strong>{room.organizerName ?? players[0]?.nickname ?? "等待首位玩家"}</strong>{canBegin ? "（你）" : ""}</p>
      <h2>{players.length === room.playerCount ? "所有人都已抵达" : "等待其他村民…"}</h2>
      <p>扫描二维码，或访问本站后输入相同邀请码。公共大屏可直接选择“电视公共大屏”加入。</p>
      <InviteTools code={room.code} />
      <p className="lobby__rules">{room.rulesSummary ?? (room.playerCount <= 6 ? "5–6 人：小镇模式。邪恶玩家互不认识，恶魔没有安全伪装。" : "暗流涌动 · 标准角色配置与完整夜序")}</p>
      <label className="lobby-sound"><input type="checkbox" checked={sound} onChange={(event) => { setSound(event.target.checked); void enableEffectsAudio(event.target.checked); }} /><span>开启本机演出音效<small>枪声与钟声公开播放；私密行动保持安静</small></span></label>
      <ol className="lobby-player-list" aria-label="玩家准备状态">{ordered.map((player, index) => <li key={player.id}><span>{player.seat}</span><strong>{player.nickname}{player.id === participantId ? " · 你" : ""}</strong><small className={player.ready ? "is-ready" : ""}>{!player.connected ? "离线" : player.ready ? "已准备" : "未准备"}</small>{canBegin && onReorder ? <div><button aria-label={`将${player.nickname}座位前移`} type="button" disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button aria-label={`将${player.nickname}座位后移`} type="button" disabled={busy || index === ordered.length - 1} onClick={() => move(index, 1)}>↓</button></div> : null}</li>)}</ol>
      {mine && onReady ? <Button variant={mine.ready ? "quiet" : "gold"} onClick={() => onReady(!mine.ready)} disabled={busy}>{mine.ready ? "取消准备" : "我已准备好"} · {readyCount}/{room.playerCount}</Button> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {canBegin ? <Button onClick={onBegin} disabled={players.length < room.playerCount || busy || Boolean(onReady && readyCount < room.playerCount)}>{busy ? "正在敲响钟声…" : "开始新手教学"}</Button> : <p className="lobby__waiting">等待房主 {room.organizerName ?? players[0]?.nickname ?? ""} 开始教学</p>}
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
