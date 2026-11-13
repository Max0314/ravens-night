import {FeedbackButton} from '@ravens/ui';
import {playerLabel,formatPlayerText} from '@ravens/ui';
import {useRef,useState} from 'react';
import {SeatAvatarDecoration,layoutSeatMarkers} from '@ravens/ui';
import type {PrivateHistoryEntry} from '../api.js';
import {RoundTable} from './RoundTable.js';
import {Avatar} from './Avatar.js';
import '../styles/spy-town.css';
import './town-markers.css';

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
  const markerCache=useRef<{key:string;positions:ReturnType<typeof layoutSeatMarkers>}|undefined>(undefined);
  const snapshots=entries.filter((entry):entry is SnapshotEntry=>!!entry.grimoire);
  const [seq,setSeq]=useState<number|undefined>(initialSeq??snapshots.at(-1)?.seq),[selection,setSelection]=useState<{seq:number;seat:number}>();
  const entry=snapshots.find(item=>item.seq===seq)??snapshots.at(-1);
  if(!entry)return <section className="spy-town"><p>尚未收到魔典快照。</p><FeedbackButton type="button" onClick={onReturn}>返回公开城镇</FeedbackButton></section>;
  const index=snapshots.indexOf(entry),players=entry.grimoire.entries;
  const picked=selection?.seq===entry.seq?players.find(player=>player.seat===selection.seat):undefined;
  const move=(offset:number)=>{const next=snapshots[index+offset];if(next){setSeq(next.seq);setSelection(undefined);}};

  return <section className="spy-town" aria-label="我的魔典圆桌">
    <header className="spy-town__heading"><FeedbackButton type="button" aria-label="上一夜魔典" disabled={index===0} onClick={()=>move(-1)}>‹</FeedbackButton><div><strong>{nightName(entry)} · 魔典</strong><small>仅你可见 · 当夜快照{index===snapshots.length-1?' · 最新':''}</small></div><FeedbackButton type="button" aria-label="下一夜魔典" disabled={index===snapshots.length-1} onClick={()=>move(1)}>›</FeedbackButton></header>
    <RoundTable stable key={entry.seq} count={players.length} className="spy-town__table">{layout=>{const marks=Object.fromEntries(players.map(p=>[p.seat,p.reminders.filter(t=>t!=='存活'&&t!=='死亡').map(t=>marker(t).label).join(' ')])),key=JSON.stringify([layout.diameter,entry.seq,marks]);if(markerCache.current?.key!==key)markerCache.current={key,positions:layoutSeatMarkers(layout,players,marks,true)};const positions=markerCache.current.positions;return <>
      <div className={`spy-town__center${picked?" has-player":""}`} aria-live="polite">{picked?<><span className="spy-town__detail-seat">{playerLabel(picked.seat,picked.nickname)}</span><strong>{picked.roleName}</strong><small className="spy-town__life">{picked.alive?'当夜存活':'当夜已死亡'}</small><ul aria-label={`${picked.seat}号魔典标记`}>{picked.reminders.filter(text=>text!=='存活'&&text!=='死亡').map((text,i)=><li key={i} data-marker={marker(text).kind}>{formatPlayerText(text)}</li>)}</ul></>:<><span className="spy-town__book" aria-hidden="true">☾</span><strong>当夜所见</strong><p>点头像查看角色与标记</p></>}</div>
      <ol className="spy-town__ring">{players.map((player,i)=>{
        const point=layout.points[i]!,mark=positions.find(m=>m.seat===player.seat),reminders=player.reminders.filter(text=>text!=='存活'&&text!=='死亡');
        return <li key={player.seat} style={{left:point.x,top:point.y}}>
          <FeedbackButton type="button" className={`spy-town__player${picked?.seat===player.seat?' is-selected':''}${player.alive?'':' is-dead'}`} aria-pressed={picked?.seat===player.seat} aria-label={`${playerLabel(player.seat,player.nickname)}，魔典所示${player.roleName}，${player.alive?'存活':'已死亡'}${reminders.length?'，'+formatPlayerText(reminders.join('、')):''}`} onClick={()=>setSelection({seq:entry.seq,seat:player.seat})}>
            <span className="spy-town__portrait-anchor"><span className="spy-town__portrait"><Avatar id={`spy-${entry.seq}-${player.seat}`} name={player.nickname} url={player.avatar}/>{!player.alive?<SeatAvatarDecoration state="DEAD"/>:null}</span><span className="spy-town__number">{player.seat}</span>
            </span><span className="spy-town__nickname">{player.nickname}</span><span className="spy-town__role">{player.roleName}</span>
          </FeedbackButton>
          {mark?<FeedbackButton type="button" className="spy-town__near-mark" title={formatPlayerText(reminders.join(' · '))} aria-label={`查看${playerLabel(player.seat,player.nickname)}的当夜标记：${formatPlayerText(reminders.join('、'))}`} onClick={()=>setSelection({seq:entry.seq,seat:player.seat})} style={{left:mark.x-point.x+layout.seatSize/2,top:mark.y-point.y+layout.seatSize/2,width:mark.width,height:mark.height}}>{mark.lines.map((line,n)=><span key={n}>{line}</span>)}</FeedbackButton>:null}
        </li>;
      })}</ol>
    </>;}}</RoundTable>
    <div className="spy-town__legend" aria-label="魔典标记说明"><span data-marker="poison">毒 · 中毒</span><span data-marker="red-herring">饵 · 红鲱鱼</span><span data-marker="protected">护 · 保护</span><span data-marker="drunk">醉 · 酒鬼</span></div>
  </section>;
}
