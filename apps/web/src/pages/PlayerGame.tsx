import {NominationNotice} from '../components/NominationNotice.js';
import {TownBoard} from '../components/TownBoard.js';
import {Avatar} from '../components/Avatar.js';
import {RoomPageShell,RoomActionBar,RoomSheet,PlayerTile} from "../components/RoomPage.js";
import {useGameClock} from "../use-game-clock.js";
import { Button, Panel, RoleCard, SeatRing } from "@ravens/ui";
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  guideOpen?:boolean;
  onCloseGuide?:()=>void;
  drafts?: WhisperDrafts;
  setDrafts?: Dispatch<SetStateAction<WhisperDrafts>>;
  showBallot?: number;
  view?: PrivateView;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onConfirmStartInfo?: (infoId:string)=>void;
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
  return <div className="player-session">{covered && props.error ? <p role="alert" className="public-command-error">{props.error}</p> : null}{props.view ? <PublicBallot view={props.view} busy={props.busy || syncing} onVote={props.onVote} onDetails={()=>{if(!covered)setShowBallot(n=>n+1);}}/> : null}{props.view?<NominationNotice active={props.guideOpen===true} view={props.view} busy={props.busy||syncing} onVote={props.onVote} error={props.error} onDetails={()=>{props.onCloseGuide?.();if(!covered)setShowBallot(n=>n+1);}}/>:null}<div className="player-private" hidden={covered} inert={covered}><PlayerGameContent {...props} drafts={drafts} setDrafts={setDrafts} showBallot={showBallot} busy={props.busy || syncing} /></div>{syncing ? <p role="status" className="session-status">正在同步当前轮次…</p> : null}{props.view?.game ? <><button className="privacy-toggle" type="button" onClick={() => setCovered(true)}>遮住私密内容</button><EventStage game={props.view.game} room={props.view.room} {...(!covered && props.receipt ? { receipt: props.receipt } : {})} />{covered ? <section className="privacy-curtain" aria-label="私密内容已遮住"><h1>私密内容已遮住</h1><Button onClick={() => setCovered(false)}>显示私密内容</Button></section> : null}</> : null}</div>;
}

