import {useState,type CSSProperties} from 'react';
import {SeatAvatarDecoration} from '@ravens/ui';
import type {PrivateHistoryEntry} from '../api.js';
import {Avatar} from './Avatar.js';
import '../styles/spy-town.css';

type SnapshotEntry=PrivateHistoryEntry & {grimoire:NonNullable<PrivateHistoryEntry['grimoire']>};
function nightName(entry:PrivateHistoryEntry){return entry.phase==='FIRST_NIGHT'?'首夜':`第 ${Math.max(2,entry.day+1)} 夜`;}
function marker(text:string){
  if(text==='中毒')return {kind:'poison',label:'毒'};
  if(text==='红鲱鱼')return {kind:'red-herring',label:'饵'};
  if(text==='僧侣保护')return {kind:'protected',label:'护'};
  if(text.startsWith('酒鬼自认'))return {kind:'drunk',label:'醉'};
  if(text==='管家主人')return {kind:'master',label:'主'};
  if(text.includes('线索'))return {kind:'clue',label:'线'};
  return {kind:'spent',label:'用'};
}

/** No current room/seat data enters this view: every name, portrait and mark is the received snapshot. */
export function SpyTownBoard({entries,onReturn,initialSeq}:{entries:PrivateHistoryEntry[];onReturn:()=>void;initialSeq?:number}){
  const snapshots=entries.filter((entry):entry is SnapshotEntry=>!!entry.grimoire);
  const [seq,setSeq]=useState<number|undefined>(initialSeq),[selection,setSelection]=useState<{seq:number;seat:number}>();
  const entry=snapshots.find(item=>item.seq===seq)??snapshots.at(-1);
  if(!entry)return <section className="spy-town"><p>尚未收到魔典快照。</p><button type="button" onClick={onReturn}>返回公开城镇</button></section>;
  const index=snapshots.indexOf(entry),players=entry.grimoire.entries;
  const picked=selection?.seq===entry.seq?players.find(player=>player.seat===selection.seat):undefined;
  const move=(offset:number)=>{const next=snapshots[index+offset];if(next){setSeq(next.seq);setSelection(undefined);}};
  return <section className="spy-town" aria-label="我的魔典圆桌">
    <header className="spy-town__heading"><button type="button" aria-label="上一夜魔典" disabled={index===0} onClick={()=>move(-1)}>‹</button><div><strong>{nightName(entry)} · 魔典</strong><small>仅你可见 · 当夜快照{index===snapshots.length-1?' · 最新':''}</small></div><button type="button" aria-label="下一夜魔典" disabled={index===snapshots.length-1} onClick={()=>move(1)}>›</button></header>
    <div className="spy-town__table">
      <div className={`spy-town__center${picked?" has-player":""}`} aria-live="polite">{picked?<><span className="spy-town__detail-seat">{picked.seat}号 · {picked.nickname}</span><strong>{picked.roleName}</strong><small className="spy-town__life">{picked.alive?'当夜存活':'当夜已死亡'}</small><ul aria-label={`${picked.seat}号魔典标记`}>{picked.reminders.filter(text=>text!=='存活'&&text!=='死亡').map((text,i)=><li key={i} data-marker={marker(text).kind}>{text}</li>)}</ul></>:<><span className="spy-town__book" aria-hidden="true">☾</span><strong>当夜所见</strong><p>点头像查看角色与标记</p></>}</div>
      <ol className="spy-town__ring">{players.map((player,i)=>{
        const angle=2*Math.PI*i/players.length,reminders=player.reminders.filter(text=>text!=='存活'&&text!=='死亡');
        return <li key={player.seat} style={{'--spy-x':Math.sin(angle),'--spy-y':-Math.cos(angle)} as CSSProperties}>
          <button type="button" className={`spy-town__player${picked?.seat===player.seat?' is-selected':''}${player.alive?'':' is-dead'}`} aria-pressed={picked?.seat===player.seat} aria-label={`${player.seat}号 ${player.nickname}，魔典所示${player.roleName}，${player.alive?'存活':'已死亡'}${reminders.length?'，'+reminders.join('、'):''}`} onClick={()=>setSelection({seq:entry.seq,seat:player.seat})}>
            <span className="spy-town__portrait"><Avatar id={`spy-${entry.seq}-${player.seat}`} name={player.nickname} url={player.avatar}/>{!player.alive?<SeatAvatarDecoration state="DEAD"/>:null}<span className="spy-town__number">{player.seat}</span>
              <span className="spy-town__markers">{reminders.slice(0,3).map((text,n)=><small key={n} data-marker={marker(text).kind} title={text} aria-hidden="true">{marker(text).label}</small>)}{reminders.length>3?<small aria-hidden="true">+{reminders.length-3}</small>:null}</span>
            </span><span className="spy-town__role">{player.roleName}</span>
          </button>
        </li>;
      })}</ol>
    </div>
    <div className="spy-town__legend" aria-label="魔典标记说明"><span data-marker="poison">毒 · 中毒</span><span data-marker="red-herring">饵 · 红鲱鱼</span><span data-marker="protected">护 · 保护</span><span data-marker="drunk">醉 · 酒鬼</span></div>
  </section>;
}
