import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {PrivateView} from '../api.js';
import {useGameClock} from '../use-game-clock.js';
import {RoomSheet} from './RoomPage.js';

/** A public ballot companion while a player reads the handbook. Never reads role or butler data. */
export function NominationNotice({active,view,busy,onVote,onDetails,error}:{active:boolean;view:PrivateView;busy:boolean;onVote:(raised:boolean)=>void;onDetails:()=>void;error?:string|undefined}){
  const game=view.game,ballot=game?.nomination,ref=useRef<HTMLElement>(null);
  const now=useGameClock(game,view.room);
  const [collapsed,setCollapsed]=useState(false),[confirmation,setConfirmation]=useState<string>();
  const scope=JSON.stringify([view.roomInstanceId,game?.gameId,game?.contextId,view.contextId,ballot?.ballotId,ballot?.nominatorSeat,ballot?.nomineeSeat]);
  const visible=active&&game?.phase==='VOTING'&&!!ballot;
  useEffect(()=>{setConfirmation(undefined);setCollapsed(false);},[scope,active]);
  useEffect(()=>{
    if(!visible||!ref.current)return;
    const element=ref.current,root=document.documentElement;
    const measure=()=>{const height=element.getBoundingClientRect().height||element.offsetHeight||116,bottom=parseFloat(getComputedStyle(element).bottom)||12;root.style.setProperty('--nomination-notice-height',`${Math.ceil(height+bottom+12)}px`);};
    measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):undefined;observer?.observe(element);window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);root.style.removeProperty('--nomination-notice-height');};
  },[visible,collapsed,error]);
  if(!visible||!game||!ballot)return null;
  const ownSeat=view.participant.seat,mine=game.seats.find(p=>p.seat===ownSeat),locked=ballot.countedSeats?.includes(ownSeat)===true;
  const disabled=busy||view.canVote!==true||locked||(game.presentationUntil??0)>now;
  const nominator=game.seats.find(p=>p.seat===ballot.nominatorSeat),nominee=game.seats.find(p=>p.seat===ballot.nomineeSeat);
  const total=ballot.voterOrder?.length??ballot.votersRequired??game.seats.length;
  const status=locked?`已锁票：${ballot.countedVotes?.[ownSeat]?'赞同':'未举手'}`:view.voteRaised?'你已举手':'你未举手';
  const vote=(raised:boolean)=>{if(disabled)return;if(raised&&!mine?.alive&&!view.voteRaised)setConfirmation(scope);else{setConfirmation(undefined);onVote(raised);}};
  return createPortal(<><aside ref={ref} className={`nomination-notice${collapsed?' is-collapsed':''}`} aria-label="提名提醒">
    <div className="nomination-notice__heading"><button type="button" className="nomination-notice__subject" onClick={onDetails} aria-label={`查看提名：${ballot.nominatorSeat}号 ${nominator?.nickname??'玩家'}提名${ballot.nomineeSeat}号 ${nominee?.nickname??'玩家'}`}><strong>{ballot.nominatorSeat}号 {nominator?.nickname}</strong><span aria-hidden="true">→</span><strong>{ballot.nomineeSeat}号 {nominee?.nickname}</strong></button><button type="button" className="nomination-notice__collapse" aria-expanded={!collapsed} aria-label={collapsed?'展开提名提醒':'收起提名提醒'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'⌃':'⌄'}</button></div>
    <div className="nomination-notice__summary"><span>赞同 <b>{ballot.votesRaised}/{total}</b>{!collapsed?` · ${ballot.threshold}票达标`:''}</span><span role="status">{status}</span></div>
    {!collapsed?<><div className="nomination-notice__controls"><small>{now<(ballot.defenseUntil??0)?`辩护剩余 ${Math.max(0,Math.ceil(((ballot.defenseUntil??0)-now)/1000))}秒`:ballot.currentVoterSeat?`正在计 ${ballot.currentVoterSeat}号`:'等待计票'}</small><button type="button" aria-pressed={view.voteRaised===true} disabled={disabled} onClick={()=>vote(true)}>举手</button><button type="button" aria-pressed={view.voteRaised===false} disabled={disabled} onClick={()=>vote(false)}>放下</button></div>{error?<p className="nomination-notice__error" role="alert">{error}</p>:null}</>:null}
  </aside>{confirmation===scope&&!disabled?<div className="nomination-notice-confirmation"><RoomSheet title="使用鬼票" confirmation onClose={()=>setConfirmation(undefined)} actions={<><button type="button" onClick={()=>{if(disabled)return;setConfirmation(undefined);onVote(true);}}>确认使用鬼票</button><button type="button" onClick={()=>setConfirmation(undefined)}>取消</button></>}><p>计到本席时仍举手，将消耗唯一鬼票。</p></RoomSheet></div>:null}</>,document.body);
}
