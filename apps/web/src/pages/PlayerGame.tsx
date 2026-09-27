import { Button, Panel, RoleCard, SeatRing } from "@ravens/ui";
import { useEffect, useRef, useState } from "react";
import type { PrivateHistoryEntry, PrivateHistoryKind, PrivateView } from "../api.js";
import type { GuideMode } from "../components/GuideOverlay.js";
import { roleArt } from "../role-art.js";
import { EventStage, publicEventsAt, type PrivateReceipt } from "../components/EventStage.js";
import { SocialRoom } from "../components/SocialRoom.js";

interface PlayerGameProps {
  view?: PrivateView;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onConfirmRole: () => void;
  onSubmitAction: (seats: number[]) => void;
  onNominate: (seat: number) => void;
  onCancelNomination: () => void;
  onVote: (raised: boolean) => void;
  onReady: () => void;
  onUseAbility: (seat: number) => void;
  onRestart: () => void;
  canRestart: boolean;
  onOpenGuide: (mode: GuideMode) => void;
  receipt?: PrivateReceipt;
  roomCode?: string;
  voiceRoomUrl?: string;
  onLeave?: () => void;
  onRefresh?: () => void;
  onResumeGame?: () => void;
  onFinishDefense?: () => void;
}

const phaseNames: Record<string, string> = {
  ROLE_REVEAL: "身份揭晓", FIRST_NIGHT: "首夜", OTHER_NIGHT: "夜晚",
  DAY_DISCUSSION: "自由讨论", NOMINATION: "提名阶段", VOTING: "公开投票", GAME_OVER: "终局",
};

export function PlayerGame(props: PlayerGameProps) {
  const [covered, setCovered] = useState(false);
  useEffect(() => { const hide = () => { if (document.hidden) setCovered(true); }; document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide); }, []);
  return <><div hidden={covered}><PlayerGameContent {...props} /></div>{props.view?.game ? <><button className="privacy-toggle" type="button" onClick={() => setCovered(true)}>◈ 遮住私密内容</button><EventStage game={props.view.game} {...(!covered && props.receipt ? { receipt: props.receipt } : {})} />{covered ? <section className="privacy-curtain" role="dialog" aria-modal="true" aria-label="私密内容已遮住"><span>☾</span><h1>秘密已妥善遮住</h1><p>身份、线索与夜间行动仅你可见。</p><Button onClick={() => setCovered(false)}>显示私密内容</Button></section> : null}</> : null}</>;
}

