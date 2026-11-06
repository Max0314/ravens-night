import { useEffect, useState } from "react";
import type { PrivateView } from "../api.js";
import { useBackLayer } from "../use-back-layer.js";
/** Only public state is rendered here, including while the private view is covered. */
export function PublicBallot({ view, busy, onVote, onDetails }: { view: PrivateView; busy: boolean; onVote: (raised: boolean) => void; onDetails: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [expanded,setExpanded]=useState(false);
  const game = view.game, ballot = game?.nomination;
  useBackLayer(confirm,()=>setConfirm(false));
  useEffect(() => setConfirm(false), [view.roomInstanceId, game?.gameId, ballot?.ballotId, view.contextId]);
  if (!game || game.phase !== "VOTING" || !ballot) return null;
  const mine = game.seats.find(p=>p.seat===view.participant.seat);
  const locked = ballot.countedSeats?.includes(view.participant.seat);
  const disabled = busy || !(view.canVote ?? Boolean(mine?.alive || mine?.ghostVoteAvailable));
  return <section className="public-ballot" aria-label="公开表决">
    <button type="button" className="public-ballot__target" aria-expanded={expanded} onClick={()=>{setExpanded(value=>!value);onDetails();}}><strong>{ballot.nomineeSeat}号 · {game.seats.find(p=>p.seat===ballot.nomineeSeat)?.nickname}</strong><small>{(game.serverNow ?? 0)<(ballot.defenseUntil ?? 0) ? "辩护中" : `已计 ${ballot.countedSeats?.length ?? 0}/${ballot.voterOrder?.length ?? game.seats.length} 席`}</small></button>
    <span role="status">{busy ? "正在同步或提交" : locked ? `已锁票：${ballot.countedVotes?.[view.participant.seat] ? "赞成" : "未举手"}` : view.voteRaised ? "已举手" : "未举手"}</span>
    <div><button type="button" aria-pressed={view.voteRaised === true} disabled={disabled} onClick={()=>{if(!mine?.alive && !view.voteRaised)setConfirm(true);else onVote(true);}}>举手</button><button type="button" aria-pressed={view.voteRaised === false} disabled={disabled} onClick={()=>{setConfirm(false);onVote(false);}}>放下</button></div>
    {expanded ? <p className="public-ballot__details">{ballot.nominatorSeat}号提名 · 达标需 {ballot.threshold} 票 · 已计赞成 {ballot.votesRaised} 票{ballot.currentVoterSeat ? ` · 正在计 ${ballot.currentVoterSeat} 号` : ""}</p> : null}
    {confirm ? <div className="ghost-confirm" role="alertdialog" aria-label="使用鬼票"><p>计到本席时仍举手，将消耗唯一鬼票。</p><button type="button" disabled={disabled} onClick={()=>{setConfirm(false);onVote(true);}}>确认使用鬼票</button><button type="button" onClick={()=>setConfirm(false)}>取消</button></div> : null}
  </section>;
}
