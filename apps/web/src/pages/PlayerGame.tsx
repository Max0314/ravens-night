import {NominationNotice} from '../components/NominationNotice.js';
import {TownBoard} from '../components/TownBoard.js';
import {Avatar} from '../components/Avatar.js';
import {RoomPageShell,RoomActionBar,RoomSheet} from "../components/RoomPage.js";
import {useGameClock} from "../use-game-clock.js";
import { Button, Panel, RoleCard } from "@ravens/ui";
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrivateHistoryEntry, PrivateHistoryKind, PrivateView } from "../api.js";
import type { GuideMode } from "../components/GuideOverlay.js";
import { roleArt } from "../role-art.js";
import { EventStage, publicEventsAt, type PrivateReceipt } from "../components/EventStage.js";
import { PublicBallot } from "../components/PublicBallot.js";
import { ResultBoard } from "../components/ResultBoard.js";
import type { WhisperDrafts } from "../whisper-drafts.js";
import { SocialRoom } from "../components/SocialRoom.js";
import { createPortal } from "react-dom";
import "../styles/town-unified.css";

interface PlayerGameProps {
  privateVisible?:boolean;
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
  const closeGuide=useRef(props.onCloseGuide);closeGuide.current=props.onCloseGuide;
  useEffect(() => {
    const sync = () => {
      if (document.hidden) { closeGuide.current?.();setCovered(true); setSyncing(true); return; }
      setSyncing(true);
      void Promise.resolve(refresh.current?.()).then(() => setSyncing(false), () => undefined);
    };
    const cover=()=>{closeGuide.current?.();setCovered(true);}; window.addEventListener("ravens:cover-private",cover);
    document.addEventListener("visibilitychange", sync); window.addEventListener("online", sync);
    return () => { window.removeEventListener("ravens:cover-private",cover); document.removeEventListener("visibilitychange", sync); window.removeEventListener("online", sync); };
  }, []);
  return <div className="player-session">{covered && props.error ? <p role="alert" className="public-command-error">{props.error}</p> : null}{props.view ? <PublicBallot view={props.view} busy={props.busy || syncing} onVote={props.onVote} onDetails={()=>{if(!covered)setShowBallot(n=>n+1);}}/> : null}{props.view?<NominationNotice active={props.guideOpen===true} view={props.view} busy={props.busy||syncing} onVote={props.onVote} error={props.error} onDetails={()=>{props.onCloseGuide?.();if(!covered)setShowBallot(n=>n+1);}}/>:null}<PrivateActionNotice active={props.guideOpen===true&&!covered} view={props.view} onReturn={()=>{props.onCloseGuide?.();setShowBallot(n=>n+1);}}/><div className="player-private" hidden={covered} inert={covered}><PlayerGameContent {...props} privateVisible={!covered} drafts={drafts} setDrafts={setDrafts} showBallot={showBallot} busy={props.busy || syncing} /></div>{syncing ? <p role="status" className="session-status">正在同步当前轮次…</p> : null}{props.view?.game ? <><button className="privacy-toggle" type="button" onClick={() => {closeGuide.current?.();setCovered(true);}}>遮住私密内容</button><EventStage game={props.view.game} room={props.view.room} {...(!covered && props.receipt ? { receipt: props.receipt } : {})} />{covered ? <section className="privacy-curtain" aria-label="私密内容已遮住"><h1>私密内容已遮住</h1><Button onClick={() => setCovered(false)}>显示私密内容</Button></section> : null}</> : null}</div>;
}

