import {simultaneousBallotStatus} from './ballot-status.js';
import {FeedbackButton} from '@ravens/ui';
import {playerLabel,formatPlayerText} from '@ravens/ui';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import type {PrivateView} from '../api.js';
import {useGameClock} from '../use-game-clock.js';
import {Avatar} from './Avatar.js';
import {RoomSheet} from './RoomPage.js';
import './nomination-notice-layout.css';

/** A public ballot companion while a player reads the handbook. Never reads role or butler data. */
export function NominationNotice({active,view,busy,onVote,onDetails,error,onShoot}:{onShoot?:(seat:number)=>void;active:boolean;view:PrivateView;busy:boolean;onVote:(raised:boolean)=>void;onDetails:()=>void;error?:string|undefined}){
  const game=view.game,ballot=game?.nomination,ref=useRef<HTMLElement>(null);
  const now=useGameClock(game,view.room);
  const [collapsed,setCollapsed]=useState(false),[confirmation,setConfirmation]=useState<string>(),[shooting,setShooting]=useState(false),[target,setTarget]=useState<number>();
  const [dock,setDock]=useState<{bottom:number;maxHeight:number}>();
  const scope=JSON.stringify([view.roomInstanceId,game?.gameId,game?.contextId,view.contextId,ballot?.ballotId,ballot?.nominatorSeat,ballot?.nomineeSeat]);
  const visible=active&&game?.phase==='VOTING'&&!!ballot;
  useEffect(()=>{setConfirmation(undefined);setCollapsed(false);setShooting(false);setTarget(undefined);},[scope,active]);
  useLayoutEffect(()=>{
    if(!visible||!ref.current)return;
    const element=ref.current,root=document.documentElement;
    function measure(){
      const host=document.querySelector<HTMLElement>('.player-private:not([hidden]) .game-page--town'),record=host?.querySelector('.game-content--record');
      const overlay=document.querySelector('.guide-backdrop,.room-sheet-backdrop,.player-wheel-backdrop');
      const protectedRects=record&&!overlay?[...host!.querySelectorAll<HTMLElement>(':scope>.game-tabs,:scope>.room-action-bar')].map(node=>{geometry?.observe(node);return node.getBoundingClientRect();}).filter(rect=>rect.width>0&&rect.height>0):[];
      const top=protectedRects.length?Math.min(...protectedRects.map(rect=>rect.top)):undefined;
      const next=top===undefined?undefined:{bottom:Math.max(12,window.innerHeight-top+8),maxHeight:Math.max(44,top-(window.visualViewport?.offsetTop??0)-16)};
      setDock(current=>current?.bottom===next?.bottom&&current?.maxHeight===next?.maxHeight?current:next);
      const height=Math.min(element.getBoundingClientRect().height||element.offsetHeight||116,next?.maxHeight??Infinity),bottom=next?.bottom??(parseFloat(getComputedStyle(element).bottom)||12);
      root.style.setProperty('--nomination-notice-height',`${Math.ceil(height+bottom+12)}px`);
      if(next)root.style.setProperty('--nomination-record-padding',`${Math.ceil(height+12)}px`);else root.style.removeProperty('--nomination-record-padding');
    }
    const geometry=typeof ResizeObserver==='function'?new ResizeObserver(measure):undefined;
    geometry?.observe(element);measure();const changes=new MutationObserver(measure);changes.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','inert']});window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
    return()=>{geometry?.disconnect();changes.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);root.style.removeProperty('--nomination-notice-height');root.style.removeProperty('--nomination-record-padding');};
  },[visible,collapsed,error]);
  if(!visible||!game||!ballot)return null;
  const simultaneous=simultaneousBallotStatus(game,view.room,now);
  const ownSeat=view.participant.seat,mine=game.seats.find(p=>p.seat===ownSeat),locked=simultaneous?simultaneous.locked:ballot.countedSeats?.includes(ownSeat)===true;
  const submitted=simultaneous?view.voteSubmitted===true:true;
  const disabled=busy||view.canVote!==true||locked||(game.presentationUntil??0)>now;
  const nominator=game.seats.find(p=>p.seat===ballot.nominatorSeat),nominee=game.seats.find(p=>p.seat===ballot.nomineeSeat);
  const canShoot=onShoot&&view.canClaimSlayer===true;
  const total=simultaneous?.total??ballot.voterOrder?.length??ballot.votersRequired??game.seats.length;
  const status=locked?simultaneous?'已截止':`已锁票：${ballot.countedVotes?.[ownSeat]?'赞同':'未举手'}`:!submitted?'尚未选择':view.voteRaised?'你已举手':simultaneous?'已选择不举手':'你未举手';
  const vote=(raised:boolean)=>{if(disabled)return;if(raised&&!mine?.alive&&!view.voteRaised)setConfirmation(scope);else{setConfirmation(undefined);onVote(raised);}};
  return createPortal(<><aside ref={ref} className={`nomination-notice${simultaneous?' nomination-notice--simultaneous':''}${collapsed?' is-collapsed':''}${dock?' nomination-notice--above-navigation':''}`} style={dock?{'--nomination-navigation-bottom':`${dock.bottom}px`,'--nomination-navigation-height':`${dock.maxHeight}px`} as CSSProperties:undefined} aria-label="提名提醒">
    <div className="nomination-notice__heading"><FeedbackButton type="button" className="nomination-notice__subject" onClick={onDetails} aria-label={`查看提名：${playerLabel(ballot.nominatorSeat,nominator?.nickname)}提名${playerLabel(ballot.nomineeSeat,nominee?.nickname)}`}><Avatar id={`nomination-${ballot.nominatorSeat}`} name={nominator?.nickname??"玩家"} url={nominator?.avatar}/><strong>{playerLabel(ballot.nominatorSeat,nominator?.nickname)}</strong><span aria-hidden="true">→</span><Avatar id={`nomination-${ballot.nomineeSeat}`} name={nominee?.nickname??"玩家"} url={nominee?.avatar}/><strong>{playerLabel(ballot.nomineeSeat,nominee?.nickname)}</strong></FeedbackButton><FeedbackButton type="button" className="nomination-notice__collapse" aria-expanded={!collapsed} aria-label={collapsed?'展开提名提醒':'收起提名提醒'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'⌃':'⌄'}</FeedbackButton></div>
    <div className="nomination-notice__summary">{simultaneous?<strong className="ballot-countdown">{simultaneous.timeLabel}</strong>:null}<span>{simultaneous?<>当前 <b>{ballot.votesRaised}</b> 票 · {ballot.threshold}票达标</>:<>赞同 <b>{ballot.votesRaised}/{total}</b>{!collapsed?` · ${ballot.threshold}票达标`:''}</>}</span><span role="status">{status}</span>{simultaneous?<span>已选择 {ballot.votesReceived}/{total} 人</span>:null}</div>
    {!collapsed?<><div className="nomination-notice__controls"><small>{simultaneous?(simultaneous.started?'截止前可改票':ballot.defenseFinished?'辩护已结束 · 等待全员选择':'20秒内辩护并选择'):now<(ballot.defenseUntil??0)?`辩护剩余 ${Math.max(0,Math.ceil(((ballot.defenseUntil??0)-now)/1000))}秒`:ballot.currentVoterSeat?`正在计 ${playerLabel(ballot.currentVoterSeat,game.seats.find(p=>p.seat===ballot.currentVoterSeat)?.nickname)}`:'等待计票'}</small><FeedbackButton type="button" aria-pressed={submitted&&view.voteRaised===true} disabled={disabled} onClick={()=>vote(true)}>举手</FeedbackButton><FeedbackButton type="button" aria-pressed={submitted&&view.voteRaised===false} disabled={disabled} onClick={()=>vote(false)}>{simultaneous?'不举手':'放下'}</FeedbackButton></div><div className="nomination-notice__actions"><FeedbackButton type="button" onClick={onDetails}>返回城镇</FeedbackButton>{canShoot?<FeedbackButton type="button" disabled={busy||(game.presentationUntil??0)>now} onClick={event=>{event.currentTarget.focus({preventScroll:true});setTarget(undefined);setShooting(true);}}>公开宣称枪击</FeedbackButton>:null}</div>{error?<p className="nomination-notice__error" role="alert">{formatPlayerText(error)}</p>:null}</>:null}
  </aside>{confirmation===scope&&!disabled?<div className="nomination-notice-confirmation"><RoomSheet title="使用鬼票" confirmation onClose={()=>setConfirmation(undefined)} actions={<><FeedbackButton type="button" onClick={()=>{if(disabled)return;setConfirmation(undefined);onVote(true);}}>确认使用鬼票</FeedbackButton><FeedbackButton type="button" onClick={()=>setConfirmation(undefined)}>取消</FeedbackButton></>}><p>{simultaneous?'统一截止时仍举手，将消耗唯一鬼票。':'计到本席时仍举手，将消耗唯一鬼票。'}</p></RoomSheet></div>:null}{shooting?<div className="nomination-notice-shot"><RoomSheet title="公开宣称枪击" confirmation onClose={()=>setShooting(false)} actions={<><FeedbackButton type="button" disabled={busy||!canShoot||target===undefined||(game.presentationUntil??0)>now} onClick={()=>{if(target===undefined||!canShoot||busy)return;setShooting(false);onShoot?.(target);}}>确认向所选玩家开枪</FeedbackButton><FeedbackButton type="button" onClick={()=>setShooting(false)}>取消</FeedbackButton></>}><p>公开选择目标并宣称使用猎魔人能力。结果由规则判定。</p><div className="nomination-shot-targets">{game.seats.filter(p=>(view.dayAbilityTargets??game.seats.map(s=>s.seat)).includes(p.seat)).map(p=><FeedbackButton type="button" key={p.seat} aria-pressed={target===p.seat} onClick={()=>setTarget(p.seat)}><Avatar id={`shot-${p.seat}`} name={p.nickname} url={p.avatar}/><span>{playerLabel(p.seat,p.nickname)}</span></FeedbackButton>)}</div>{error?<p role="alert">{formatPlayerText(error)}</p>:null}</RoomSheet></div>:null}</>,document.body);
}
