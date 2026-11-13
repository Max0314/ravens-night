import {simultaneousBallotStatus} from './ballot-status.js';
import {FeedbackButton} from '@ravens/ui';
import {playerLabel} from '@ravens/ui';
import {Avatar} from './Avatar.js';
import {useGameClock} from "../use-game-clock.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PrivateView } from "../api.js";
import { RoomSheet } from "./RoomPage.js";
/** Only public state is rendered here, including while the private view is covered. */
export function PublicBallot({ view, busy, onVote, onDetails }: { view: PrivateView; busy: boolean; onVote: (raised: boolean) => void; onDetails: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const game = view.game, ballot = game?.nomination;
  const now=useGameClock(game,view.room);
  useEffect(() => setConfirm(false), [view.roomInstanceId, game?.gameId, ballot?.ballotId, view.contextId]);
  if (!game || game.phase !== "VOTING" || !ballot) return null;
  const mine = game.seats.find(p=>p.seat===view.participant.seat);
  const simultaneous=simultaneousBallotStatus(game,view.room,now);
  const locked = simultaneous?simultaneous.locked:ballot.countedSeats?.includes(view.participant.seat);
  const submitted=simultaneous?view.voteSubmitted===true:true;
  const disabled = busy || locked === true || (game.presentationUntil??0)>now || !(simultaneous?view.canVote===true:view.canVote ?? Boolean(mine?.alive || mine?.ghostVoteAvailable));
  const nominator=game.seats.find(p=>p.seat===ballot.nominatorSeat),nominee=game.seats.find(p=>p.seat===ballot.nomineeSeat);
  return <section className={`public-ballot${simultaneous?' public-ballot--simultaneous':''}`} aria-label="公开表决">
    <FeedbackButton type="button" className="public-ballot__target" onClick={onDetails}>
      <span className="ballot-player"><Avatar id={String(ballot.nominatorSeat)} name={nominator?.nickname??'玩家'} url={nominator?.avatar}/><span><small>提名人</small><strong>{playerLabel(ballot.nominatorSeat,nominator?.nickname)}</strong></span></span>
      <span className="ballot-arrow" aria-hidden="true">→</span>
      <span className="ballot-player"><Avatar id={String(ballot.nomineeSeat)} name={nominee?.nickname??'玩家'} url={nominee?.avatar}/><span><small>被提名</small><strong>{playerLabel(ballot.nomineeSeat,nominee?.nickname)}</strong></span></span>
    </FeedbackButton>
    <div className="public-ballot__progress"><span className={simultaneous?'ballot-countdown':undefined}>{simultaneous?simultaneous.timeLabel:now<(ballot.defenseUntil??0)?`辩护 ${Math.max(0,Math.ceil(((ballot.defenseUntil??0)-now)/1000))}秒`:ballot.currentVoterSeat?`正在计 ${playerLabel(ballot.currentVoterSeat,game.seats.find(p=>p.seat===ballot.currentVoterSeat)?.nickname)}`:'等待计票'}</span><span>{simultaneous?`当前 ${ballot.votesRaised} 票 · ${ballot.threshold} 票达标`:`${ballot.votesRaised} / ${ballot.threshold} 票达标`}</span>{simultaneous?<span>已选择 {ballot.votesReceived}/{simultaneous.total} 人</span>:null}</div>
    <div className="public-ballot__controls"><span role="status">{busy?'正在同步':locked?simultaneous?'已截止':`已锁票：${ballot.countedVotes?.[view.participant.seat]?'赞成':'未举手'}`:!submitted?'尚未选择':view.voteRaised?'已举手':simultaneous?'已选择不举手':'未举手'}</span><FeedbackButton type="button" aria-pressed={submitted&&view.voteRaised===true} disabled={disabled} onClick={()=>{if(!mine?.alive&&!view.voteRaised)setConfirm(true);else onVote(true);}}><span aria-hidden="true">✋ </span>举手</FeedbackButton><FeedbackButton type="button" aria-pressed={submitted&&view.voteRaised===false} disabled={disabled} onClick={()=>{setConfirm(false);onVote(false);}}>{simultaneous?'不举手':'放下'}</FeedbackButton></div>
    {confirm&&!disabled?createPortal(<RoomSheet title="使用鬼票" confirmation onClose={()=>setConfirm(false)} actions={<><FeedbackButton type="button" disabled={disabled} onClick={()=>{setConfirm(false);onVote(true);}}>确认使用鬼票</FeedbackButton><FeedbackButton type="button" onClick={()=>setConfirm(false)}>取消</FeedbackButton></>}><p>{simultaneous?'统一截止时仍举手，将消耗唯一鬼票。':'计到本席时仍举手，将消耗唯一鬼票。'}</p></RoomSheet>,document.body):null}
  </section>;
}
