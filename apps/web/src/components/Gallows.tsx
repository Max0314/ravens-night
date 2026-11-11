import {playerLabel} from '@ravens/ui';
import {useLayoutEffect,useRef} from 'react';
import type {GameView,RoomView} from '../api.js';
import {useGameClock} from '../use-game-clock.js';
import {Avatar} from './Avatar.js';
import {SeatAvatarDecoration} from '@ravens/ui';

/** Public nomination and execution-candidate board; nomination never implies death. */
export function Gallows({game,room}:{game:GameView;room?:RoomView|undefined}){
  const now=useGameClock(game,room),ballot=game.phase==='VOTING'?game.nomination:undefined;
  const block=game.executionTied?undefined:game.onBlock;
  const nomineeSeat=ballot?.nomineeSeat??block?.seat,nominee=game.seats.find(p=>p.seat===nomineeSeat);
  const portrait=useRef<HTMLSpanElement>(null);
  const portraitKey=`${game.gameId}:${game.day}:${nomineeSeat}:${ballot?.ballotId??'candidate'}`;
  useLayoutEffect(()=>{
    const element=portrait.current;
    if(!element||typeof element.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const source=element.closest('.remote-town-board')?.querySelector<HTMLElement>(`[data-seat-number='${nomineeSeat}'] .rn-seat__avatar`);
    if(!source)return;
    const previousAnimation=element.style.animation;
    element.style.animation='none';
    const from=source.getBoundingClientRect(),to=element.getBoundingClientRect();
    if(!from.width||!from.height||!to.width||!to.height){element.style.animation=previousAnimation;return;}
    const dx=from.left+from.width/2-to.left-to.width/2,dy=from.top+from.height/2-to.top-to.height/2;
    try{
      const animation=element.animate([{transform:`translate(-50%,-15%) translate(${dx}px,${dy}px) scale(${from.width/to.width},${from.height/to.height})`,opacity:.8},{transform:'translate(-50%,-15%) translate(0,0) scale(1)',opacity:1}],{duration:480,easing:'cubic-bezier(.22,.8,.25,1)'});
      return()=>{animation.cancel();element.style.animation=previousAnimation;};
    }catch{element.style.animation=previousAnimation;}
  },[portraitKey]);
  if(!['DAY_DISCUSSION','NOMINATION','VOTING'].includes(game.phase))return null;
  const leader=game.seats.find(p=>p.seat===block?.seat);
  const records=game.events.filter(e=>e.kind==='VOTE_RESULT'&&e.day===game.day&&(e.startsAt??0)<=now&&e.targetSeat!==undefined&&e.votes!==undefined);
  const lastCandidate=[...records].reverse().find(e=>e.targetSeat===block?.seat&&e.outcome==='ON_BLOCK');
  const threshold=ballot?.threshold??lastCandidate?.threshold??Math.ceil(game.aliveCount/2);
  const label=ballot?(now<(ballot.defenseUntil??0)?'当前提名 · 辩护中':'当前提名 · 表决中'):block?'当前处决候选':game.executionTied?'最高票持平 · 暂无处决候选':'暂无处决候选';
  const total=ballot?.voterOrder?.length??ballot?.votersRequired??game.seats.length;
  return <section className="gallows" aria-label="提名与处决席"><div className="gallows__stage"><div className="gallows__drawing" aria-hidden="true"><svg viewBox="0 0 140 120" fill="none"><path d="M12 111h110M34 111V12h64M34 39 61 12M98 12v30"/><path className="gallows__rope" d="M98 42c-10 0-10 19 0 19s10-19 0-19Z"/></svg>{nominee?<span key={portraitKey} ref={portrait} className="gallows__portrait" data-avatar-state={nominee.alive?"THREATENED":"DEAD"}><Avatar id={nominee.id??String(nominee.seat)} name={nominee.nickname} url={nominee.avatar}/><SeatAvatarDecoration state={nominee.alive?"THREATENED":"DEAD"}/></span>:null}</div><div className="gallows__content"><small>{label}</small>{nominee?<><strong>{playerLabel(nominee.seat,nominee.nickname)}</strong><p className="gallows__votes">{ballot?<><b>{ballot.votesRaised}/{total}</b> 赞同</>:<><b>{block?.votes??0}</b> 票</>}</p><span>{threshold}票达标{ballot?.currentVoterSeat?` · 正在计 ${ballot.currentVoterSeat}号`:''}</span></>:<p>头像将在提名时移入此处</p>}</div></div>
    {ballot&&leader&&block?<p className="gallows__leader">当前处决候选：{playerLabel(leader.seat,leader.nickname)}<b>{block.votes}票</b></p>:null}
    {records.length?<div className="gallows__history"><h3>今日提名</h3><ol>{records.map(e=>{const p=game.seats.find(s=>s.seat===e.targetSeat),result=e.outcome==='TIED'?'最高票持平':e.outcome==='ON_BLOCK'?'当轮成为候选':e.votes!<(e.threshold??Infinity)?'未达标':'未超过最高票';return <li key={e.id??e.seq}><Avatar id={p?.id??String(e.targetSeat)} name={p?.nickname??'玩家'} url={p?.avatar}/><span><strong>{playerLabel(e.targetSeat,p?.nickname)}</strong><small>{result}</small></span><b>{e.votes}票<small>达标{e.threshold??'—'}票</small></b></li>;})}</ol></div>:null}
  </section>;
}
