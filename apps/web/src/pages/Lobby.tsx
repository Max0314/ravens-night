import { Button, Panel, SeatRing } from "@ravens/ui";
import type { RoomView } from "../api.js";

export function Lobby({ room, onBegin, canBegin, busy, error }: { room: RoomView; onBegin: () => void; canBegin: boolean; busy: boolean; error?: string }) {
  const players = room.participants.filter((participant) => participant.mode === "PLAYER");
  const seats = Array.from({ length: room.playerCount }, (_, index) => {
    const player = players.find((candidate) => candidate.seat === index + 1);
    return { seat: index + 1, nickname: player?.nickname ?? "等待加入", alive: true, connected: player?.connected ?? false };
  });
  return <main className="lobby"><section className="lobby__heading"><p>房间邀请码</p><h1>{room.code}</h1><p>{players.length}/{room.playerCount} 位玩家已入座</p></section><SeatRing seats={seats} /><Panel className="lobby__status"><h2>{players.length === room.playerCount ? "所有人都已抵达" : "等待其他村民…"}</h2><p>让大家访问这个页面，输入相同的邀请码。公共电脑也使用相同邀请码并选择“大屏”。</p>{error ? <p className="form-error" role="alert">{error}</p> : null}{canBegin ? <Button onClick={onBegin} disabled={players.length < room.playerCount || busy}>{busy ? "正在敲响钟声…" : "开始新手教学"}</Button> : <p className="lobby__waiting">由创建者开始教学</p>}</Panel></main>;
}