function PlayerGameContent({ view, busy, error, onBack, onConfirmRole, onSubmitAction, onNominate, onCancelNomination, onVote, onReady, onUseAbility, onRestart, canRestart, onOpenGuide, roomCode, voiceRoomUrl, onLeave, onRefresh, onResumeGame, onFinishDefense }: PlayerGameProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingNominee, setPendingNominee] = useState<number>();
  const [pendingShot, setPendingShot] = useState<number>();
  const [ghostConfirm, setGhostConfirm] = useState(false);
  const [tab, setTab] = useState<"ACTION" | "TOWN" | "RECORD">("ACTION");
  const game = view?.game;
  const [tick, setTick] = useState(Date.now());
  const clockOffset = useRef(game?.serverNow ? game.serverNow - Date.now() : 0);
  useEffect(() => { if (game?.serverNow) clockOffset.current = game.serverNow - Date.now(); }, [game?.serverNow]);
  useEffect(() => { if (game?.phase !== "VOTING") return; setTick(Date.now()); const timer = window.setInterval(() => setTick(Date.now()), 200); return () => window.clearInterval(timer); }, [game?.phase]);
  const now = tick + clockOffset.current;
  const role = view?.role;
  const shownEvents = publicEventsAt(game?.events ?? [], game?.serverNow ?? Date.now());
  useEffect(() => { setSelected([]); setPendingNominee(undefined); }, [game?.phase, view?.action?.kind, game?.nomination?.nomineeSeat]);
  useEffect(() => { setPendingShot(undefined); setGhostConfirm(false); setTab("ACTION"); }, [game?.phase, game?.nomination?.nomineeSeat]);

  if (!view || !role || !game) return <main className="game-page"><button className="screen-back" type="button" onClick={onBack}>← 返回首页</button><Waiting title="等待所有玩家" detail="大家完成教学后，身份会同时揭晓。" compact /></main>;

  if (game.phase === "ROLE_REVEAL") return <main className="role-page">
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <p className="privacy-warning">只有你能看到 · 请勿向外展示屏幕</p>
    <RoleCard name={role.name} alignment={`${role.alignment === "GOOD" ? "善良" : "邪恶"} · ${role.type === "TOWNSFOLK" ? "镇民" : role.type === "OUTSIDER" ? "外来者" : role.type === "MINION" ? "爪牙" : "恶魔"}`} ability={role.summary} beginnerTip={role.beginnerTip} {...roleArt(role.roleId)} />
    <Button onClick={onConfirmRole} disabled={busy || view.roleConfirmed}>{view.roleConfirmed ? "等待其他玩家确认…" : "我记住了身份"}</Button>
    <GameGuideLinks onOpen={onOpenGuide} />{error ? <p className="game-error" role="alert">{error}</p> : null}
  </main>;

  if (game.phase === "GAME_OVER" && (game.presentationUntil ?? 0) > (game.serverNow ?? Date.now())) return <main className="game-page"><Waiting title="钟声仍在回响" detail="请等待最后一幕结束，随后将揭晓整局身份与记录。" compact /></main>;
  if (game.phase === "GAME_OVER") return <main className={`ending ending--${game.winner?.toLowerCase()}`}>
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <p>钟声停止</p><h1>{game.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜"}</h1>
    <p>{winReason(game.winReason)}</p><Panel className="clue-panel"><h2>你的真实身份</h2><p>{role.name} · {role.summary}</p>{role.perceivedAs ? <p>本局游戏中，你一直以为自己是<strong>{role.perceivedAs}</strong>；因此曾收到的信息可能不真实。</p> : null}</Panel><Panel className="ending__reveal"><h2>全员身份揭晓</h2><p>{[...game.events].reverse().find((event) => event.message.startsWith("身份揭晓："))?.message.replace(/^身份揭晓：/, "") ?? "请查看下方完整村庄记录。"}</p></Panel><StorytellerReview decisions={view.storytellerDecisions ?? []} /><Clues history={view.history} messages={view.messages} /><PublicLog events={game.events} />{canRestart ? <Button onClick={onRestart} disabled={busy}>{busy ? "正在重置房间…" : "同一批人再来一局"}</Button> : <p className="ending__waiting">想再玩一局？等待当前房主重开即可，无需重新加入。</p>}{onLeave ? <Button variant="quiet" onClick={onLeave} disabled={busy}>退出房间</Button> : null}{error ? <p role="alert">{error}</p> : null}<GameGuideLinks onOpen={onOpenGuide} />
  </main>;

  const action = view.action;
  const isNight = game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT";
  const mine = game.seats.find((seat) => seat.seat === view.participant.seat);
  const alive = mine?.alive ?? false;
  const canVote = view.canVote ?? Boolean(alive || mine?.ghostVoteAvailable);
  const canNominate = view.canNominate ?? alive;
  const locked = Boolean(game.presentationUntil && game.serverNow && game.presentationUntil > game.serverNow);
  const disabled = busy || locked;
  const defending = Boolean(game.nomination?.defenseUntil && now < game.nomination.defenseUntil);
  const voteLocked = game.nomination?.countedSeats?.includes(view.participant.seat) ?? false;
  const pendingInvites = view.social?.invitations.filter((invite) => invite.toSeat === view.participant.seat && invite.status.toUpperCase() === "PENDING").length ?? 0;
  const navigation = <nav className="game-tabs" aria-label="游戏分区">{([['ACTION', '此刻行动'], ['TOWN', '公开城镇'], ['RECORD', '我的记录']] as const).map(([key, label]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{key === "TOWN" && pendingInvites ? <small className="invite-badge">{pendingInvites}</small> : null}</button>)}</nav>;
  const utility = <div className="game-utility"><span>{game.aliveCount} 人存活 · 你是 {view.participant.seat} 号</span>{voiceRoomUrl || view.voiceRoomUrl ? <a href={voiceRoomUrl ?? view.voiceRoomUrl} target="_blank" rel="noreferrer">语音频道 ↗</a> : null}{game.pauseReason ? <p role="status">{game.pauseReason}{onResumeGame ? <button type="button" disabled={busy} onClick={onResumeGame}>大家已就绪，继续</button> : null}</p> : null}</div>;
  const publicTown = <><RemoteTownBoard game={game} ownSeat={view.participant.seat} /><PublicLog events={shownEvents} />{roomCode ? <SocialRoom code={roomCode} view={view} onRefresh={onRefresh ?? (() => undefined)} /> : null}</>;
  const submittedNightAction = isNight && view.history.some((entry) => entry.phase === game.phase && entry.day === game.day && entry.kind === "ACTION");
  if (isNight) return <main className="game-page game-page--night">
    <GameHeader phase={phaseNames[game.phase]!} day={game.day} role={role.name} onBack={onBack} />
    {utility}{navigation}{tab === "TOWN" ? publicTown : null}{tab === "RECORD" ? <><Clues history={view.history} messages={view.messages} /><GameGuideLinks onOpen={onOpenGuide} /></> : null}<div hidden={tab !== "ACTION"}>
    <RoleCompass role={role} task={action?.prompt ?? "当前无需操作。保持安静并等待手机出现新的行动提示。"} onOpen={onOpenGuide} />
    {game.phase === "FIRST_NIGHT" && role.alignment === "EVIL" ? <EvilFirstNightIntel entries={view.history.filter((entry) => entry.phase === "ROLE_REVEAL" && (entry.kind === "INFORMATION" || entry.kind === "NOTICE"))} /> : null}
    {action?.kind === "SELECT_ONE" || action?.kind === "SELECT_TWO" ? <Panel className="action-panel">
      <p className="eyebrow">轮到你行动</p><h1>{action.prompt}</h1><p>选择会直接提交给系统，其他玩家和公共大屏都看不到。</p>
      <SeatChoices seats={game.seats} legalSeats={action.legalSeats} selected={selected} max={action.maxTargets} onChange={setSelected} />
      <Button disabled={disabled || selected.length !== action.maxTargets} onClick={() => onSubmitAction(selected)}>{busy ? "正在封存选择…" : `确认选择（${selected.length}/${action.maxTargets}）`}</Button>
    </Panel> : <Waiting title="村庄已经沉睡" detail={submittedNightAction ? "你的选择已记录。等本夜所有角色完成行动后，结果会出现在下方记录中。" : "系统正按夜序唤醒其他角色；本夜结算后，新线索会出现在下方记录中。"} compact />}
    <Clues history={view.history} messages={view.messages} /></div>{error ? <p className="game-error" role="alert">{error}</p> : null}
  </main>;

  return <main className="game-page game-page--day">
    <GameHeader phase={phaseNames[game.phase] ?? game.phase} day={game.day} role={role.name} onBack={onBack} />
    {utility}{navigation}{tab === "TOWN" ? publicTown : null}{tab === "RECORD" ? <><Clues history={view.history} messages={view.messages} /><GameGuideLinks onOpen={onOpenGuide} /></> : null}<div hidden={tab !== "ACTION"}>
    <RoleCompass role={role} task={dayTask(view)} onOpen={onOpenGuide} />
    {game.phase === "VOTING" && game.nomination ? <Panel className="vote-panel">
      <p className="eyebrow">{defending ? "辩护时间" : game.nomination.voteStartsAt ? "顺时针表决" : "提名投票"}</p><h1>{seatName(game.seats, game.nomination.nomineeSeat)}</h1>
      <p>{seatName(game.seats, game.nomination.nominatorSeat)} 发起提名 · 达标需要 {game.nomination.threshold} 票</p>
      {defending ? <div className="defense-countdown"><span>{Math.max(0, Math.ceil(((game.nomination.defenseUntil ?? now) - now) / 1_000))}</span><div><strong>请听取被提名者的辩护</strong><p>可以先举手，轮到你的座位时才锁定。</p></div>{view.canFinishDefense && onFinishDefense ? <Button variant="quiet" onClick={onFinishDefense} disabled={disabled}>我已完成辩护，开始表决</Button> : null}</div> : null}
      {game.nomination.voterOrder ? <div className="vote-procession" aria-label="顺时针计票顺序">{game.nomination.voterOrder.map((seat) => <div key={seat} className={`${seat === game.nomination?.currentVoterSeat ? "is-counting" : ""} ${game.nomination?.countedSeats?.includes(seat) ? "is-counted" : ""}`}><span>{seat}</span><small>{game.nomination?.countedSeats?.includes(seat) ? game.nomination.countedVotes?.[seat] ? "举手" : "未举手" : seat === game.nomination?.currentVoterSeat ? "正计票" : "待计票"}</small></div>)}</div> : null}
      {!defending && game.nomination.currentVoterSeat ? <p className="vote-current-seat" role="status">钟楼指向 {seatName(game.seats, game.nomination.currentVoterSeat)} · 已计 {game.nomination.votesRaised} 票</p> : null}
      <p className="vote-current">{voteLocked ? `你的票已锁定：${game.nomination.countedVotes?.[view.participant.seat] ? "举手赞成" : "未举手"}` : `${view.voteRaised === undefined ? "请选择你的投票" : view.voteRaised ? "你当前：已举手赞成" : "你当前：未举手"} · ${game.nomination.voteStartsAt ? "轮到你的座位前可以切换" : "全员完成前可随时切换"}`}</p>
      {!alive ? <p className="ghost-vote-note">{mine?.ghostVoteAvailable ? "你有且仅有一枚幽灵票。举手计入最终结果后消耗。" : "你的幽灵票已使用，本轮可以继续聆听与讨论。"}</p> : null}
      <div className="vote-actions"><Button className={view.voteRaised === true ? "is-active" : ""} aria-pressed={view.voteRaised === true} onClick={() => { if (!alive && !view.voteRaised) setGhostConfirm(true); else onVote(true); }} disabled={disabled || !canVote}>举手赞成</Button><Button className={view.voteRaised === false ? "is-active" : ""} aria-pressed={view.voteRaised === false} variant="quiet" onClick={() => onVote(false)} disabled={disabled || !canVote}>放下手</Button></div>
      {ghostConfirm ? <div className="nomination-confirm"><strong>为本次提名使用唯一的幽灵票？</strong><p>计到你的座位时若仍举手，这枚票将被消耗。</p><Button disabled={disabled || !canVote} onClick={() => { setGhostConfirm(false); onVote(true); }}>确认使用幽灵票</Button><Button variant="quiet" onClick={() => setGhostConfirm(false)}>暂不使用</Button></div> : null}
      {game.nomination.nominatorSeat === view.participant.seat && game.nomination.votesReceived === 0 && !game.nomination.countedSeats?.length ? <Button className="cancel-nomination" variant="quiet" onClick={onCancelNomination} disabled={disabled}>取消本次提名</Button> : null}
      <small>{game.nomination.countedSeats ? `${game.nomination.countedSeats.length}/${game.nomination.voterOrder?.length ?? game.nomination.votersRequired ?? game.aliveCount} 位已计票` : `${game.nomination.votesReceived}/${game.nomination.votersRequired ?? game.aliveCount} 位已回应`} · 未举手按弃权计入，不会消耗幽灵票</small>
    </Panel> : <Panel className="day-panel">
      <p className="eyebrow">第 {game.day} 天</p><h1>{game.phase === "NOMINATION" ? "还可以继续提名" : "自由讨论"}</h1>
      <p>分享线索、提出怀疑，也可以暂时隐瞒身份。每人每天只能提名一次，每人每天也只能被提名一次。</p>
      {pendingNominee ? <div className="nomination-confirm"><strong>确认提名 {seatName(game.seats, pendingNominee)}？</strong><p>确认后所有玩家将进入投票；无人投票前仍可取消。</p><div><Button onClick={() => onNominate(pendingNominee)} disabled={disabled}>确认提名</Button><Button variant="quiet" onClick={() => setPendingNominee(undefined)} disabled={disabled}>暂不提名</Button></div></div> : canNominate ? <div className="nominee-grid">{game.seats.filter((seat) => view.nominationTargets?.includes(seat.seat) ?? true).map((seat) => <button key={seat.seat} type="button" disabled={disabled} onClick={() => setPendingNominee(seat.seat)}><span>{seat.seat}</span>{seat.nickname}<small>提名{!seat.alive ? " · 已死亡" : ""}</small></button>)}</div> : <p className="ghost-vote-note">{alive ? "你今天已经发起过提名，仍可参与讨论与投票。" : "你已死亡，仍可分享线索、参与讨论，并谨慎使用幽灵票。"}</p>}
      {game.onBlock ? <p className="on-block">当前处决候选：{seatName(game.seats, game.onBlock.seat)} · {game.onBlock.votes} 票</p> : null}
      {game.executionTied ? <p className="on-block">最高票持平，目前无人会被处决。仍可继续提名打破平票。</p> : null}
      {view.canEndDay ?? alive ? <Button variant="quiet" onClick={onReady} disabled={disabled}>我同意结束今天（{game.readyCount}/{game.aliveCount}）</Button> : null}
    </Panel>}
    {alive && (view.canClaimSlayer ?? action?.kind === "SLAYER") ? <details className="slayer-declaration"><summary>公开宣称猎魔人能力</summary><p>任何存活玩家都可作出宣称，真假身份不会被公开。真实猎魔人的能力每局只有一次。</p><SeatChoices seats={game.seats} legalSeats={view.dayAbilityTargets ?? game.seats.map((seat) => seat.seat)} selected={selected} max={1} onChange={setSelected} />{pendingShot !== undefined ? <div className="nomination-confirm"><strong>向 {seatName(game.seats, pendingShot)} 开枪？</strong><p>所有玩家与公共大屏将同步看到宣称和枪击结果。</p><Button variant="danger" disabled={disabled} onClick={() => { onUseAbility(pendingShot); setPendingShot(undefined); }}>确认公开开枪</Button><Button variant="quiet" onClick={() => setPendingShot(undefined)}>收起武器</Button></div> : <Button variant="danger" disabled={disabled || selected.length !== 1} onClick={() => setPendingShot(selected[0]!)}>公开射击所选玩家</Button>}</details> : null}
    <Clues history={view.history} messages={view.messages} /><PublicLog events={shownEvents} /></div>{error ? <p className="game-error" role="alert">{error}</p> : null}
  </main>;
}

function GameHeader({ phase, day, role, onBack }: { phase: string; day: number; role: string; onBack: () => void }) { return <header className="game-header"><button className="screen-back screen-back--header" type="button" onClick={onBack}>← 首页</button><div className="game-header__phase"><span>第 {day || 1} 天</span><strong>{phase}</strong></div><div className="role-chip">{role}</div></header>; }

function RemoteTownBoard({ game, ownSeat }: { game: NonNullable<PrivateView["game"]>; ownSeat?: number }) {
  const [selected, setSelected] = useState<number>();
  const player = game.seats.find((seat) => seat.seat === selected);
  return <section className="remote-town-board" aria-label="公开城镇"><header><span>公开城镇</span><small>{game.aliveCount} 人存活 · {game.seats.length - game.aliveCount} 位亡灵</small></header><SeatRing seats={game.seats} {...(game.nomination?.currentVoterSeat ? { activeSeat: game.nomination.currentVoterSeat } : {})} {...(game.nomination?.countedVotes ? { countedVotes: game.nomination.countedVotes } : {})} {...(game.nomination?.raisedSeats ? { raisedSeats: game.nomination.raisedSeats } : {})} onSelect={setSelected} {...(ownSeat ? { ownSeat } : {})} /><p className="town-instruction">点击座位查看公开状态 · 身份始终保密</p>{player ? <section className="player-public-card"><button type="button" onClick={() => setSelected(undefined)} aria-label="关闭玩家公开卡">×</button><span>{player.seat} 号</span><h3>{player.nickname}</h3><p>{player.alive ? "存活" : "已死亡"} · {player.connected ? "在线" : "暂时离线"}</p><p>{player.alive ? "可以讨论、提名与投票。" : player.ghostVoteAvailable ? "仍可讨论 · 保留一枚幽灵票" : "仍可讨论 · 幽灵票已使用"}</p></section> : null}</section>;
}

function RoleCompass({ role, task, onOpen }: { role: NonNullable<PrivateView["role"]>; task: string; onOpen: (mode: GuideMode) => void }) {
  return <section className="role-compass" aria-label="当前任务"><div><span>你是 {role.name}</span><strong>{task}</strong></div><GameGuideLinks onOpen={onOpen} /></section>;
}

function GameGuideLinks({ onOpen }: { onOpen: (mode: GuideMode) => void }) {
  return <div className="game-guide-links"><button type="button" onClick={() => onOpen("mine")}>我的角色</button><button type="button" onClick={() => onOpen("tutorial")}>教程</button><button type="button" onClick={() => onOpen("roles")}>角色表</button></div>;
}

function EvilFirstNightIntel({ entries }: { entries: PrivateHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return <Panel className="evil-intel"><p className="eyebrow">邪恶阵营首夜情报</p>{entries.map((entry) => <p key={entry.seq}>{entry.text}</p>)}</Panel>;
}

function dayTask(view: PrivateView): string {
  const game = view.game;
  if (!game) return "等待游戏开始。";
  if (game.phase === "VOTING") {
    if (game.nomination?.countedSeats?.includes(view.participant.seat)) return "你的票已锁定，请等待顺时针表决结束。";
    if (view.canFinishDefense) return "现在是你的辩护时间，说明你的身份或回应这次指控。";
    return view.voteRaised === undefined ? "可以提前举手或放下手；钟楼计到你的座位时锁定。" : `你当前${view.voteRaised ? "已举手赞成" : "未举手"}；计到你的座位前可以切换。`;
  }
  if (view.action?.kind === "SLAYER") return "你可以发动一次猎魔人能力，也可以继续面对面讨论。";
  if (!game.seats.find((seat) => seat.seat === view.participant.seat)?.alive) return "你已经死亡：仍可参与讨论；投票时谨慎使用唯一幽灵票。";
  return "分享与讨论你的线索；可以发起提名，或在讨论结束后确认日落。";
}

function Waiting({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) { return <section className={compact ? "inline-waiting" : "night-page"}><Panel className="night-action"><h1>{title}</h1><p>{detail}</p><div className="waiting-orbit"><span /></div></Panel></section>; }

function SeatChoices({ seats, legalSeats, selected, max, onChange }: { seats: PrivateView["game"] extends infer _ ? NonNullable<PrivateView["game"]>["seats"] : never; legalSeats: number[]; selected: number[]; max: number; onChange: (seats: number[]) => void }) {
  return <div className="seat-choices">{seats.map((seat) => { const legal = legalSeats.includes(seat.seat); const active = selected.includes(seat.seat); return <button type="button" key={seat.seat} disabled={!legal} className={active ? "is-selected" : ""} onClick={() => onChange(active ? selected.filter((value) => value !== seat.seat) : [...(selected.length >= max ? selected.slice(1) : selected), seat.seat])}><span>{seat.seat}</span><strong>{seat.nickname}</strong>{!seat.alive ? <small>已死亡</small> : null}</button>; })}</div>;
}

const historyKindLabels: Record<PrivateHistoryKind, string> = {
  IDENTITY: "身份",
  ACTION: "我的行动",
  INFORMATION: "收到线索",
  ROLE_CHANGE: "身份变化",
  NOTICE: "规则提示",
};

function Clues({ history, messages }: { history: PrivateHistoryEntry[]; messages: string[] }) {
  const entries = history.length > 0 ? history : messages.map((text, index) => ({ seq: index + 1, phase: "HISTORY" as const, day: 0, kind: "NOTICE" as const, text }));
  const groups = groupPrivateHistory(entries);
  const latest = entries.at(-1);
  return <details className="clue-drawer">
    <summary><strong>我的身份与线索记录</strong><span>{entries.length}</span>{latest ? <small>最新：{latest.text}</small> : null}</summary>
    <div className="clue-timeline">{groups.map((group) => <section key={group.key} className="clue-timeline__group">
      <h3>{group.label}</h3>
      <ol>{group.entries.map((entry) => <li key={entry.seq} className={`clue-entry clue-entry--${entry.kind.toLowerCase()}`}>
        <span>{historyKindLabels[entry.kind]}</span><p>{entry.text}</p>
      </li>)}</ol>
    </section>)}</div>
  </details>;
}

function groupPrivateHistory(entries: PrivateHistoryEntry[]) {
  const groups = new Map<string, { key: string; label: string; entries: PrivateHistoryEntry[] }>();
  for (const entry of [...entries].reverse()) {
    const label = privateHistoryLabel(entry);
    const key = label;
    const group = groups.get(key) ?? { key, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function privateHistoryLabel(entry: PrivateHistoryEntry): string {
  if (entry.phase === "ROLE_REVEAL") return "身份揭晓";
  if (entry.phase === "FIRST_NIGHT") return "首夜";
  if (entry.phase === "OTHER_NIGHT") return `第 ${Math.max(2, entry.day + 1)} 夜`;
  if (entry.phase === "GAME_OVER") return "终局";
  if (entry.phase === "HISTORY") return "此前记录";
  return `第 ${Math.max(1, entry.day)} 天`;
}
function PublicLog({ events }: { events: Array<{ seq: number; message: string }> }) { return <details className="public-log"><summary>村庄记录</summary>{[...events].reverse().map((event) => <p key={event.seq}>{event.message}</p>)}</details>; }
function StorytellerReview({ decisions }: { decisions: NonNullable<PrivateView["storytellerDecisions"]> }) {
  if (!decisions.length) return null;
  return <details className="storyteller-review"><summary>说书人裁量复盘 · {decisions.length} 条</summary><p>故事落幕后，公开本局的规则裁量与信息选择依据。</p><ol>{decisions.map((decision) => <li key={decision.id}><small>{decision.day ? `第 ${decision.day} 天` : "开局配置"}{decision.seat ? ` · ${decision.seat} 号` : ""}</small><strong>{decision.choice}</strong><p>{decision.reason}</p></li>)}</ol></details>;
}
function seatName(seats: Array<{ seat: number; nickname: string }>, seat: number) { const player = seats.find((candidate) => candidate.seat === seat); return `${player?.nickname ?? "玩家"}（${seat}号）`; }
function winReason(reason?: string) { return ({ "saint-executed": "圣徒被处决，邪恶达成了特殊胜利。", "mayor-final-three": "三人存活且无人被处决，镇长带领善良获胜。", "demon-dead": "恶魔已经死亡。", "final-two": "仅剩两人存活，邪恶控制了村庄。" } as Record<string, string>)[reason ?? ""] ?? "这一夜的故事已经写完。"; }
