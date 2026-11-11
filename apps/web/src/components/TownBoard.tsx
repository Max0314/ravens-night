import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {SeatRing,Button} from '@ravens/ui';
import {inviteWhisper,type PrivateView} from '../api.js';
import {useBackLayer} from '../use-back-layer.js';
import {Gallows} from './Gallows.js';
import {Avatar} from './Avatar.js';
import {RoomSheet} from './RoomPage.js';
import {RoomProfileEditor} from './RoomProfileEditor.js';
import {SpyTownBoard} from './SpyTownBoard.js';

interface TownBoardProps {
  view:PrivateView;code?:string|undefined;busy:boolean;error?:string|undefined;
  privateVisible?:boolean;selected?:number[];onSelectNight?:(seat:number)=>void;
  onOpenSocial?:()=>void;hasDrafts?:boolean;
  onNominate:(seat:number)=>void;onShoot:(seat:number)=>void;onRefresh?:()=>void|Promise<void>;
}
export function TownBoard({view,code,busy,onNominate,onShoot,onRefresh,error:commandError,privateVisible=true,selected=[],onSelectNight,onOpenSocial,hasDrafts=false}:TownBoardProps){
  const game=view.game!,night=['FIRST_NIGHT','OTHER_NIGHT'].includes(game.phase);
  const selecting=night&&(view.action?.kind==='SELECT_ONE'||view.action?.kind==='SELECT_TWO');
  const context=JSON.stringify([view.roomInstanceId,game.gameId,game.contextId,view.contextId,game.phase,game.nomination?.ballotId,view.action?.kind,view.action?.legalSeats]);
  const [picked,setPicked]=useState<{seat:number;x:number;y:number;context:string}>(),[action,setAction]=useState<'DETAIL'|'NOMINATE'|'SHOOT'>(),[editing,setEditing]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(''),[clueSeq,setClueSeq]=useState<number>(),[spyOpen,setSpyOpen]=useState(false),[spySeq,setSpySeq]=useState<number>();
  const player=privateVisible&&picked?.context===context?game.seats.find(p=>p.seat===picked.seat):undefined;
  useEffect(()=>{setPicked(undefined);setAction(undefined);setEditing(false);setError('');},[context,privateVisible]);
  useEffect(()=>{setSpyOpen(false);setSpySeq(undefined);},[game.gameId,view.participant.id,privateVisible]);
  const clues=view.history.filter(e=>e.kind==='INFORMATION'),clue=clues.find(e=>e.seq===clueSeq)??clues.at(-1);
  const marks=Object.fromEntries((clue?.targetSeats??[]).map(s=>[s,'线索']));
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
  const threatened=publicDay?[...(game.nomination?[game.nomination.nomineeSeat]:[]),...(!game.executionTied&&game.onBlock?[game.onBlock.seat]:[])]:[];
  const names=(seat:number)=>`${seat}号 ${game.seats.find(p=>p.seat===seat)?.nickname??'玩家'}`;
  const hasGrimoire=clues.some(entry=>entry.grimoire);
  return <section className="remote-town-board" aria-label={spyOpen?'我的魔典':'公开城镇'}><header><span>城镇</span><small>{spyOpen?'当夜快照':`${game.aliveCount} 人存活`}</small></header>
    {hasGrimoire?<nav className="town-view-switch" aria-label="城镇视图"><button type="button" aria-pressed={!spyOpen} onClick={()=>{setPicked(undefined);setSpyOpen(false);}}>公开城镇</button><button type="button" aria-pressed={spyOpen} onClick={()=>{setPicked(undefined);setSpySeq(undefined);setSpyOpen(true);}}>我的魔典</button></nav>:null}
    {privateVisible&&spyOpen?<SpyTownBoard key={spySeq??"latest"} {...(spySeq===undefined?{}:{initialSeq:spySeq})} entries={view.history} onReturn={()=>setSpyOpen(false)}/>:<>

    <SeatRing privateMarks={marks} seats={game.seats} threatenedSeats={threatened} {...(selecting?{selectedSeats:selected,selectableSeats:view.action!.legalSeats}:{})} ownSeat={view.participant.seat} {...(game.nomination?.currentVoterSeat?{activeSeat:game.nomination.currentVoterSeat}:{})} {...(game.nomination?.countedVotes?{countedVotes:game.nomination.countedVotes}:{})} {...(game.nomination?.raisedSeats?{raisedSeats:game.nomination.raisedSeats}:{})} onSelect={(seat,anchor)=>{if(!privateVisible)return;const r=anchor?.getBoundingClientRect();setAction(undefined);setError('');setPicked({seat,x:r?r.left+r.width/2:window.innerWidth/2,y:r?r.top+r.height/2:window.innerHeight/2,context});}}/>
    {publicDay&&relations.length?<section className="town-relations" aria-label="全桌私聊关系">{relations.map(r=>{const mine=r.fromSeat===view.participant.seat||r.toSeat===view.participant.seat;const label=<><span>{names(r.fromSeat)}</span><b aria-hidden="true">{r.status==='ACTIVE'?'↔':'→'}</b><span>{names(r.toSeat)}</span><small>{r.status==='ACTIVE'?'私聊中':'邀请中'}</small></>;return mine&&onOpenSocial?<button type="button" key={`${r.fromSeat}:${r.toSeat}`} onClick={onOpenSocial}>{label}<span className="sr-only">，查看我的私聊</span></button>:<div key={`${r.fromSeat}:${r.toSeat}`}>{label}</div>;})}</section>:null}
    {publicDay&&!ownRelation&&mineBusy&&onOpenSocial?<button type="button" className="town-chat-recover" onClick={onOpenSocial}>查看我的私聊状态</button>:null}
    {publicDay&&hasDrafts&&!mineBusy&&onOpenSocial?<button type="button" className="town-chat-recover" onClick={onOpenSocial}>查看未发送草稿</button>:null}
    <Gallows game={game} room={view.room}/>
    {clue?<section className="town-private-clue" aria-label="我的圆桌线索"><header><span>仅我可见 · {clue.phase==='FIRST_NIGHT'?'首夜':`第${Math.max(2,clue.day+1)}夜`}</span><span><button type="button" aria-label="上一条线索" disabled={clues.indexOf(clue)===0} onClick={()=>{setSpyOpen(false);setClueSeq(clues[clues.indexOf(clue)-1]!.seq);}}>‹</button><small>{clues.indexOf(clue)+1}/{clues.length}</small><button type="button" aria-label="下一条线索" disabled={clues.indexOf(clue)===clues.length-1} onClick={()=>{setSpyOpen(false);setClueSeq(clues[clues.indexOf(clue)+1]!.seq);}}>›</button></span></header>{clue.grimoire?<button type="button" className="town-spy-entry" onClick={()=>{setSpySeq(clue.seq);setSpyOpen(true);}}>查看魔典</button>:<p>{clue.text}</p>}{clue.targetSeats?.length?<div className="town-clue-targets">{clue.targetSeats.map(seat=>{const target=game.seats.find(p=>p.seat===seat);return target?<span key={seat}><Avatar id={target.id??String(seat)} name={target.nickname} url={target.avatar}/>{seat}号</span>:null;})}</div>:null}</section>:null}
    <p className="town-instruction">{selecting?'点击头像选择目标，选好后在下方确认':'点击头像，查看玩家与操作'}</p>
    {player&&picked&&!action?<PlayerWheel player={player} x={picked.x} y={picked.y} busy={busy||sending} own={own} night={night||game.phase==='ROLE_REVEAL'} nightLabel={selected.includes(player.seat)?'取消选择':nightLabel} canSelectNight={selecting&&!!onSelectNight&&view.action!.legalSeats.includes(player.seat)} canNominate={!!nomination} canShoot={!!shot} canWhisper={!!whisper||canOpenChat} chatLabel={canOpenChat?'查看私聊':'私聊'} onDetail={()=>{if(own&&code){setPicked(undefined);setEditing(true);}else setAction('DETAIL');}} onNight={()=>{if(selecting&&!busy&&view.action!.legalSeats.includes(player.seat)){onSelectNight?.(player.seat);setPicked(undefined);}}} onNominate={()=>setAction('NOMINATE')} onShoot={()=>setAction('SHOOT')} onWhisper={()=>{if(canOpenChat){setPicked(undefined);onOpenSocial?.();}else void invite();}} onClose={()=>setPicked(undefined)} error={error}/>:null}
    {player&&action?<RoomSheet title={action==='DETAIL'?`${player.seat}号 ${player.nickname}`:action==='NOMINATE'?'确认提名':'确认公开开枪'} confirmation={action!=='DETAIL'} onClose={()=>setAction(undefined)} actions={action==='DETAIL'?undefined:<><Button disabled={busy||(action==='NOMINATE'?!nomination:!shot)} onClick={()=>action==='NOMINATE'?onNominate(player.seat):onShoot(player.seat)}>{action==='NOMINATE'?`确认提名 ${player.seat}号`:'确认公开开枪'}</Button><button type="button" disabled={busy} onClick={()=>setAction(undefined)}>取消</button>{commandError||error?<p role="alert">{commandError||error}</p>:null}</>}><div className="seat-detail"><Avatar id={player.id??String(player.seat)} name={player.nickname} url={player.avatar}/><h3>{player.seat}号 · {player.nickname}</h3><p>{player.alive?'存活':'已死亡'} · {player.connected?'在线':'暂时离线'}</p></div><p>{action==='NOMINATE'?'提名将公开，撤销仍消耗今日次数。':action==='SHOOT'?'这是公开的猎魔人宣称，所有玩家会看到结果。':player.alive?'可以参与讨论、提名与投票。':player.ghostVoteAvailable?'仍可讨论，保留一枚幽灵票。':'仍可讨论，幽灵票已使用。'}</p></RoomSheet>:null}
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
  useEffect(()=>{const previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  const v=window.visualViewport,width=v?.width??window.innerWidth,height=v?.height??window.innerHeight,top=v?.offsetTop??0,size=Math.min(284,width-24,height-24),half=size/2;
  const style={left:Math.max(half+12,Math.min(width-half-12,x)),top:Math.max(top+half+12,Math.min(top+height-half-12,y)),width:size,height:size} as CSSProperties;
  return createPortal(<div className={`player-wheel-backdrop${night?" player-wheel-backdrop--night":""}`} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`player-wheel${night?" player-wheel--night":""}`} ref={ref} role="dialog" aria-modal="true" aria-label={`${player.seat}号 ${player.nickname} 操作`} style={style} onKeyDown={e=>{if(e.key!=='Tab')return;const buttons=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}><div className="player-wheel__center"><Avatar id={player.id??String(player.seat)} name={player.nickname} url={player.avatar}/><strong>{player.seat}号 · {player.nickname}</strong><button type="button" onClick={onClose} aria-label="关闭玩家操作">×</button></div><button className="player-wheel__item is-top" type="button" disabled={busy} onClick={onDetail}><span aria-hidden="true">{own?'✎':'ⓘ'}</span>{own?'修改资料':'详情'}</button>{night?<button className="player-wheel__item is-bottom" type="button" disabled={busy||!canSelectNight} onClick={onNight}><span aria-hidden="true">☾</span>{nightLabel}</button>:<><button className="player-wheel__item is-right" type="button" disabled={busy||!canNominate} onClick={onNominate}><span aria-hidden="true">⚑</span>提名</button><button className="player-wheel__item is-bottom" type="button" disabled={busy||!canShoot} onClick={onShoot}><span aria-hidden="true">⌖</span>开枪</button><button className="player-wheel__item is-left" type="button" disabled={busy||!canWhisper} onClick={onWhisper}><span aria-hidden="true">✉</span>{chatLabel}</button></>}{error?<p className="player-wheel__error" role="alert">{error}</p>:null}</div></div>,document.body);
}
