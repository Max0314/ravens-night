import {memo} from 'react';
import {playerLabel} from '@ravens/ui';
import type {GameView} from '../api.js';
import {Avatar} from './Avatar.js';
import {Claw} from './effects-art.js';
import './dawn-reveal.css';

/** Mounted only after the public result gate. Stable portraits do not repaint per animation frame. */
export const DawnReveal=memo(function DawnReveal({players,seats}:{players:GameView['seats'];seats:readonly number[]}){
 return <div className={`dawn-memorial dawn-reveal${seats.length>1?' dawn-reveal--multiple':''}`}>
  {seats.length?<div className="dawn-reveal__people">{seats.map(seat=>{const player=players.find(p=>p.seat===seat),name=player?.nickname??`${seat}号玩家`;return <div className="scene-person dawn-reveal__person" key={seat}>
   <div className="dawn-reveal__portrait"><Avatar id={player?.id??String(seat)} name={name} url={player?.avatar} loading="eager"/><span className="dawn-reveal__seat">{seat}</span><Claw/></div>
   <strong>{playerLabel(seat,player?.nickname)}</strong><small>夜间死亡</small>
  </div>;})}</div>:<div className="dawn-reveal__safe"><span className="dawn-reveal__window" aria-hidden="true"><svg viewBox="0 0 80 100" fill="none"><path d="M14 86V36a26 26 0 0 1 52 0v50H14ZM40 11v74M15 48h50M8 91h64"/><path d="M23 38a17 17 0 0 1 10-16M49 74h8"/></svg></span><strong>无人离席</strong><small>继续白天讨论</small></div>}
 </div>;
});
