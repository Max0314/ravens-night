import { Panel, SeatRing } from "@ravens/ui";
import { useEffect, useState } from "react";
import { ApiError, getRoom, type RoomView } from "../api.js";
import { invitationQr } from "../invite.js";

const phaseCopy: Record<string, { eyebrow: string; title: string; detail: string }> = {
  ROLE_REVEAL: { eyebrow: "保持安静", title: "身份正在揭晓", detail: "请只看自己的手机" },
  FIRST_NIGHT: { eyebrow: "首夜", title: "村庄已经沉睡", detail: "系统正在依次唤醒角色" },
  OTHER_NIGHT: { eyebrow: "夜晚", title: "请闭眼并保持安静", detail: "需要行动时手机会提示" },
  DAY_DISCUSSION: { eyebrow: "白天", title: "自由讨论", detail: "分享线索，也可以暂时隐瞒身份" },
  NOMINATION: { eyebrow: "白天", title: "提名仍在继续", detail: "请在自己的手机上发起提名" },
  VOTING: { eyebrow: "公开投票", title: "请看向被提名者", detail: "所有人在手机上同时举手" },
  GAME_OVER: { eyebrow: "终局", title: "钟声停止", detail: "今夜的身份即将全部揭晓" },
};

function phaseLabel(phase: string | undefined, day: number | undefined): string {
  if (!phase) return "等待开局";
  if (phase === "ROLE_REVEAL") return "身份确认";
  if (phase === "FIRST_NIGHT") return "首夜 · 夜晚";
  if (phase === "OTHER_NIGHT") return `第 ${Math.max(day ?? 1, 1)} 夜 · 夜晚`;
  if (phase === "GAME_OVER") return "游戏结束";
  return `第 ${Math.max(day ?? 1, 1)} 天 · 白天`;
}

export function Display({ code, onBack, onRoomClosed }: { code: string; onBack: () => void; onRoomClosed: () => void }) {
  const [room, setRoom] = useState<RoomView>();
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [qr, setQr] = useState<string>();
  useEffect(() => {
    let active = true;
    const refresh = () => void getRoom(code).then((next) => { if (active) setRoom(next); }).catch((error) => {
      if (active && error instanceof ApiError && error.status === 404) onRoomClosed();
    });
    refresh(); const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [code, onRoomClosed]);
  useEffect(() => { let active = true; void invitationQr(code, 320).then((value) => { if (active) setQr(value); }).catch(() => undefined); return () => { active = false; }; }, [code]);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const game = room?.game;
  const players = room?.participants.filter((participant) => participant.mode === "PLAYER") ?? [];
  const seats = game?.seats ?? players.map((participant) => ({ seat: participant.seat!, nickname: participant.nickname, alive: true, connected: participant.connected, ghostVoteAvailable: true }));
  const copy = phaseCopy[game?.phase ?? "ROLE_REVEAL"] ?? phaseCopy.ROLE_REVEAL!;
  const nominee = game?.nomination ? seats.find((seat) => seat.seat === game.nomination!.nomineeSeat) : undefined;
  const nominator = game?.nomination ? seats.find((seat) => seat.seat === game.nomination!.nominatorSeat) : undefined;
  const publicEvents = game?.events.slice(-3).reverse() ?? [];
  const isNight = game?.phase === "FIRST_NIGHT" || game?.phase === "OTHER_NIGHT";

  return <main className={`display display--${game?.phase.toLowerCase() ?? "lobby"}`}>
    <header className="display__header"><span>鸦钟夜话 · {code}</span><div><span className={`display__phase display__phase--${isNight ? "night" : "day"}`}><span aria-hidden="true">{isNight ? "☾" : "☀"}</span>{phaseLabel(game?.phase, game?.day)}</span><button type="button" onClick={onBack}>返回首页</button><button type="button" onClick={() => void (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>{fullscreen ? "退出全屏" : "进入全屏"}</button></div></header>
    <section className="display__town"><SeatRing seats={seats} /><div className="display__center">{!game ? <div className="display__join">{qr ? <img src={qr} alt={`加入房间 ${code} 的二维码`} /> : null}<p>扫码加入 · 房间 {code}</p><h1>{players.length}/{room?.playerCount ?? "?"} 位已入座</h1><small>手机进入房间；本设备只显示公开信息</small></div> : <><p>{copy.eyebrow}</p><h1>{game.phase === "GAME_OVER" ? `${game.winner === "GOOD" ? "善良" : "邪恶"}获胜` : nominee ? nominee.nickname : copy.title}</h1><small>{game.phase === "VOTING" && game.nomination && nominee ? `${nominator?.nickname ?? "一位玩家"} 发起提名 · ${nominee.nickname}（${nominee.seat}号） · 已投 ${game.nomination.votesReceived}/${seats.length} · 过半需 ${game.nomination.threshold} 票` : copy.detail}</small></>}</div></section>
    {game ? <Panel className="display__village-feed" aria-label="村庄公开信息">
      <header><div><span aria-hidden="true">⌁</span><strong>村庄公开信息</strong></div><small>所有玩家均可得知</small></header>
      <ol>{publicEvents.map((event, index) => <li key={event.seq} className={index === 0 ? "is-latest" : ""}><span>{index === 0 ? "最新" : `记录 ${event.seq}`}</span><p>{event.message}</p></li>)}</ol>
    </Panel> : <Panel className="display__notice">{players.length}/{room?.playerCount ?? "?"} 位玩家已入座</Panel>}
  </main>;
}
