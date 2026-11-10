import { Button, Panel, RoleCard, SeatRing } from "@ravens/ui";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrivateHistoryEntry, PrivateHistoryKind, PrivateView } from "../api.js";
import type { GuideMode } from "../components/GuideOverlay.js";
import { roleArt } from "../role-art.js";
import { EventStage, publicEventsAt, type PrivateReceipt } from "../components/EventStage.js";
import { PublicBallot } from "../components/PublicBallot.js";
import { ResultBoard } from "../components/ResultBoard.js";
import type { WhisperDrafts } from "../whisper-drafts.js";
import { SocialRoom } from "../components/SocialRoom.js";
import { useBackLayer } from "../use-back-layer.js";

interface PlayerGameProps {
  drafts?: WhisperDrafts;
  setDrafts?: Dispatch<SetStateAction<WhisperDrafts>>;
  showBallot?: number;
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
  onRefresh?: () => void | Promise<void>;
  onResumeGame?: () => void;
  onFinishDefense?: () => void;
}

const phaseNames: Record<string, string> = {
  ROLE_REVEAL: "身份揭晓", FIRST_NIGHT: "首夜", OTHER_NIGHT: "夜晚",
  DAY_DISCUSSION: "自由讨论", NOMINATION: "提名阶段", VOTING: "公开投票", GAME_OVER: "终局",
};

export function PlayerGame(props: PlayerGameProps) {
  const [drafts, setDrafts] = useState<WhisperDrafts>({});
  const [showBallot, setShowBallot] = useState(0);
  const [covered, setCovered] = useState(false);
  const [syncing, setSyncing] = useState(false);
  useEffect(()=>{ if(!document.hidden)setSyncing(false); },[props.view]);
  const refresh = useRef(props.onRefresh); refresh.current = props.onRefresh;
  useEffect(() => {
    const sync = () => {
      if (document.hidden) { setCovered(true); setSyncing(true); return; }
      setSyncing(true);
      void Promise.resolve(refresh.current?.()).then(() => setSyncing(false), () => undefined);
    };
    const cover=()=>setCovered(true); window.addEventListener("ravens:cover-private",cover);
    document.addEventListener("visibilitychange", sync); window.addEventListener("online", sync);
    return () => { window.removeEventListener("ravens:cover-private",cover); document.removeEventListener("visibilitychange", sync); window.removeEventListener("online", sync); };
  }, []);
  return <div className="player-session">{covered && props.error ? <p role="alert" className="public-command-error">{props.error}</p> : null}{props.view ? <PublicBallot view={props.view} busy={props.busy || syncing} onVote={props.onVote} onDetails={()=>{if(!covered)setShowBallot(n=>n+1);}}/> : null}<div className="player-private" hidden={covered} inert={covered}><PlayerGameContent {...props} drafts={drafts} setDrafts={setDrafts} showBallot={showBallot} busy={props.busy || syncing} /></div>{syncing ? <p role="status" className="session-status">正在同步当前轮次…</p> : null}{props.view?.game ? <><button className="privacy-toggle" type="button" onClick={() => setCovered(true)}>遮住私密内容</button><EventStage game={props.view.game} {...(!covered && props.receipt ? { receipt: props.receipt } : {})} />{covered ? <section className="privacy-curtain" aria-label="私密内容已遮住"><h1>私密内容已遮住</h1><Button onClick={() => setCovered(false)}>显示私密内容</Button></section> : null}</> : null}</div>;
}