function PlayerGameContent({ drafts, setDrafts, showBallot, view, busy, error, onBack, onConfirmStartInfo, onConfirmRole, onSubmitAction, onNominate, onCancelNomination, onVote, onReady, onUseAbility, onRestart, canRestart, onOpenGuide, roomCode, voiceRoomUrl, onLeave, onRefresh, onResumeGame, onFinishDefense }: PlayerGameProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingNominee, setPendingNominee] = useState<number>();
  const [pendingShot, setPendingShot] = useState<number>();
  const [tab, setTab] = useState<"ACTION" | "TOWN" | "RECORD">("ACTION");
  useBackLayer(pendingNominee !== undefined && tab === "ACTION",()=>setPendingNominee(undefined));
  useBackLayer(pendingShot !== undefined && tab === "ACTION",()=>setPendingShot(undefined));
  useEffect(()=>{if(showBallot)setTab("ACTION");},[showBallot]);
  const game = view?.game;
  const now=useGameClock(game,view?.room);
  const content=useRef<HTMLDivElement>(null),positions=useRef<Record<string,number>>({});
  const [readSeq,setReadSeq]=useState(0),[infoOpen,setInfoOpen]=useState(true),[advice,setAdvice]=useState(false);
  const infoContext=useRef<string|undefined>(undefined);
  useEffect(()=>{infoContext.current=view?.game?.contextId;setInfoOpen(!view?.startInfo?.acknowledged);},[view?.startInfo?.infoId]);
  useEffect(()=>{if(view?.startInfo?.acknowledged&&(view.action||view.game?.contextId!==infoContext.current))setInfoOpen(false);},[view?.startInfo?.acknowledged,view?.action?.kind,view?.game?.contextId]);
  function changeTab(next:typeof tab){positions.current[tab]=content.current?.scrollTop??0;setTab(next);if(next==="RECORD")setReadSeq(view?.history.at(-1)?.seq??0);}
  useLayoutEffect(()=>{if(content.current)content.current.scrollTop=positions.current[tab]??0;},[tab,game?.phase]);
  useEffect(()=>{positions.current={};if(content.current)content.current.scrollTop=0;},[game?.contextId,game?.gameId]);
  useEffect(()=>{const reset=()=>{setSelected([]);setPendingNominee(undefined);setPendingShot(undefined);};const visible=()=>{if(!document.hidden)reset();};window.addEventListener("online",reset);document.addEventListener("visibilitychange",visible);return()=>{window.removeEventListener("online",reset);document.removeEventListener("visibilitychange",visible);};},[]);
  const role = view?.role;
  const shownEvents = publicEventsAt(game?.events ?? [], now);
  useEffect(() => { setSelected([]); setPendingNominee(undefined); setPendingShot(undefined); }, [view?.roomInstanceId, game?.gameId, view?.contextId, game?.contextId, game?.phase, game?.nomination?.ballotId, view?.action?.kind]);

  if (!view || !role || !game) return <main className="game-page"><button className="screen-back" type="button" onClick={onBack}>← 返回首页</button><Waiting title="等待所有玩家" detail={`${view?.room?.tutorialCompleteCount ?? 0}/${view?.room?.playerCount ?? "?"} 人完成教学，等待其他玩家。`} compact /></main>;

  if (game.phase === "ABORTED") return <RoomPageShell title="本局已中止" onBack={onBack} actions={<>{canRestart?<Button disabled={busy} onClick={onRestart}>返回大厅</Button>:null}{onLeave?<Button variant="quiet" disabled={busy} onClick={onLeave}>离开房间</Button>:null}{error?<p role="alert" className="form-error">{error}</p>:null}</>}><p>本局不判胜负。等待房主返回大厅后重新准备。</p></RoomPageShell>;

  if (game.phase === "ROLE_REVEAL") return <RoomPageShell className="role-confirm-page" title="身份确认" subtitle="仅你可见" onBack={onBack} actions={<><Button onClick={onConfirmRole} disabled={busy||view.roleConfirmed}>{view.roleConfirmed?"已确认，等待其他玩家":busy?"正在提交…":"确认身份"}</Button>{error?<p role="alert" className="form-error">{error}</p>:null}</>}><RoleCard name={role.name} alignment={`${role.alignment==="GOOD"?"善良":"邪恶"} · ${role.type==="TOWNSFOLK"?"镇民":role.type==="OUTSIDER"?"外来者":role.type==="MINION"?"爪牙":"恶魔"}`} ability={role.summary} {...roleArt(role.roleId)}/><button type="button" className="role-advice-trigger" onClick={()=>setAdvice(true)}>游玩建议</button>{advice?<RoomSheet title="游玩建议" onClose={()=>setAdvice(false)}><p>{role.beginnerTip}</p></RoomSheet>:null}<GameGuideLinks onOpen={onOpenGuide}/></RoomPageShell>;

  if(game.phase==='FIRST_NIGHT'&&view.startInfo&&infoOpen)return <RoomPageShell title="首夜信息" subtitle="仅你可见" onBack={()=>setInfoOpen(false)} actions={<><Button disabled={busy||!view.startInfo.canAcknowledge} onClick={()=>onConfirmStartInfo?.(view.startInfo!.infoId)}>{view.startInfo.acknowledged?'已知晓，等待其他玩家':busy?'正在确认…':'已知晓'}</Button><button type="button" onClick={()=>setInfoOpen(false)}>收起</button>{error?<p role="alert">{error}</p>:null}</>}><div className="start-info-team">{view.startInfo.team.map(p=><article key={p.seat}><Avatar id={`start-${p.seat}`} name={p.nickname} url={p.avatar}/><strong>{p.seat}号 · {p.nickname}</strong><small>{p.kind==='DEMON'?'恶魔':'爪牙'}</small></article>)}</div>{view.startInfo.bluffs.length?<section className="start-info-bluffs"><h2>未在场角色</h2>{view.startInfo.bluffs.map(r=><article key={r.roleId}><strong>{r.name}</strong><p>{r.summary}</p></article>)}</section>:null}</RoomPageShell>;

  if (game.phase === "GAME_OVER" && (game.revealComplete === false || (game.presentationUntil ?? 0) > now)) return <main className="game-page"><Waiting title={game.winner ? game.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜" : "终章将至"} detail="身份与战报将在最后一幕结束后公布。" compact /></main>;
  if (game.phase === "GAME_OVER") return <RoomPageShell className={`ending-page ending--${game.winner?.toLowerCase()}`} title={game.winner==="GOOD"?"善良阵营获胜":"邪恶阵营获胜"} onBack={onBack} actions={<>{canRestart?<Button onClick={onRestart} disabled={busy}>{busy?"正在重置…":"下一把"}</Button>:<p>等待房主开始下一把</p>}{onLeave?<Button variant="quiet" onClick={onLeave} disabled={busy}>离开房间</Button>:null}{error?<p role="alert">{error}</p>:null}</>}><p>{winReason(game.winReason)}</p><Panel className="clue-panel"><h2>你的真实身份</h2><p>{role.name} · {role.summary}</p>{role.perceivedAs?<p>本局自认 {role.perceivedAs}，此前信息可能不真实。</p>:null}</Panel>{roomCode?<ResultBoard code={roomCode} gameId={game.gameId}/>:null}<StorytellerReview decisions={view.storytellerDecisions??[]}/><Clues history={view.history} messages={view.messages}/><PublicLog events={game.events}/></RoomPageShell>;

  const action = view.action;
  const isNight = game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT";
  const mine = game.seats.find((seat) => seat.seat === view.participant.seat);
  const alive = mine?.alive ?? false;
  const canNominate = view.canNominate ?? alive;
  const locked = Boolean(game.presentationUntil && game.presentationUntil > now);
  const disabled = busy || locked;
  const defending = Boolean(game.nomination?.defenseUntil && now < game.nomination.defenseUntil);
  const pendingInvites = view.social?.invitations.filter((invite) => invite.toSeat === view.participant.seat && invite.status.toUpperCase() === "PENDING").length ?? 0;
  const navigation = <nav className="game-tabs" aria-label="游戏分区">{([['ACTION', '行动'], ['TOWN', '城镇'], ['RECORD', '记录']] as const).map(([key, label]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} aria-pressed={tab === key} onClick={() => changeTab(key)}>{label}{key === "TOWN" && pendingInvites ? <small className="invite-badge">{pendingInvites}</small> : key==="RECORD"&&view.history.some(e=>e.seq>readSeq&&e.kind==="INFORMATION")?<small className="invite-badge">新</small>:null}</button>)}</nav>;
  const utility = <div className="game-utility"><span>{game.aliveCount} 人存活 · 你是 {view.participant.seat} 号</span>{voiceRoomUrl || view.voiceRoomUrl ? <a href={voiceRoomUrl ?? view.voiceRoomUrl} target="_blank" rel="noopener noreferrer">语音频道 ↗</a> : null}{game.pauseReason ? <p role="status">{game.pauseReason}{onResumeGame ? <button type="button" disabled={busy} onClick={onResumeGame}>延长等待</button> : null}</p> : null}</div>;
  const publicTown = <><TownBoard view={view} code={roomCode} busy={disabled} error={error} onNominate={onNominate} onShoot={onUseAbility} {...(onRefresh?{onRefresh}:{})}/>{roomCode ? <SocialRoom code={roomCode} view={view} drafts={drafts ?? {}} setDrafts={setDrafts!} onRefresh={onRefresh ?? (() => undefined)} /> : null}</>;
  const submittedNightAction = isNight && view.history.some((entry) => entry.phase === game.phase && entry.day === game.day && entry.kind === "ACTION");
  if (isNight) return <main className="game-page game-page--night">
    <GameHeader phase={phaseNames[game.phase]!} day={game.day} role={role.name} onBack={onBack} />
    {utility}{navigation}<div className="game-content" ref={content}>{tab === "TOWN" ? publicTown : null}{tab === "RECORD" ? <><Clues history={view.history} messages={view.messages} /><PublicLog events={shownEvents} /><GameGuideLinks onOpen={onOpenGuide} /></> : null}<div hidden={tab !== "ACTION"}>{tab==="ACTION"?<>

    {game.phase==='FIRST_NIGHT'&&view.startInfo?<button type="button" onClick={()=>setInfoOpen(true)}>查看首夜信息</button>:null}
    {action?.kind === "SELECT_ONE" || action?.kind === "SELECT_TWO" ? <Panel className="action-panel">
      <p className="eyebrow">轮到你行动</p><h1>{action.prompt}</h1>
      <SeatChoices seats={game.seats} legalSeats={action.legalSeats} selected={selected} max={action.maxTargets} onChange={setSelected} />

    </Panel> : <Waiting title="村庄已经沉睡" detail={submittedNightAction ? "已提交，等待其他玩家。线索见记录。" : "等待其他玩家，轮到你时会显示操作。"} compact />}
    </>:null}</div></div>{tab==="ACTION"?<RoomActionBar>{action?.kind==="SELECT_ONE"||action?.kind==="SELECT_TWO"?<Button disabled={disabled||selected.length!==action.maxTargets} onClick={()=>onSubmitAction(selected)}>{busy?"正在提交…":`确认选择（${selected.length}/${action.maxTargets}）`}</Button>:<p>{submittedNightAction?"已提交，等待其他玩家":"等待行动"}</p>}{error?<p className="form-error" role="alert">{error}</p>:null}</RoomActionBar>:null}
  </main>;

  return <main className="game-page game-page--day">
    <GameHeader phase={phaseNames[game.phase] ?? game.phase} day={game.day} role={role.name} onBack={onBack} />
    {utility}{navigation}<div className="game-content" ref={content}>{tab === "TOWN" ? publicTown : null}{tab === "RECORD" ? <><Clues history={view.history} messages={view.messages} /><PublicLog events={shownEvents} /><GameGuideLinks onOpen={onOpenGuide} /></> : null}<div hidden={tab !== "ACTION"}>{tab==="ACTION"?<>

    {game.phase === "VOTING" && game.nomination ? <>{publicTown}<Panel className="vote-panel">
      <h1>{defending ? "听取辩护" : "等待计票"}</h1>
      {view.butler ? <p className="butler-reminder">主人：{view.butler.masterSeat ? seatName(game.seats, view.butler.masterSeat) : "尚未选择"} · {view.butler.masterRaised ? "主人已举手或已计赞成" : "按你的角色规则，此时应放下手"}</p> : null}
      {view.canFinishDefense && onFinishDefense ? <Button variant="quiet" onClick={onFinishDefense} disabled={disabled}>结束辩护，开始表决</Button> : null}
      {view.canCancelNomination ? <Button className="cancel-nomination" variant="quiet" onClick={onCancelNomination} disabled={disabled}>撤销提名（仍消耗今日次数）</Button> : null}
      <details><summary>计票顺序与规则</summary><p>轮到本席前可调整举手；死者唯一鬼票仅在赞成票计入时消耗。</p><div className="vote-procession" aria-label="顺时针计票顺序">{(game.nomination.voterOrder ?? game.seats.map(p=>p.seat)).map(seat=><div key={seat} className={game.nomination?.currentVoterSeat===seat?"is-counting":""}><span>{seat}</span><small>{game.nomination?.countedSeats?.includes(seat)?game.nomination.countedVotes?.[seat]?"赞成":"未举手":"待计票"}</small></div>)}</div></details>
    </Panel></> : <>{publicTown}<details className="alternate-actions"><summary>按列表选择玩家</summary><Panel className="day-panel">
      <p className="eyebrow">第 {game.day} 天</p><h1>{game.phase === "NOMINATION" ? "还可以继续提名" : "自由讨论"}</h1>

      {pendingNominee ? <div className="nomination-confirm"><strong>确认提名 {seatName(game.seats, pendingNominee)}？</strong><p>辩护结束前可撤销，仍消耗今日次数。</p></div> : canNominate ? <div className="nominee-grid">{game.seats.filter((seat) => view.nominationTargets?.includes(seat.seat) ?? true).map((seat) => <PlayerTile key={seat.seat} player={seat} disabled={disabled} onClick={()=>setPendingNominee(seat.seat)} detail={seat.alive?"提名":"提名 · 已死亡"}/>)}</div> : <p className="ghost-vote-note">{alive ? "你今天已经发起过提名，仍可参与讨论与投票。" : "你已死亡，仍可分享线索、参与讨论，并谨慎使用幽灵票。"}</p>}
      {game.onBlock&&!game.executionTied ? <p className="on-block">当前处决候选：{seatName(game.seats, game.onBlock.seat)} · {game.onBlock.votes} 票</p> : null}
      {game.executionTied ? <p className="on-block">最高票持平，目前无人会被处决。仍可继续提名打破平票。</p> : null}

    </Panel></details></>}
    {alive && (view.canClaimSlayer ?? action?.kind === "SLAYER") ? <details className="slayer-declaration"><summary>按列表公开宣称猎魔人能力</summary><p>任何存活玩家都可作出宣称，真假身份不会被公开。真实猎魔人的能力每局只有一次。</p><SeatChoices seats={game.seats} legalSeats={view.dayAbilityTargets ?? game.seats.map((seat) => seat.seat)} selected={selected} max={1} onChange={setSelected} />{pendingShot !== undefined ? <div className="nomination-confirm"><strong>向 {seatName(game.seats, pendingShot)} 开枪？</strong><p>所有玩家与公共大屏将同步看到宣称和枪击结果。</p><Button variant="danger" disabled={disabled} onClick={() => { onUseAbility(pendingShot); setPendingShot(undefined); }}>确认公开开枪</Button><Button variant="quiet" onClick={() => setPendingShot(undefined)}>收起武器</Button></div> : <Button variant="danger" disabled={disabled || selected.length !== 1} onClick={() => setPendingShot(selected[0]!)}>公开射击所选玩家</Button>}</details> : null}
    </>:null}</div></div>{tab==="ACTION"?<RoomActionBar>{pendingNominee!==undefined?<div className="room-action-pair"><Button onClick={()=>onNominate(pendingNominee)} disabled={disabled}>确认提名 {pendingNominee}号</Button><Button variant="quiet" disabled={disabled} onClick={()=>setPendingNominee(undefined)}>取消</Button></div>:game.phase!=="VOTING"&&(view.canEndDay??alive)?<Button variant="quiet" onClick={onReady} disabled={disabled}>{view.dayReady?"撤回同意":"同意结束今天"}（{game.readyCount}/{game.aliveCount}）</Button>:null}{error?<p className="form-error" role="alert">{error}</p>:null}</RoomActionBar>:null}
  </main>;
}

