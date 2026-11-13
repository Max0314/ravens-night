import {PublicNominationAudio} from '../components/PublicNominationAudio.js';
import {simultaneousBallotStatus} from '../components/ballot-status.js';
import {GlobalAudioButton} from '../components/GlobalAudioButton.js';
import {RoundTable} from '../components/RoundTable.js';
import {publicNightDeathSeats} from '../components/public-night-deaths.js';
import {playerLabel,formatPlayerText} from '@ravens/ui';
import '../styles/display-town.css';
import {SeatOrderGrid} from '../components/SeatOrderGrid.js';
import {Avatar} from '../components/Avatar.js';
import {useGameClock} from "../use-game-clock.js";
import { Panel, SeatRing } from "@ravens/ui";
import { useCallback, useEffect, useState } from "react";
import { ApiError, getRoom, type RoomParticipant, type RoomView } from "../api.js";
import { invitationQr } from "../invite.js";
import { EventStage, publicEventsAt } from "../components/EventStage.js";
import { connectRoomFeed } from "../room-live.js";
import { isOlderSnapshot } from "../snapshot-order.js";

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
  const [seatError, setSeatError] = useState<string>();
  const[upgrade,setUpgrade]=useState(false);
  const acceptRoom = useCallback((incoming: RoomView) => setRoom((previous) => {
    if (isOlderSnapshot(incoming, previous)) return previous;
    return incoming;
  }), []);
  useEffect(() => {
    let active = true;
    const refresh = () => void getRoom(code, "DISPLAY").then((next) => { if (active) { acceptRoom(next); setSeatError(undefined); } }).catch((error) => {
      if(active&&error instanceof ApiError&&error.status===426){setUpgrade(true);return;}
      if (active && error instanceof ApiError && [401, 403, 404].includes(error.status)) onRoomClosed();
      else if (active) setSeatError("连接暂时中断，正在重新同步城镇…");
    });
    refresh(); const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [code, onRoomClosed]);
  useEffect(() => { let active = true; void invitationQr(code, 720).then((value) => { if (active) setQr(value); }).catch(() => undefined); return () => { active = false; }; }, [code]);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    return connectRoomFeed(code, "DISPLAY", (payload) => acceptRoom(payload.room));
  }, [code]);

  const game = room?.game;
  const now=useGameClock(game,room);
  const players = [...(room?.participants.filter((participant) => participant.mode === "PLAYER") ?? [])]
    .sort((left, right) => left.seat! - right.seat!);
  const seats = game?.seats ?? players.map((participant) => ({ seat: participant.seat!, nickname: participant.nickname, avatar: participant.avatar, alive: true, connected: participant.connected, ghostVoteAvailable: true }));
  const copy = phaseCopy[game?.phase ?? "ROLE_REVEAL"] ?? phaseCopy.ROLE_REVEAL!;
  const nominee = game?.nomination ? seats.find((seat) => seat.seat === game.nomination!.nomineeSeat) : undefined;
  const nominator = game?.nomination ? seats.find((seat) => seat.seat === game.nomination!.nominatorSeat) : undefined;
  const publicEvents = publicEventsAt(game?.events ?? [], now).slice(-2).reverse();
  const isNight = game?.phase === "FIRST_NIGHT" || game?.phase === "OTHER_NIGHT";
  const publicDay=!!game&&["DAY_DISCUSSION","NOMINATION","VOTING"].includes(game.phase);
  const finalePending = game?.phase === "GAME_OVER" && (game.presentationUntil ?? 0) > (now);
  const simultaneous=game?simultaneousBallotStatus(game,room,now):undefined;
  const defending = Boolean(game?.nomination?.defenseUntil && (now) < game.nomination.defenseUntil);
  const voteDetail = game?.nomination && nominee ? simultaneous?`${simultaneous.timeLabel} · 当前 ${game.nomination.votesRaised} 票 · 已选择 ${game.nomination.votesReceived}/${simultaneous.total} 人 · 达标 ${game.nomination.threshold} 票`:defending ? `${playerLabel(nominee.seat,nominee.nickname)} 的辩护时间 · ${Math.max(0, Math.ceil(((game.nomination.defenseUntil ?? 0) - (now)) / 1000))} 秒后开始顺时针计票` : game.nomination.voterOrder ? `${game.nomination.currentVoterSeat ? `正在计 ${playerLabel(game.nomination.currentVoterSeat,seats.find(p=>p.seat===game.nomination!.currentVoterSeat)?.nickname)} 的票` : "等待钟声"} · 已计 ${game.nomination.countedSeats?.length ?? 0}/${game.nomination.voterOrder.length} 位 · 当前 ${game.nomination.votesRaised} 票 · 达标 ${game.nomination.threshold} 票` : `${playerLabel(nominator?.seat,nominator?.nickname)} 发起提名 · ${playerLabel(nominee.seat,nominee.nickname)} · 已投 ${game.nomination.votesReceived}/${seats.length} · 达标需 ${game.nomination.threshold} 票` : copy.detail;

  return <main className={`display display--${game?.phase.toLowerCase() ?? "lobby"}`}>
    {upgrade?<p className="session-status" role="alert">游戏已更新<button type="button" onClick={()=>window.location.reload()}>刷新页面</button></p>:null}
    {game ? <section className="display__performance" aria-label="公共演出容器"><PublicNominationAudio game={game} room={room}/><EventStage game={game} room={room} /></section> : null}
    <header className="display__header"><span>鸦钟夜话 · {code}</span><div><span className={`display__phase display__phase--${isNight ? "night" : "day"}`}><span aria-hidden="true">{isNight ? "☾" : "☀"}</span>{phaseLabel(game?.phase, game?.day)}</span><button type="button" onClick={onBack}>返回首页</button><button type="button" onClick={() => void (fullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>{fullscreen ? "退出全屏" : "进入全屏"}</button><GlobalAudioButton/></div></header>
    <section className="display__town"><div className="display__canvas"><RoundTable count={seats.length} variant="display" maxDiameter={Number.POSITIVE_INFINITY} className="display__table">{layout=><><SeatRing fluid layout={layout} diameter={layout.diameter} seats={seats} nightDeathSeats={game?publicNightDeathSeats(game):[]} nominatorSeat={publicDay?game?.nomination?.nominatorSeat:undefined} executionCandidate={publicDay&&!game?.executionTied?game?.onBlock:undefined} threatenedSeats={publicDay&&game?.nomination?[game.nomination.nomineeSeat]:[]} {...(!simultaneous&&game?.nomination?.currentVoterSeat ? { activeSeat: game.nomination.currentVoterSeat } : {})} {...(!simultaneous&&game?.nomination?.countedVotes ? { countedVotes: game.nomination.countedVotes } : {})} {...(game?.nomination?.raisedSeats ? { raisedSeats: game.nomination.raisedSeats } : {})} /><div className="display__center">{!game ? <div className="display__join">
      {qr ? <img src={qr} alt={`加入房间 ${code} 的二维码`} /> : null}
      <p>扫码加入 · 房间 {code}</p><h1>{players.length}/{room?.playerCount ?? "?"} 位已入座</h1>
      <p className="display__readiness">{players.filter(player=>player.ready).length}/{room?.playerCount??"?"} 已准备</p>
      <small>请在手机上准备，由房主开局</small>
    </div> : <>
      <p>{simultaneous?"公开表决":defending ? "辩护时间" : game.phase === "VOTING" ? "顺时针表决" : copy.eyebrow}</p>
      {publicDay&&nominee?<div className="display__nomination" aria-label="当前公开提名">
        <div><small>提名人</small><strong>{nominator?.seat}号 {playerLabel(nominator?.seat,nominator?.nickname)}</strong></div>
        <span aria-hidden="true">→</span><div><small>被提名者</small><h1>{nominee.seat}号 {playerLabel(nominee.seat,nominee.nickname)}</h1></div>
      </div>:<h1>{finalePending ? "钟声仍在回响" : game.phase === "GAME_OVER" ? game.winner==='GOOD'?"善良获胜":game.winner==='EVIL'?"邪恶获胜":copy.title : copy.title}</h1>}
      {simultaneous&&game.nomination?<div className="display__ballot-status">
        <strong>{simultaneous.timeLabel}</strong><span>当前 <b>{game.nomination.votesRaised}</b> 票 <small>／ {game.nomination.threshold} 票达标</small></span><span>已选择 {game.nomination.votesReceived}/{simultaneous.total} 人</span>
      </div>:<small>{publicDay?voteDetail:copy.detail}</small>}
    </>}</div></>}</RoundTable></div></section>
    {seatError&&game?<p className="display__connection" role="status">{seatError}</p>:null}
    {game ? <Panel className="display__village-feed" aria-label="村庄公开信息">
      <header><div><span aria-hidden="true">⌁</span><strong>村庄公开信息</strong></div><small>所有玩家均可得知</small></header>
      <ol>{publicEvents.length?publicEvents.map((event, index) => <li key={event.seq} className={index === 0 ? "is-latest" : ""}><span>{index === 0 ? "最新" : `记录 ${event.seq}`}</span><p>{formatPlayerText(event.message)}</p></li>):<li className="is-latest"><span>稍候</span><p>等待新的公开消息</p></li>}</ol>
    </Panel> : <Panel className={`display__notice${seatError ? " display__notice--error" : ""}`} aria-live="polite">{seatError ?? (players.length > 1 ? "座位与准备状态由玩家手机同步 · 没有大屏也能完整游玩" : `${players.length}/${room?.playerCount ?? "?"} 位玩家已入座`)}</Panel>}
  </main>;
}

export function SeatOrderEditor({players,busy,onReorder}:{players:RoomParticipant[];busy:boolean;onReorder:(ids:string[])=>void}){return <SeatOrderGrid items={players} enabled busy={busy} onCommit={onReorder} renderCard={(p,i)=><button type="button" className="seat-card" aria-label={`${i+1}号 ${p.nickname}`}><span className="seat-number">{i+1}号</span><Avatar id={p.id} name={p.nickname} url={p.avatar}/><strong>{p.nickname}</strong></button>}/>;}