function PlayerGameContent({ drafts, setDrafts, showBallot, view, busy, error, onBack, onConfirmRole, onSubmitAction, onNominate, onCancelNomination, onVote, onReady, onUseAbility, onRestart, canRestart, onOpenGuide, roomCode, voiceRoomUrl, onLeave, onRefresh, onResumeGame, onFinishDefense }: PlayerGameProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingNominee, setPendingNominee] = useState<number>();
  const [pendingShot, setPendingShot] = useState<number>();
  const [tab, setTab] = useState<"ACTION" | "TOWN" | "RECORD">("ACTION");
  useBackLayer(pendingNominee !== undefined && tab === "ACTION",()=>setPendingNominee(undefined));
  useBackLayer(pendingShot !== undefined && tab === "ACTION",()=>setPendingShot(undefined));
  useEffect(()=>{if(showBallot)setTab("ACTION");},[showBallot]);
  const game = view?.game;
  const now=game?.serverNow ?? Date.now();
  const role = view?.role;
  const shownEvents = publicEventsAt(game?.events ?? [], game?.serverNow ?? Date.now());
  useEffect(() => { setSelected([]); setPendingNominee(undefined); setPendingShot(undefined); }, [view?.roomInstanceId, game?.gameId, view?.contextId, game?.contextId, game?.phase, game?.nomination?.ballotId, view?.action?.kind]);

  if (!view || !role || !game) return <main className="game-page"><button className="screen-back" type="button" onClick={onBack}>← 返回首页</button><Waiting title="等待所有玩家" detail={`${view?.room?.tutorialCompleteCount ?? 0}/${view?.room?.playerCount ?? "?"} 人完成教学，等待其他玩家。`} compact /></main>;

  if (game.phase === "ABORTED") return <main className="game-page"><button type="button" onClick={onBack}>返回首页</button><Panel><h1>本局已中止</h1><p>本局不判胜负。等待房主返回大厅后重新准备。</p>{canRestart ? <Button disabled={busy} onClick={onRestart}>返回大厅</Button> : null}{onLeave ? <Button variant="quiet" disabled={busy} onClick={onLeave}>离开房间</Button> : null}</Panel>{error ? <p role="alert">{error}</p> : null}</main>;

  if (game.phase === "ROLE_REVEAL") return <main className="role-page">
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <p className="privacy-warning">只有你能看到 · 请勿向外展示屏幕</p>
    <RoleCard name={role.name} alignment={`${role.alignment === "GOOD" ? "善良" : "邪恶"} · ${role.type === "TOWNSFOLK" ? "镇民" : role.type === "OUTSIDER" ? "外来者" : role.type === "MINION" ? "爪牙" : "恶魔"}`} ability={role.summary} beginnerTip={role.beginnerTip} {...roleArt(role.roleId)} />
    <Button onClick={onConfirmRole} disabled={busy || view.roleConfirmed}>{view.roleConfirmed ? "等待其他玩家确认…" : "我记住了身份"}</Button>
    <GameGuideLinks onOpen={onOpenGuide} />{error ? <p className="game-error" role="alert">{error}</p> : null}
  </main>;

  if (game.phase === "GAME_OVER" && (game.revealComplete === false || (game.presentationUntil ?? 0) > (game.serverNow ?? Date.now()))) return <main className="game-page"><Waiting title={game.winner ? game.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜" : "终章将至"} detail="身份与战报将在最后一幕结束后公布。" compact /></main>;
  if (game.phase === "GAME_OVER") return <main className={`ending ending--${game.winner?.toLowerCase()}`}>
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <div className="ending-content"><p>钟声停止</p><h1>{game.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜"}</h1>
    <p>{winReason(game.winReason)}</p><Panel className="clue-panel"><h2>你的真实身份</h2><p>{role.name} · {role.summary}</p>{role.perceivedAs ? <p>本局游戏中，你一直以为自己是<strong>{role.perceivedAs}</strong>；因此曾收到的信息可能不真实。</p> : null}</Panel>{roomCode ? <ResultBoard code={roomCode} gameId={game.gameId}/> : null}<StorytellerReview decisions={view.storytellerDecisions ?? []} /><Clues history={view.history} messages={view.messages} /><PublicLog events={game.events} />{canRestart ? <Button onClick={onRestart} disabled={busy}>{busy ? "正在重置房间…" : "下一把"}</Button> : <p className="ending__waiting">想再玩一局？等待当前房主重开即可，无需重新加入。</p>}{onLeave ? <Button variant="quiet" onClick={onLeave} disabled={busy}>退出房间</Button> : null}{error ? <p role="alert">{error}</p> : null}<GameGuideLinks onOpen={onOpenGuide} /></div>
  </main>;

  const action = view.action;
  const isNight = game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT";
  const mine = game.seats.find((seat) => seat.seat === view.participant.seat);
  const alive = mine?.alive ?? false;
  const canNominate = view.canNominate ?? alive;
  const locked = Boolean(game.presentationUntil && game.serverNow && game.presentationUntil > game.serverNow);
  const disabled = busy || locked;
  const defending = Boolean(game.nomination?.defenseUntil && now < game.nomination.defenseUntil);
  const pendingInvites = view.social?.invitations.filter((invite) => invite.toSeat === view.participant.seat && invite.status.toUpperCase() === "PENDING").length ?? 0;
  const navigation = <nav className="game-tabs" aria-label="游戏分区">{([['ACTION', '行动'], ['TOWN', '城镇'], ['RECORD', '记录']] as const).map(([key, label]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}{key === "TOWN" && pendingInvites ? <small className="invite-badge">{pendingInvites}</small> : null}</button>)}</nav>;
  const utility = <div className="game-utility"><span>{game.aliveCount} 人存活 · 你是 {view.participant.seat} 号</span>{voiceRoomUrl || view.voiceRoomUrl ? <a href={voiceRoomUrl ?? view.voiceRoomUrl} target="_blank" rel="noreferrer">语音频道 ↗</a> : null}{game.pauseReason ? <p role="status">{game.pauseReason}{onResumeGame ? <button type="button" disabled={busy} onClick={onResumeGame}>延长等待</button> : null}</p> : null}</div>;
  const publicTown = <><RemoteTownBoard game={game} ownSeat={view.participant.seat} />{roomCode ? <SocialRoom code={roomCode} view={view} drafts={drafts ?? {}} setDrafts={setDrafts!} onRefresh={onRefresh ?? (() => undefined)} /> : null}</>;
  const submittedNightAction = isNight && view.history.some((entry) => entry.phase === game.phase && entry.day === game.day && entry.kind === "ACTION");
  if (isNight) return <main className="game-page game-page--night">
    <GameHeader phase={phaseNames[game.phase]!} day={game.day} role={role.name} onBack={onBack} />
    {utility}{navigation}<div className="game-content">{tab === "TOWN" ? publicTown : null}{tab === "RECORD" ? <><Clues history={view.history} messages={view.messages} /><PublicLog events={shownEvents} /><GameGuideLinks onOpen={onOpenGuide} /></> : null}<div hidden={tab !== "ACTION"}>

    {game.phase === "FIRST_NIGHT" && role.alignment === "EVIL" ? <EvilFirstNightIntel entries={view.history.filter((entry) => entry.phase === "ROLE_REVEAL" && (entry.kind === "INFORMATION" || entry.kind === "NOTICE"))} /> : null}
    {action?.kind === "SELECT_ONE" || action?.kind === "SELECT_TWO" ? <Panel className="action-panel">
      <p className="eyebrow">轮到你行动</p><h1>{action.prompt}</h1>
      <SeatChoices seats={game.seats} legalSeats={action.legalSeats} selected={selected} max={action.maxTargets} onChange={setSelected} />
      <Button disabled={disabled || selected.length !== action.maxTargets} onClick={() => onSubmitAction(selected)}>{busy ? "正在封存选择…" : `确认选择（${selected.length}/${action.maxTargets}）`}</Button>
    </Panel> : <Waiting title="村庄已经沉睡" detail={submittedNightAction ? "已提交，等待其他玩家。线索见记录。" : "等待其他玩家，轮到你时会显示操作。"} compact />}
    </div>{error ? <p className="game-error" role="alert">{error}</p> : null}</div>
  </main>;

  return <main className="game-page game-page--day">
    <GameHeader phase={phaseNames[game.phase] ?? game.phase} day={game.day} role={role.name} onBack={onBack} />
    {utility}{navigation}<div className="game-content">{tab === "TOWN" ? publicTown : null}{tab === "RECORD" ? <><Clues history={view.history} messages={view.messages} /><PublicLog events={shownEvents} /><GameGuideLinks onOpen={onOpenGuide} /></> : null}<div hidden={tab !== "ACTION"}>

    {game.phase === "VOTING" && game.nomination ? <Panel className="vote-panel">
      <h1>{defending ? "听取辩护" : "等待计票"}</h1>
      {view.butler ? <p className="butler-reminder">主人：{view.butler.masterSeat ? seatName(game.seats, view.butler.masterSeat) : "尚未选择"} · {view.butler.masterRaised ? "主人已举手或已计赞成" : "按你的角色规则，此时应放下手"}</p> : null}
      {view.canFinishDefense && onFinishDefense ? <Button variant="quiet" onClick={onFinishDefense} disabled={disabled}>结束辩护，开始表决</Button> : null}
      {view.canCancelNomination ? <Button className="cancel-nomination" variant="quiet" onClick={onCancelNomination} disabled={disabled}>撤销提名（仍消耗今日次数）</Button> : null}
      <details><summary>计票顺序与规则</summary><p>轮到本席前可调整举手；死者唯一鬼票仅在赞成票计入时消耗。</p><div className="vote-procession" aria-label="顺时针计票顺序">{(game.nomination.voterOrder ?? game.seats.map(p=>p.seat)).map(seat=><div key={seat} className={game.nomination?.currentVoterSeat===seat?"is-counting":""}><span>{seat}</span><small>{game.nomination?.countedSeats?.includes(seat)?game.nomination.countedVotes?.[seat]?"赞成":"未举手":"待计票"}</small></div>)}</div></details>
    </Panel> : <Panel className="day-panel">
      <p className="eyebrow">第 {game.day} 天</p><h1>{game.phase === "NOMINATION" ? "还可以继续提名" : "自由讨论"}</h1>

      {pendingNominee ? <div className="nomination-confirm"><strong>确认提名 {seatName(game.seats, pendingNominee)}？</strong><p>辩护结束前可撤销，仍消耗今日次数。</p><div><Button onClick={() => onNominate(pendingNominee)} disabled={disabled}>确认提名</Button><Button variant="quiet" onClick={() => setPendingNominee(undefined)} disabled={disabled}>暂不提名</Button></div></div> : canNominate ? <div className="nominee-grid">{game.seats.filter((seat) => view.nominationTargets?.includes(seat.seat) ?? true).map((seat) => <button key={seat.seat} type="button" disabled={disabled} onClick={() => setPendingNominee(seat.seat)}><span>{seat.seat}</span>{seat.nickname}<small>提名{!seat.alive ? " · 已死亡" : ""}</small></button>)}</div> : <p className="ghost-vote-note">{alive ? "你今天已经发起过提名，仍可参与讨论与投票。" : "你已死亡，仍可分享线索、参与讨论，并谨慎使用幽灵票。"}</p>}
      {game.onBlock ? <p className="on-block">当前处决候选：{seatName(game.seats, game.onBlock.seat)} · {game.onBlock.votes} 票</p> : null}
      {game.executionTied ? <p className="on-block">最高票持平，目前无人会被处决。仍可继续提名打破平票。</p> : null}
      {view.canEndDay ?? alive ? <Button variant="quiet" onClick={onReady} disabled={disabled}>{view.dayReady ? "撤回同意" : "同意结束今天"}（{game.readyCount}/{game.aliveCount}）</Button> : null}
    </Panel>}
    {alive && (view.canClaimSlayer ?? action?.kind === "SLAYER") ? <details className="slayer-declaration"><summary>公开宣称猎魔人能力</summary><p>任何存活玩家都可作出宣称，真假身份不会被公开。真实猎魔人的能力每局只有一次。</p><SeatChoices seats={game.seats} legalSeats={view.dayAbilityTargets ?? game.seats.map((seat) => seat.seat)} selected={selected} max={1} onChange={setSelected} />{pendingShot !== undefined ? <div className="nomination-confirm"><strong>向 {seatName(game.seats, pendingShot)} 开枪？</strong><p>所有玩家与公共大屏将同步看到宣称和枪击结果。</p><Button variant="danger" disabled={disabled} onClick={() => { onUseAbility(pendingShot); setPendingShot(undefined); }}>确认公开开枪</Button><Button variant="quiet" onClick={() => setPendingShot(undefined)}>收起武器</Button></div> : <Button variant="danger" disabled={disabled || selected.length !== 1} onClick={() => setPendingShot(selected[0]!)}>公开射击所选玩家</Button>}</details> : null}
    <p className="latest-event">{shownEvents.at(-1)?.message}</p></div>{error ? <p className="game-error" role="alert">{error}</p> : null}</div>
  </main>;
}

function GameHeader({ phase, day, role, onBack }: { phase: string; day: number; role: string; onBack: () => void }) { return <header className="game-header"><button className="screen-back screen-back--header" type="button" onClick={onBack}>← 首页</button><div className="game-header__phase"><span>第 {day || 1} 天</span><strong>{phase}</strong></div><div className="role-chip">{role}</div></header>; }

function RemoteTownBoard({ game, ownSeat }: { game: NonNullable<PrivateView["game"]>; ownSeat?: number }) {
  const [selected, setSelected] = useState<number>();
  const player = game.seats.find((seat) => seat.seat === selected);
  useBackLayer(Boolean(player),()=>setSelected(undefined));
  return <section className="remote-town-board" aria-label="公开城镇"><header><span>公开城镇</span><small>{game.aliveCount} 人存活 · {game.seats.length - game.aliveCount} 位亡灵</small></header><SeatRing seats={game.seats} {...(game.nomination?.currentVoterSeat ? { activeSeat: game.nomination.currentVoterSeat } : {})} {...(game.nomination?.countedVotes ? { countedVotes: game.nomination.countedVotes } : {})} {...(game.nomination?.raisedSeats ? { raisedSeats: game.nomination.raisedSeats } : {})} onSelect={setSelected} {...(ownSeat ? { ownSeat } : {})} /><p className="town-instruction">点击座位查看公开状态 · 身份始终保密</p>{player ? <section className="player-public-card"><button type="button" onClick={() => setSelected(undefined)} aria-label="关闭玩家公开卡">×</button><span>{player.seat} 号</span><h3>{player.nickname}</h3><p>{player.alive ? "存活" : "已死亡"} · {player.connected ? "在线" : "暂时离线"}</p><p>{player.alive ? "可以讨论、提名与投票。" : player.ghostVoteAvailable ? "仍可讨论 · 保留一枚幽灵票" : "仍可讨论 · 幽灵票已使用"}</p></section> : null}</section>;
}

function GameGuideLinks({ onOpen }: { onOpen: (mode: GuideMode) => void }) {
  return <div className="game-guide-links"><button type="button" onClick={() => onOpen("mine")}>我的角色</button><button type="button" onClick={() => onOpen("tutorial")}>教程</button><button type="button" onClick={() => onOpen("roles")}>角色表</button></div>;
}

function EvilFirstNightIntel({ entries }: { entries: PrivateHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return <Panel className="evil-intel"><p className="eyebrow">邪恶阵营首夜情报</p>{entries.map((entry) => <p key={entry.seq}>{entry.text}</p>)}</Panel>;
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
  return <details className="storyteller-review"><summary>说书人裁量复盘 · {decisions.length} 条</summary><p>对局结束后可查看本局的规则裁量和信息选择依据。</p><ol>{decisions.map((decision) => <li key={decision.id}><small>{decision.day ? `第 ${decision.day} 天` : "开局配置"}{decision.seat ? ` · ${decision.seat} 号` : ""}</small><strong>{decision.choice}</strong><p>{decision.reason}</p></li>)}</ol></details>;
}
function seatName(seats: Array<{ seat: number; nickname: string }>, seat: number) { const player = seats.find((candidate) => candidate.seat === seat); return `${player?.nickname ?? "玩家"}（${seat}号）`; }
function winReason(reason?: string) { return ({ "saint-executed": "圣徒被处决，邪恶达成了特殊胜利。", "mayor-final-three": "三人存活且无人被处决，镇长带领善良获胜。", "demon-dead": "恶魔已经死亡。", "final-two": "仅剩两人存活，邪恶控制了村庄。" } as Record<string, string>)[reason ?? ""] ?? "对局已结束。"; }
