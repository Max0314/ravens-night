import { Button, Panel, RoleCard } from "@ravens/ui";
import { useEffect, useState } from "react";
import type { PrivateView } from "../api.js";
import type { GuideMode } from "../components/GuideOverlay.js";
import { roleArt } from "../role-art.js";

interface PlayerGameProps {
  view?: PrivateView;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onConfirmRole: () => void;
  onSubmitAction: (seats: number[]) => void;
  onNominate: (seat: number) => void;
  onVote: (raised: boolean) => void;
  onReady: () => void;
  onUseAbility: (seat: number) => void;
  onRestart: () => void;
  canRestart: boolean;
  onOpenGuide: (mode: GuideMode) => void;
}

const phaseNames: Record<string, string> = {
  ROLE_REVEAL: "身份揭晓", FIRST_NIGHT: "首夜", OTHER_NIGHT: "夜晚",
  DAY_DISCUSSION: "自由讨论", NOMINATION: "提名阶段", VOTING: "公开投票", GAME_OVER: "终局",
};

export function PlayerGame({ view, busy, error, onBack, onConfirmRole, onSubmitAction, onNominate, onVote, onReady, onUseAbility, onRestart, canRestart, onOpenGuide }: PlayerGameProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const game = view?.game;
  const role = view?.role;
  useEffect(() => setSelected([]), [game?.phase, view?.action?.kind]);

  if (!view || !role || !game) return <main className="game-page"><button className="screen-back" type="button" onClick={onBack}>← 返回首页</button><Waiting title="等待所有玩家" detail="大家完成教学后，身份会同时揭晓。" compact /></main>;

  if (game.phase === "ROLE_REVEAL") return <main className="role-page">
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <p className="privacy-warning">只有你能看到 · 请勿向外展示屏幕</p>
    <RoleCard name={role.name} alignment={`${role.alignment === "GOOD" ? "善良" : "邪恶"} · ${role.type === "TOWNSFOLK" ? "镇民" : role.type === "OUTSIDER" ? "外来者" : role.type === "MINION" ? "爪牙" : "恶魔"}`} ability={role.summary} beginnerTip={role.beginnerTip} {...roleArt(role.roleId)} />
    <Button onClick={onConfirmRole} disabled={busy || view.roleConfirmed}>{view.roleConfirmed ? "等待其他玩家确认…" : "我记住了身份"}</Button>
    <GameGuideLinks onOpen={onOpenGuide} />
  </main>;

  if (game.phase === "GAME_OVER") return <main className={`ending ending--${game.winner?.toLowerCase()}`}>
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <p>钟声停止</p><h1>{game.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜"}</h1>
    <p>{winReason(game.winReason)}</p><Panel className="clue-panel"><h2>你的真实身份</h2><p>{role.name} · {role.summary}</p>{role.perceivedAs ? <p>本局游戏中，你一直以为自己是<strong>{role.perceivedAs}</strong>；因此曾收到的信息可能不真实。</p> : null}</Panel><Panel className="ending__reveal"><h2>全员身份揭晓</h2><p>{game.events.at(-1)?.message.replace(/^身份揭晓：/, "")}</p></Panel><PublicLog events={game.events} />{canRestart ? <Button onClick={onRestart} disabled={busy}>{busy ? "正在重置房间…" : "同一批人再来一局"}</Button> : <p className="ending__waiting">想再玩一局？等待当前房主重开即可，无需重新加入。</p>}<GameGuideLinks onOpen={onOpenGuide} />
  </main>;

  const action = view.action;
  const isNight = game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT";
  if (isNight) return <main className="game-page game-page--night">
    <GameHeader phase={phaseNames[game.phase]!} day={game.day} role={role.name} onBack={onBack} />
    <RoleCompass role={role} task={action?.prompt ?? "当前无需操作。保持安静并等待手机出现新的行动提示。"} onOpen={onOpenGuide} />
    {game.phase === "FIRST_NIGHT" && role.alignment === "EVIL" ? <EvilFirstNightIntel messages={view.messages.slice(1)} /> : null}
    {action?.kind === "SELECT_ONE" || action?.kind === "SELECT_TWO" ? <Panel className="action-panel">
      <p className="eyebrow">轮到你行动</p><h1>{action.prompt}</h1><p>选择会直接提交给系统，其他玩家和公共大屏都看不到。</p>
      <SeatChoices seats={game.seats} legalSeats={action.legalSeats} selected={selected} max={action.maxTargets} onChange={setSelected} />
      <Button disabled={busy || selected.length !== action.maxTargets} onClick={() => onSubmitAction(selected)}>{busy ? "正在封存选择…" : `确认选择（${selected.length}/${action.maxTargets}）`}</Button>
    </Panel> : <Waiting title="村庄已经沉睡" detail="系统正按夜序唤醒其他角色。你可以查看刚收到的线索。" compact />}
    <Clues messages={view.messages} />{error ? <p className="game-error">{error}</p> : null}
  </main>;

  return <main className="game-page game-page--day">
    <GameHeader phase={phaseNames[game.phase] ?? game.phase} day={game.day} role={role.name} onBack={onBack} />
    <RoleCompass role={role} task={dayTask(view)} onOpen={onOpenGuide} />
    {game.phase === "VOTING" && game.nomination ? <Panel className="vote-panel">
      <p className="eyebrow">提名投票</p><h1>{seatName(game.seats, game.nomination.nomineeSeat)}</h1>
      <p>{seatName(game.seats, game.nomination.nominatorSeat)} 发起提名 · 过半需要 {game.nomination.threshold} 票</p>
      {action?.kind === "VOTE" ? <div className="vote-actions"><Button onClick={() => onVote(true)} disabled={busy}>举手赞成</Button><Button variant="quiet" onClick={() => onVote(false)} disabled={busy}>放下手</Button></div> : <p className="muted">你的票已记录，等待其他玩家。</p>}
      <small>{game.nomination.votesReceived}/{game.seats.length} 位已投票</small>
    </Panel> : <Panel className="day-panel">
      <p className="eyebrow">第 {game.day} 天</p><h1>{game.phase === "NOMINATION" ? "还可以继续提名" : "自由讨论"}</h1>
      <p>分享线索、提出怀疑，也可以暂时隐瞒身份。每人每天只能提名一次，每人每天也只能被提名一次。</p>
      {action?.kind === "SLAYER" ? <div className="slayer-action"><strong>猎魔人的一次机会</strong><p>{action.prompt}</p><SeatChoices seats={game.seats} legalSeats={action.legalSeats} selected={selected} max={1} onChange={setSelected} /><Button variant="danger" disabled={busy || selected.length !== 1} onClick={() => onUseAbility(selected[0]!)}>公开射击所选玩家</Button></div> : null}
      <div className="nominee-grid">{game.seats.filter((seat) => seat.alive).map((seat) => <button key={seat.seat} type="button" disabled={busy || seat.seat === view.participant.seat} onClick={() => onNominate(seat.seat)}><span>{seat.seat}</span>{seat.nickname}<small>提名</small></button>)}</div>
      {game.onBlock ? <p className="on-block">当前处决候选：{seatName(game.seats, game.onBlock.seat)} · {game.onBlock.votes} 票</p> : null}
      <Button variant="quiet" onClick={onReady} disabled={busy}>我同意结束今天（{game.readyCount}/{game.aliveCount}）</Button>
    </Panel>}
    <Clues messages={view.messages} /><PublicLog events={game.events} />{error ? <p className="game-error">{error}</p> : null}
  </main>;
}

function GameHeader({ phase, day, role, onBack }: { phase: string; day: number; role: string; onBack: () => void }) { return <header className="game-header"><button className="screen-back screen-back--header" type="button" onClick={onBack}>← 首页</button><div className="game-header__phase"><span>第 {day || 1} 天</span><strong>{phase}</strong></div><div className="role-chip">{role}</div></header>; }

function RoleCompass({ role, task, onOpen }: { role: NonNullable<PrivateView["role"]>; task: string; onOpen: (mode: GuideMode) => void }) {
  return <section className="role-compass" aria-label="当前任务"><div><span>你是 {role.name}</span><strong>{task}</strong></div><GameGuideLinks onOpen={onOpen} /></section>;
}

function GameGuideLinks({ onOpen }: { onOpen: (mode: GuideMode) => void }) {
  return <div className="game-guide-links"><button type="button" onClick={() => onOpen("mine")}>我的角色</button><button type="button" onClick={() => onOpen("tutorial")}>教程</button><button type="button" onClick={() => onOpen("roles")}>角色表</button></div>;
}

function EvilFirstNightIntel({ messages }: { messages: string[] }) {
  return <Panel className="evil-intel"><p className="eyebrow">邪恶阵营首夜情报</p>{messages.map((message) => <p key={message}>{message}</p>)}</Panel>;
}

function dayTask(view: PrivateView): string {
  const game = view.game;
  if (!game) return "等待游戏开始。";
  if (game.phase === "VOTING") return view.action?.kind === "VOTE" ? "现在投票：选择举手赞成或放下手。" : "你的票已记录，等待所有人完成投票。";
  if (view.action?.kind === "SLAYER") return "你可以发动一次猎魔人能力，也可以继续面对面讨论。";
  if (!game.seats.find((seat) => seat.seat === view.participant.seat)?.alive) return "你已经死亡：仍可参与讨论；投票时谨慎使用唯一幽灵票。";
  return "面对面讨论你的线索；可以提名一名存活玩家，或在讨论结束后确认日落。";
}

function Waiting({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) { return <section className={compact ? "inline-waiting" : "night-page"}><Panel className="night-action"><h1>{title}</h1><p>{detail}</p><div className="waiting-orbit"><span /></div></Panel></section>; }

function SeatChoices({ seats, legalSeats, selected, max, onChange }: { seats: PrivateView["game"] extends infer _ ? NonNullable<PrivateView["game"]>["seats"] : never; legalSeats: number[]; selected: number[]; max: number; onChange: (seats: number[]) => void }) {
  return <div className="seat-choices">{seats.map((seat) => { const legal = legalSeats.includes(seat.seat); const active = selected.includes(seat.seat); return <button type="button" key={seat.seat} disabled={!legal} className={active ? "is-selected" : ""} onClick={() => onChange(active ? selected.filter((value) => value !== seat.seat) : [...(selected.length >= max ? selected.slice(1) : selected), seat.seat])}><span>{seat.seat}</span><strong>{seat.nickname}</strong>{!seat.alive ? <small>已死亡</small> : null}</button>; })}</div>;
}

function Clues({ messages }: { messages: string[] }) { return <details className="clue-drawer"><summary>我的身份与线索 <span>{messages.length}</span></summary><div>{[...messages].reverse().map((message, index) => <p key={`${index}-${message}`}>{message}</p>)}</div></details>; }
function PublicLog({ events }: { events: Array<{ seq: number; message: string }> }) { return <details className="public-log"><summary>村庄记录</summary>{[...events].reverse().map((event) => <p key={event.seq}>{event.message}</p>)}</details>; }
function seatName(seats: Array<{ seat: number; nickname: string }>, seat: number) { const player = seats.find((candidate) => candidate.seat === seat); return `${player?.nickname ?? "玩家"}（${seat}号）`; }
function winReason(reason?: string) { return ({ "saint-executed": "圣徒被处决，邪恶达成了特殊胜利。", "mayor-final-three": "三人存活且无人被处决，镇长带领善良获胜。", "demon-dead": "恶魔已经死亡。", "final-two": "仅剩两人存活，邪恶控制了村庄。" } as Record<string, string>)[reason ?? ""] ?? "这一夜的故事已经写完。"; }