function PlayerGameContent({ privateVisible=true, drafts, setDrafts, showBallot, view, busy, error, onBack, onConfirmStartInfo, onConfirmRole, onSubmitAction, onNominate, onCancelNomination, onReady, onUseAbility, onRestart, canRestart, onOpenGuide, roomCode, voiceRoomUrl, onLeave, onRefresh, onResumeGame, onFinishDefense }: PlayerGameProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [tab, setTab] = useState<"TOWN" | "RECORD">("TOWN");
  const [socialOpen,setSocialOpen]=useState(false),[roleOpen,setRoleOpen]=useState(true);
  const [readSeq,setReadSeq]=useState(0),[infoOpen,setInfoOpen]=useState(true);
  const game=view?.game,action=view?.action,now=useGameClock(game,view?.room);
  const content=useRef<HTMLDivElement>(null),positions=useRef<Record<string,number>>({});
  const selectionScope=JSON.stringify([view?.roomInstanceId,game?.gameId,view?.contextId,game?.contextId,game?.phase,action?.kind,action?.legalSeats,action?.maxTargets]);
  useEffect(()=>{setSelected([]);},[selectionScope,privateVisible]);
  useEffect(()=>{setRoleOpen(true);setSocialOpen(false);},[game?.gameId,view?.participant.id]);
  useEffect(()=>{setInfoOpen(!view?.startInfo?.acknowledged);},[view?.startInfo?.infoId]);
  useEffect(()=>{if(view?.startInfo?.acknowledged)setInfoOpen(false);},[view?.startInfo?.acknowledged]);
  useEffect(()=>{if(!privateVisible)setSocialOpen(false);},[privateVisible]);
  useEffect(()=>{if(showBallot){setTab("TOWN");setRoleOpen(true);setInfoOpen(!view?.startInfo?.acknowledged);}},[showBallot]);
  function changeTab(next:typeof tab){positions.current[tab]=content.current?.scrollTop??0;setTab(next);if(next==="RECORD")setReadSeq(view?.history.at(-1)?.seq??0);}
  useLayoutEffect(()=>{if(content.current)content.current.scrollTop=positions.current[tab]??0;},[tab,game?.phase]);
  useEffect(()=>{positions.current={};if(content.current)content.current.scrollTop=0;},[game?.contextId,game?.gameId]);
  useEffect(()=>{const reset=()=>setSelected([]);window.addEventListener("online",reset);return()=>window.removeEventListener("online",reset);},[]);
  const role=view?.role;
  if(!view||!role||!game)return <main className="game-page"><button className="screen-back" type="button" onClick={onBack}>← 返回首页</button><Waiting title="等待所有玩家" detail={`${view?.room?.tutorialCompleteCount??0}/${view?.room?.playerCount??"?"} 人完成教学，等待其他玩家。`} compact/></main>;
  if(game.phase==="ABORTED")return <RoomPageShell title="本局已中止" onBack={onBack} actions={<>{canRestart?<Button disabled={busy} onClick={onRestart}>返回大厅</Button>:null}{onLeave?<Button variant="quiet" disabled={busy} onClick={onLeave}>离开房间</Button>:null}{error?<p role="alert" className="form-error">{error}</p>:null}</>}><p>本局不判胜负。等待房主返回大厅后重新准备。</p></RoomPageShell>;
  if(game.phase==="GAME_OVER"&&(game.revealComplete===false||(game.presentationUntil??0)>now))return <main className="game-page"><Waiting title={game.winner?game.winner==="GOOD"?"善良阵营获胜":"邪恶阵营获胜":"终章将至"} detail="身份与战报将在最后一幕结束后公布。" compact/></main>;
  if(game.phase==="GAME_OVER")return <RoomPageShell className={`ending-page ending--${game.winner?.toLowerCase()}`} title={game.winner==="GOOD"?"善良阵营获胜":"邪恶阵营获胜"} onBack={onBack} actions={<>{canRestart?<Button onClick={onRestart} disabled={busy}>{busy?"正在重置…":"下一把"}</Button>:<p>等待房主开始下一把</p>}{onLeave?<Button variant="quiet" onClick={onLeave} disabled={busy}>离开房间</Button>:null}{error?<p role="alert">{error}</p>:null}</>}><p>{winReason(game.winReason)}</p><Panel className="clue-panel"><h2>你的真实身份</h2><p>{role.name} · {role.summary}</p>{role.perceivedAs?<p>本局自认 {role.perceivedAs}，此前信息可能不真实。</p>:null}</Panel>{roomCode?<ResultBoard code={roomCode} gameId={game.gameId}/>:null}<StorytellerReview decisions={view.storytellerDecisions??[]}/><Clues history={view.history} messages={view.messages}/><PublicLog events={game.events}/></RoomPageShell>;

  const isNight=game.phase==="FIRST_NIGHT"||game.phase==="OTHER_NIGHT";
  const selecting=isNight&&(action?.kind==="SELECT_ONE"||action?.kind==="SELECT_TWO");
  const disabled=busy||(game.presentationUntil??0)>now;
  const alive=game.seats.find(p=>p.seat===view.participant.seat)?.alive??false;
  const validSelection=selected.filter(seat=>action?.legalSeats.includes(seat));
  const submitted=isNight&&view.history.some(e=>e.phase===game.phase&&e.day===game.day&&e.kind==="ACTION");
  const pendingInfo=game.phase==="FIRST_NIGHT"&&view.startInfo&&!view.startInfo.acknowledged;
  const pendingInvites=view.social?.invitations.filter(i=>i.toSeat===view.participant.seat&&i.status.toUpperCase()==="PENDING").length??0;
  const hasDrafts=Object.values(drafts??{}).some(d=>d.text);
  return <main className={`game-page game-page--${isNight||game.phase==="ROLE_REVEAL"?"night":"day"} game-page--town`}>
    <GameHeader phase={phaseNames[game.phase]??game.phase} day={game.day} role={role.name} onBack={onBack}/>
    <div className="game-utility"><span>{game.aliveCount} 人存活 · 你是 {view.participant.seat} 号</span>{voiceRoomUrl||view.voiceRoomUrl?<a href={voiceRoomUrl??view.voiceRoomUrl} target="_blank" rel="noopener noreferrer">语音频道 ↗</a>:null}{game.pauseReason?<p role="status">{game.pauseReason}{onResumeGame?<button type="button" disabled={busy} onClick={onResumeGame}>延长等待</button>:null}</p>:null}</div>
    <nav className="game-tabs" aria-label="游戏分区">{([['TOWN','城镇'],['RECORD','记录']] as const).map(([key,label])=><button type="button" key={key} className={tab===key?'is-active':''} aria-pressed={tab===key} onClick={()=>changeTab(key)}>{label}{key==='TOWN'&&(pendingInvites||selecting||pendingInfo)?<small className="invite-badge">{pendingInvites||'待办'}</small>:key==='RECORD'&&view.history.some(e=>e.seq>readSeq&&e.kind==='INFORMATION')?<small className="invite-badge">新</small>:null}</button>)}</nav>
    <div className="game-content" ref={content}>
      {tab==='TOWN'?<>
        {isNight?<div className="town-night-prompt" role="status"><span>仅你可见</span><strong>{selecting?action.prompt:pendingInfo?'请先确认首夜信息':submitted?'已提交，等待其他玩家':'等待夜间行动'}</strong>{game.phase==='FIRST_NIGHT'&&view.startInfo?<button type="button" onClick={()=>setInfoOpen(true)}>查看首夜信息</button>:null}</div>:null}
        {game.phase==='ROLE_REVEAL'?<button className="town-confirm-entry" type="button" onClick={()=>setRoleOpen(true)}>{view.roleConfirmed?'查看我的身份':'确认我的身份'}</button>:null}
        <TownBoard view={view} code={roomCode} busy={disabled} privateVisible={privateVisible} selected={validSelection} onSelectNight={seat=>{if(disabled||!selecting||!action.legalSeats.includes(seat))return;setSelected(current=>current.includes(seat)?current.filter(s=>s!==seat):[...(current.length>=action.maxTargets?current.slice(1):current),seat]);}} onOpenSocial={()=>setSocialOpen(true)} hasDrafts={hasDrafts} error={error} onNominate={onNominate} onShoot={onUseAbility} {...(onRefresh?{onRefresh}:{})}/>
        {game.phase==='VOTING'&&game.nomination?<section className="town-vote-actions">
          {view.butler?<p className="butler-reminder">主人：{view.butler.masterSeat?seatName(game.seats,view.butler.masterSeat):'尚未选择'} · {view.butler.masterRaised?'主人已举手或已计赞成':'按你的角色规则，此时应放下手'}</p>:null}
          {view.canFinishDefense&&onFinishDefense?<Button variant="quiet" disabled={disabled} onClick={onFinishDefense}>结束辩护，开始表决</Button>:null}
          {view.canCancelNomination?<Button variant="quiet" disabled={disabled} onClick={onCancelNomination}>撤销提名（仍消耗今日次数）</Button>:null}
          <details><summary>计票顺序与规则</summary><p>轮到本席前可调整举手；死者唯一鬼票仅在赞成票计入时消耗。</p><div className="vote-procession" aria-label="顺时针计票顺序">{(game.nomination.voterOrder??game.seats.map(p=>p.seat)).map(seat=><div key={seat} className={game.nomination?.currentVoterSeat===seat?'is-counting':''}><span>{seat}</span><small>{game.nomination?.countedSeats?.includes(seat)?game.nomination.countedVotes?.[seat]?'赞成':'未举手':'待计票'}</small></div>)}</div></details>
        </section>:null}
      </>:<><Clues history={view.history} messages={view.messages}/><PublicLog events={publicEventsAt(game.events,now)}/><GameGuideLinks onOpen={onOpenGuide}/></>}
    </div>
    <RoomActionBar>
      {tab==='RECORD'&&(selecting||pendingInfo||game.phase==='ROLE_REVEAL'&&!view.roleConfirmed)?<Button onClick={()=>{changeTab('TOWN');setRoleOpen(true);setInfoOpen(!view.startInfo?.acknowledged);}}>返回城镇处理待办</Button>:tab==='TOWN'&&selecting?<div className="town-night-confirm"><div aria-live="polite">{validSelection.length?validSelection.map(seat=><button type="button" key={seat} disabled={disabled} onClick={()=>setSelected(s=>s.filter(n=>n!==seat))}>{seat}号 {game.seats.find(p=>p.seat===seat)?.nickname} ×</button>):<span>点击圆桌头像选择目标</span>}</div><Button disabled={disabled||validSelection.length!==action.maxTargets} onClick={()=>onSubmitAction(validSelection)}>{busy?'正在提交…':`确认选择（${validSelection.length}/${action.maxTargets}）`}</Button></div>:['DAY_DISCUSSION','NOMINATION'].includes(game.phase)&&(view.canEndDay??alive)?<Button variant="quiet" onClick={onReady} disabled={disabled}>{view.dayReady?'撤回同意':'同意结束今天'}（{game.readyCount}/{game.aliveCount}）</Button>:null}
      {error?<p className="form-error" role="alert">{error}</p>:null}
    </RoomActionBar>
    {roomCode&&privateVisible?<SocialRoom open={socialOpen} onClose={()=>setSocialOpen(false)} code={roomCode} view={view} drafts={drafts??{}} setDrafts={setDrafts!} onRefresh={onRefresh??(()=>undefined)}/>:null}
    {privateVisible&&tab==='TOWN'&&game.phase==='ROLE_REVEAL'&&roleOpen?<div className="town-role-confirm"><RoomSheet title="身份确认" onClose={()=>setRoleOpen(false)} actions={<><Button onClick={onConfirmRole} disabled={disabled||view.roleConfirmed}>{view.roleConfirmed?'已确认，等待其他玩家':busy?'正在提交…':'确认身份'}</Button>{error?<p role="alert">{error}</p>:null}</>}><RoleCard name={role.name} alignment={`${role.alignment==='GOOD'?'善良':'邪恶'} · ${role.type==='TOWNSFOLK'?'镇民':role.type==='OUTSIDER'?'外来者':role.type==='MINION'?'爪牙':'恶魔'}`} ability={role.summary} {...roleArt(role.roleId)}/><button type="button" className="role-advice-trigger" onClick={()=>{setRoleOpen(false);onOpenGuide('mine');}}>游玩建议</button></RoomSheet></div>:null}
    {privateVisible&&tab==='TOWN'&&game.phase==='FIRST_NIGHT'&&view.startInfo&&infoOpen?<RoomSheet title="首夜信息 · 仅你可见" onClose={()=>setInfoOpen(false)} actions={<><Button disabled={disabled||!view.startInfo.canAcknowledge} onClick={()=>onConfirmStartInfo?.(view.startInfo!.infoId)}>{view.startInfo.acknowledged?'已知晓，等待其他玩家':busy?'正在确认…':'已知晓'}</Button>{error?<p role="alert">{error}</p>:null}</>}><div className="start-info-team">{view.startInfo.team.map(p=><article key={p.seat}><Avatar id={`start-${p.seat}`} name={p.nickname} url={p.avatar}/><strong>{p.seat}号 · {p.nickname}</strong><small>{p.kind==='DEMON'?'恶魔':'爪牙'}</small></article>)}</div>{view.startInfo.bluffs.length?<section className="start-info-bluffs"><h2>未在场角色</h2>{view.startInfo.bluffs.map(r=><article key={r.roleId}><strong>{r.name}</strong><p>{r.summary}</p></article>)}</section>:null}</RoomSheet>:null}
  </main>;
}