function GameHeader({ phase, day, role, onBack }: { phase: string; day: number; role: string; onBack: () => void }) { return <header className="game-header"><button className="screen-back screen-back--header" type="button" onClick={onBack}>← 首页</button><div className="game-header__phase"><span>第 {day || 1} 天</span><strong>{phase}</strong></div><div className="role-chip">{role}</div></header>; }

function GameGuideLinks({ onOpen }: { onOpen: (mode: GuideMode) => void }) {
  return <div className="game-guide-links"><button type="button" onClick={() => onOpen("mine")}>我的角色</button><button type="button" onClick={() => onOpen("tutorial")}>教程</button><button type="button" onClick={() => onOpen("roles")}>角色表</button></div>;
}

function Waiting({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) { return <section className={compact ? "inline-waiting" : "night-page"}><Panel className="night-action"><h1>{title}</h1><p>{detail}</p><div className="waiting-orbit"><span /></div></Panel></section>; }

function SeatChoices({seats,legalSeats,selected,max,onChange}:{seats:NonNullable<PrivateView["game"]>["seats"];legalSeats:number[];selected:number[];max:number;onChange:(seats:number[])=>void}){return <div className="seat-choices">{seats.map(seat=><PlayerTile key={seat.seat} player={seat} disabled={!legalSeats.includes(seat.seat)} selected={selected.includes(seat.seat)} detail={!legalSeats.includes(seat.seat)?"不可选择":seat.alive?undefined:"已死亡"} onClick={()=>onChange(selected.includes(seat.seat)?selected.filter(s=>s!==seat.seat):[...(selected.length>=max?selected.slice(1):selected),seat.seat])}/>)}</div>;}

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
