import {publicNightDeathSeats} from './public-night-deaths.js';
import {FeedbackButton} from '@ravens/ui';
import {playerLabel,formatPlayerText} from '@ravens/ui';
import {useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {SeatRing,Button} from '@ravens/ui';
import {inviteWhisper,type PrivateView} from '../api.js';
import {useBackLayer} from '../use-back-layer.js';
import {Gallows} from './Gallows.js';
import {knownPlayerClues,publicPlayerDetail} from './player-detail.js';
import {useGameClock} from '../use-game-clock.js';
import {Avatar} from './Avatar.js';
import {RoomSheet} from './RoomPage.js';
import {RoomProfileEditor} from './RoomProfileEditor.js';
import {RoundTable} from './RoundTable.js';
import {SpyTownBoard} from './SpyTownBoard.js';
import './town-markers.css';
import './player-wheel.css';

interface TownBoardProps {
  view:PrivateView;code?:string|undefined;busy:boolean;error?:string|undefined;
  center?:ReactNode;focusTask?:number;
  privateVisible?:boolean;selected?:number[];onSelectNight?:(seat:number)=>void;
  onOpenSocial?:()=>void;hasDrafts?:boolean;
  onNominate:(seat:number)=>void;onShoot:(seat:number)=>void;onRefresh?:()=>void|Promise<void>;
}
export function TownBoard({view,code,busy,onNominate,onShoot,onRefresh,error:commandError,center,focusTask=0,privateVisible=true,selected=[],onSelectNight,onOpenSocial,hasDrafts=false}:TownBoardProps){
  const now=useGameClock(view.game,view.room);
  const game=view.game!,night=['FIRST_NIGHT','OTHER_NIGHT'].includes(game.phase);
  const selecting=night&&(view.action?.kind==='SELECT_ONE'||view.action?.kind==='SELECT_TWO');
  const context=JSON.stringify([view.roomInstanceId,game.gameId,game.contextId,view.contextId,game.phase,game.nomination?.ballotId,view.action?.kind,view.action?.legalSeats]);
  const [picked,setPicked]=useState<{seat:number;x:number;y:number;context:string}>(),[action,setAction]=useState<'DETAIL'|'NOMINATE'|'SHOOT'>(),[editing,setEditing]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[clueSeq,setClueSeq]=useState<number>(),[spyOpen,setSpyOpen]=useState(false),[spySeq,setSpySeq]=useState<number>(),[clueOpen,setClueOpen]=useState(false),[gallowsOpen,setGallowsOpen]=useState(false);
  const player=privateVisible&&picked?.context===context?game.seats.find(p=>p.seat===picked.seat):undefined;
  useEffect(()=>{setPicked(undefined);setAction(undefined);setEditing(false);setError('');},[context,privateVisible]);
  useEffect(()=>{setSpyOpen(false);setSpySeq(undefined);setClueOpen(false);setGallowsOpen(false);},[game.gameId,view.participant.id,privateVisible]);
  useEffect(()=>{if(focusTask){setPicked(undefined);setAction(undefined);setEditing(false);setClueOpen(false);setGallowsOpen(false);setSpyOpen(false);}},[focusTask]);
  const clues=view.history.filter(e=>e.kind==='INFORMATION'),clue=clues.find(e=>e.seq===clueSeq)??clues.at(-1);
  const openClue=()=>{setClueSeq(clue?.seq);setClueOpen(true);};
  const marks:Record<number,string>={};
  if(privateVisible){
    for(const p of view.startInfo?.team??[])marks[p.seat]=p.kind==='DEMON'?'恶魔':'爪牙';
    const candidate=clue?.candidateGroup;
    for(const seat of candidate?.seats??clue?.targetSeats??[])marks[seat]=[marks[seat],candidate?`① 可能是${candidate.roleName}`:'线索'].filter(Boolean).join(' · ');
    if(view.butler?.masterSeat)marks[view.butler.masterSeat]=[marks[view.butler.masterSeat],'主人'].filter(Boolean).join(' · ');
  }
  const day=['DAY_DISCUSSION','NOMINATION'].includes(game.phase),publicDay=day||game.phase==='VOTING',self=game.seats.find(p=>p.seat===view.participant.seat),own=player?.seat===view.participant.seat;
  const nomination=day&&(view.canNominate??self?.alive)&&Boolean(player&&(view.nominationTargets??game.seats.map(p=>p.seat)).includes(player.seat));
  const shot=publicDay&&(view.canClaimSlayer??self?.alive)&&Boolean(player&&(view.dayAbilityTargets??game.seats.map(p=>p.seat)).includes(player.seat));
  const relations=view.social?.relations??[];
  const mineBusy=!!view.social?.activeWhisper||view.social?.invitations.some(i=>i.status.toUpperCase()==='PENDING')===true;
  const playerRelation=relations.find(r=>r.fromSeat===player?.seat||r.toSeat===player?.seat);
  const ownRelation=relations.find(r=>r.fromSeat===view.participant.seat||r.toSeat===view.participant.seat);
  const privatePair=!!player&&!!(view.social?.activeWhisper?.participants.includes(player.seat)||view.social?.invitations.some(i=>i.status.toUpperCase()==='PENDING'&&(i.fromSeat===player.seat||i.toSeat===player.seat)));
  const canOpenChat=publicDay&&!!onOpenSocial&&((own&&(mineBusy||hasDrafts))||(!own&&privatePair));
  const whisper=publicDay&&!own&&player?.connected&&code&&!mineBusy&&!playerRelation;
  const nightLabel=({poisoner:'下毒',imp:'袭击',monk:'保护',butler:'选择主人',fortune_teller:'占卜',ravenkeeper:'查验'} as Record<string,string>)[view.role?.roleId??'']??'选择目标';
  async function invite(){if(!player||!code||!whisper)return;setSending(true);setError('');try{await inviteWhisper(code,player.seat);await onRefresh?.();setPicked(undefined);onOpenSocial?.();}catch(e){setError(e instanceof Error?e.message:'邀请未发送，请重试');}finally{setSending(false);}}
  const threatened=publicDay&&game.nomination?[game.nomination.nomineeSeat]:[];
  const centerSeat=game.nomination?.nomineeSeat??(!game.executionTied?game.onBlock?.seat:undefined),centerPlayer=game.seats.find(p=>p.seat===centerSeat);
  const names=(seat:number)=>playerLabel(seat,game.seats.find(p=>p.seat===seat)?.nickname);
  const master=game.seats.find(p=>p.seat===view.butler?.masterSeat);
  const hasGrimoire=clues.some(entry=>entry.grimoire);

  return <section data-private-feedback={night||spyOpen?'true':undefined} data-town-reading={spyOpen?"true":"false"} className="remote-town-board" aria-label={spyOpen?'我的魔典':'公开城镇'}><header>{clue||view.startInfo||master?<FeedbackButton feedbackScope="private" className="town-clue-entry" type="button" onClick={()=>{setSpyOpen(false);openClue();}}>我的线索</FeedbackButton>:null}
    {hasGrimoire?<nav className="town-view-switch" aria-label="城镇视图"><FeedbackButton type="button" aria-pressed={!spyOpen} onClick={()=>{setPicked(undefined);setSpyOpen(false);}}>公开城镇</FeedbackButton><FeedbackButton type="button" aria-pressed={spyOpen} onClick={()=>{setPicked(undefined);setSpySeq(clues.filter(e=>e.grimoire).at(-1)?.seq);setSpyOpen(true);}}>我的魔典</FeedbackButton></nav>:null}</header>
    {privateVisible&&spyOpen?<SpyTownBoard key={spySeq??"latest"} {...(spySeq===undefined?{}:{initialSeq:spySeq})} entries={view.history} onReturn={()=>setSpyOpen(false)}/>:<>

    <RoundTable stable key={`${game.gameId}:${view.participant.id}:${privateVisible}`} className="town-stage" count={game.seats.length}>{layout=><><SeatRing fluid diameter={layout.diameter} privateMarks={marks} onPrivateMark={openClue} seats={game.seats} nightDeathSeats={publicNightDeathSeats(game)} threatenedSeats={threatened} nominatorSeat={publicDay?game.nomination?.nominatorSeat:undefined} executionCandidate={publicDay&&!game.executionTied?game.onBlock:undefined} {...(selecting?{selectedSeats:selected,selectableSeats:view.action!.legalSeats}:{})} ownSeat={view.participant.seat} {...(game.nomination?.currentVoterSeat?{activeSeat:game.nomination.currentVoterSeat}:{})} {...(game.nomination?.countedVotes?{countedVotes:game.nomination.countedVotes}:{})} {...(game.nomination?.raisedSeats?{raisedSeats:game.nomination.raisedSeats}:{})} onSelect={(seat,anchor)=>{if(!privateVisible)return;const r=anchor?.getBoundingClientRect();setAction(undefined);setError('');setPicked({seat,x:r?r.left+r.width/2:window.innerWidth/2,y:r?r.top+r.height/2:window.innerHeight/2,context});}}/>
    <div className="town-center" aria-label="城镇中央">{center??<FeedbackButton className="town-center-block" type="button" onClick={()=>setGallowsOpen(true)}><span className="town-center-gallows" aria-hidden="true">{!game.executionTied&&game.onBlock&&centerSeat===game.onBlock.seat?<svg viewBox="0 0 100 85" fill="none"><path d="M8 80h80M25 80V7h53M25 29 47 7M78 7v24"/><ellipse cx="78" cy="40" rx="9" ry="12"/></svg>:null}{centerPlayer?<Avatar id={String(centerPlayer.seat)} name={centerPlayer.nickname} url={centerPlayer.avatar}/>:null}</span><strong>{game.nomination?names(game.nomination.nomineeSeat):game.executionTied?'最高票持平':game.onBlock?`${names(game.onBlock.seat)}`:'暂无处决候选'}</strong><small>{game.nomination?`${game.nomination.votesRaised} 票赞同`:game.onBlock?`${game.onBlock.votes} 票 · 查看提名`:'查看今日提名'}</small></FeedbackButton>}</div></>}</RoundTable>
    {publicDay&&relations.length?<section className="town-relations" aria-label="全桌私聊关系">{relations.map(r=>{const mine=r.fromSeat===view.participant.seat||r.toSeat===view.participant.seat;const label=<><span>{names(r.fromSeat)}</span><b aria-hidden="true">{r.status==='ACTIVE'?'↔':'→'}</b><span>{names(r.toSeat)}</span><small>{r.status==='ACTIVE'?'私聊中':'邀请中'}</small></>;return mine&&onOpenSocial?<FeedbackButton type="button" key={`${r.fromSeat}:${r.toSeat}`} onClick={onOpenSocial}>{label}<span className="sr-only">，查看我的私聊</span></FeedbackButton>:<div key={`${r.fromSeat}:${r.toSeat}`}>{label}</div>;})}</section>:null}
    {publicDay&&!ownRelation&&mineBusy&&onOpenSocial?<FeedbackButton type="button" className="town-chat-recover" onClick={onOpenSocial}>查看我的私聊状态</FeedbackButton>:null}
    {publicDay&&hasDrafts&&!mineBusy&&onOpenSocial?<FeedbackButton type="button" className="town-chat-recover" onClick={onOpenSocial}>查看未发送草稿</FeedbackButton>:null}
    {privateVisible&&gallowsOpen?<RoomSheet title="今日提名与处决" onClose={()=>setGallowsOpen(false)}><Gallows game={game} room={view.room}/><p>同票暂不处决，可继续提名。新候选须超过当天最高票；每人每天仅能提名一次、被提名一次。</p></RoomSheet>:null}
    {privateVisible&&clueOpen?<RoomSheet privateFeedback title="我的圆桌线索" onClose={()=>setClueOpen(false)}>{view.startInfo?<section className="town-known-team"><h3>首夜得知</h3>{view.startInfo.team.map(p=><div key={p.seat}><Avatar id={String(p.seat)} name={p.nickname} url={p.avatar}/><span>{playerLabel(p.seat,p.nickname)} · {p.kind==='DEMON'?'恶魔':'爪牙'}</span></div>)}{view.startInfo.bluffs.length?<p>未在场角色：{view.startInfo.bluffs.map(p=>p.name).join('、')}</p>:null}</section>:null}
    {master?<section className="town-known-team"><h3>本轮主人</h3><div><Avatar id={master.id??String(master.seat)} name={master.nickname} url={master.avatar}/><span>{names(master.seat)}</span></div><p>主人举手，或本轮已被计入赞成票时，你才可以投赞成票。仍可自行放下手。</p></section>:null}
    {clue?<section className="town-private-clue" aria-label="我的圆桌线索"><header><span>仅我可见 · {clue.phase==='FIRST_NIGHT'?'首夜':`第${Math.max(2,clue.day+1)}夜`}</span><span><FeedbackButton type="button" aria-label="上一条线索" disabled={clues.indexOf(clue)===0} onClick={()=>{setSpyOpen(false);setClueSeq(clues[clues.indexOf(clue)-1]!.seq);}}>‹</FeedbackButton><small>{clues.indexOf(clue)+1}/{clues.length}</small><FeedbackButton type="button" aria-label="下一条线索" disabled={clues.indexOf(clue)===clues.length-1} onClick={()=>{setSpyOpen(false);setClueSeq(clues[clues.indexOf(clue)+1]!.seq);}}>›</FeedbackButton></span></header>{clue.grimoire?<FeedbackButton type="button" className="town-spy-entry" onClick={()=>{setSpySeq(clue.seq);setClueOpen(false);setSpyOpen(true);}}>查看魔典</FeedbackButton>:<p>{formatPlayerText(clue.text)}</p>}{clue.targetSeats?.length?<div className="town-clue-targets">{clue.targetSeats.map(seat=>{const target=game.seats.find(p=>p.seat===seat);return target?<span key={seat}><Avatar id={target.id??String(seat)} name={target.nickname} url={target.avatar}/>{names(seat)}</span>:null;})}</div>:null}</section>:null}
    </RoomSheet>:null}
    <p className="town-instruction">{selecting?'点击头像选择目标，选好后在下方确认':'点击头像，查看玩家与操作'}</p>
    {player&&picked&&!action?<PlayerWheel player={player} x={picked.x} y={picked.y} busy={busy||sending} own={own} night={night||game.phase==='ROLE_REVEAL'} nightLabel={selected.includes(player.seat)?'取消选择':nightLabel} canSelectNight={selecting&&!!onSelectNight&&view.action!.legalSeats.includes(player.seat)} canNominate={!!nomination} canShoot={!!shot} canWhisper={!!whisper||canOpenChat} chatLabel={canOpenChat?'查看私聊':'私聊'} onDetail={()=>setAction('DETAIL')} onNight={()=>{if(selecting&&!busy&&view.action!.legalSeats.includes(player.seat)){onSelectNight?.(player.seat);setPicked(undefined);}}} onNominate={()=>setAction('NOMINATE')} onShoot={()=>setAction('SHOOT')} onWhisper={()=>{if(canOpenChat){setPicked(undefined);onOpenSocial?.();}else void invite();}} onClose={()=>setPicked(undefined)} error={error}/>:null}
    {player&&action?<RoomSheet title={action==='DETAIL'?playerLabel(player.seat,player.nickname):action==='NOMINATE'?'确认提名':'确认公开开枪'} confirmation={action!=='DETAIL'} onClose={()=>setAction(undefined)} actions={action==='DETAIL'?undefined:<><Button disabled={busy||(action==='NOMINATE'?!nomination:!shot)} onClick={()=>action==='NOMINATE'?onNominate(player.seat):onShoot(player.seat)}>{action==='NOMINATE'?'确认提名':'确认公开开枪'}</Button><FeedbackButton type="button" disabled={busy} onClick={()=>setAction(undefined)}>取消</FeedbackButton>{commandError||error?<p role="alert">{commandError||error}</p>:null}</>}><div className="seat-detail"><Avatar id={player.id??String(player.seat)} name={player.nickname} url={player.avatar}/><h3>{playerLabel(player.seat,player.nickname)}</h3><p>{player.alive?'存活':'已死亡'} · {player.connected?'在线':'暂时离线'}</p></div>{action==='DETAIL'?<PlayerDetailFacts view={view} seat={player.seat} now={now}/>:null}{action==='DETAIL'&&own&&code?<Button variant="quiet" onClick={()=>{setAction(undefined);setPicked(undefined);setEditing(true);}}>修改我的资料</Button>:null}<p>{action==='NOMINATE'?'提名将公开，撤销仍消耗今日次数。':action==='SHOOT'?'这是公开的猎魔人宣称，所有玩家会看到结果。':player.alive?'可以参与讨论、提名与投票。':player.ghostVoteAvailable?'仍可讨论，保留一枚幽灵票。':'仍可讨论，幽灵票已使用。'}</p></RoomSheet>:null}
    {privateVisible&&editing&&code?<RoomSheet title="修改我的资料" onClose={()=>setEditing(false)}><RoomProfileEditor code={code} onSaved={()=>{setEditing(false);void onRefresh?.();}}/></RoomSheet>:null}
    </>}
  </section>;
}

interface WheelProps {
  player:NonNullable<PrivateView['game']>['seats'][number];x:number;y:number;busy:boolean;own:boolean;night:boolean;nightLabel:string;canSelectNight:boolean;
  canNominate:boolean;canShoot:boolean;canWhisper:boolean;chatLabel:string;
  onDetail:()=>void;onNight:()=>void;onNominate:()=>void;onShoot:()=>void;onWhisper:()=>void;onClose:()=>void;error:string;
}
function PlayerWheel({player,x,y,busy,own,night,nightLabel,canSelectNight,canNominate,canShoot,canWhisper,chatLabel,onDetail,onNight,onNominate,onShoot,onWhisper,onClose,error}:WheelProps){
  const ref=useRef<HTMLDivElement>(null);useBackLayer(true,onClose);
  useEffect(()=>{const previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;(ref.current?.querySelector<HTMLButtonElement>('.player-wheel__item:not(:disabled)')??ref.current?.querySelector<HTMLButtonElement>('.player-wheel__close'))?.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  const v=window.visualViewport,width=v?.width??window.innerWidth,height=v?.height??window.innerHeight,top=v?.offsetTop??0,size=Math.min(284,width-24,height-24),half=size/2;
  const style={left:Math.max(half+12,Math.min(width-half-12,x)),top:Math.max(top+half+12,Math.min(top+height-half-12,y)),width:size,height:size} as CSSProperties;
  return createPortal(<div data-private-feedback={night?'true':undefined} className={`player-wheel-backdrop${night?" player-wheel-backdrop--night":""}`} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`player-wheel${night?" player-wheel--night":""}`} ref={ref} role="dialog" aria-modal="true" aria-label={`${playerLabel(player.seat,player.nickname)} 操作`} style={style} onKeyDown={e=>{if(e.key!=='Tab')return;const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}><div className="player-wheel__center"><Avatar id={player.id??String(player.seat)} name={player.nickname} url={player.avatar}/><strong>{playerLabel(player.seat,player.nickname)}</strong><FeedbackButton type="button" className="player-wheel__close" onClick={onClose} aria-label="关闭玩家操作">×</FeedbackButton></div><FeedbackButton className="player-wheel__item is-top" type="button" disabled={busy} onClick={onDetail}><span aria-hidden="true">ⓘ</span>详情</FeedbackButton>{night?<FeedbackButton className="player-wheel__item is-bottom" type="button" disabled={busy||!canSelectNight} onClick={onNight}><span aria-hidden="true">☾</span>{nightLabel}</FeedbackButton>:<><FeedbackButton className="player-wheel__item is-right" type="button" disabled={busy||!canNominate} onClick={onNominate}><span aria-hidden="true">⚑</span>提名</FeedbackButton><FeedbackButton className="player-wheel__item is-bottom" type="button" disabled={busy||!canShoot} onClick={onShoot}><span aria-hidden="true">⌖</span>开枪</FeedbackButton><FeedbackButton className="player-wheel__item is-left" type="button" disabled={busy||!canWhisper} onClick={onWhisper}><span aria-hidden="true">✉</span>{chatLabel}</FeedbackButton></>}{error?<p className="player-wheel__error" role="alert">{error}</p>:null}</div></div>,document.body);
}

function PlayerDetailFacts({view,seat,now}:{view:PrivateView;seat:number;now:number}){
 const game=view.game!,facts=publicPlayerDetail(game,seat,now),clues=knownPlayerClues(view,seat),active=game.phase==='VOTING'&&game.nomination?.nomineeSeat===seat?game.nomination:undefined;
 return <><section className="town-player-public-facts" aria-label="玩家公开状态"><h3>公开状态</h3>{facts.deathReason?<p>死亡原因：{facts.deathReason}</p>:null}<p>{facts.ghost}</p><p>今日提名得票：{facts.votes.length?facts.votes.map(v=>`${v.votes}票`).join('、'):'暂无已公布结果'}</p>{active?<p>本轮表决进行中：{active.votesRaised}票赞成</p>:null}<p>当前全桌最高票：{facts.highest}票{game.executionTied?'（最高票持平）':''}</p></section><section data-private-feedback="true" className="town-player-known-clues" aria-label="我已获知的相关线索"><h3>我已获知 · 仅我可见</h3>{clues.length?<ol>{clues.map(c=><li key={c.key}><small>{c.when}</small><p>{formatPlayerText(c.text)}</p></li>)}</ol>:<p>尚无涉及该玩家的结构化线索。</p>}</section></>;
}