export function hasPrivateTownTask(view?:PrivateView){
  return !!view&&((['FIRST_NIGHT','OTHER_NIGHT'].includes(view.game?.phase??'')&&(view.action?.kind==='SELECT_ONE'||view.action?.kind==='SELECT_TWO'))||(view.game?.phase==='FIRST_NIGHT'&&!!view.startInfo&&!view.startInfo.acknowledged)||(view.game?.phase==='ROLE_REVEAL'&&!view.roleConfirmed));
}
function PrivateActionNotice({active,view,onReturn}:{active:boolean;view?:PrivateView|undefined;onReturn:()=>void}){
  if(!active||!hasPrivateTownTask(view))return null;
  return createPortal(<aside className="private-action-notice" aria-label="我的行动提醒"><span>仅你可见 · 有待完成的行动</span><button type="button" onClick={onReturn}>返回城镇</button></aside>,document.body);
}

function GameHeader({ phase, day, role, onBack }: { phase: string; day: number; role: string; onBack: () => void }) { return <header className="game-header"><button className="screen-back screen-back--header" type="button" onClick={onBack}>← 首页</button><div className="game-header__phase"><span>第 {day || 1} 天</span><strong>{phase}</strong></div><div className="role-chip">{role}</div></header>; }

function GameGuideLinks({ onOpen }: { onOpen: (mode: GuideMode) => void }) {
  return <div className="game-guide-links"><button type="button" onClick={() => onOpen("mine")}>我的角色</button><button type="button" onClick={() => onOpen("tutorial")}>教程</button><button type="button" onClick={() => onOpen("roles")}>角色表</button></div>;
}

function Waiting({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) { return <section className={compact ? "inline-waiting" : "night-page"}><Panel className="night-action"><h1>{title}</h1><p>{detail}</p><div className="waiting-orbit"><span /></div></Panel></section>; }

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
