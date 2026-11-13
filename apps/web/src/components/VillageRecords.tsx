import {playerLabel,formatPlayerText} from '@ravens/ui';
import type { GameView } from "../api.js";
import { Avatar } from "./Avatar.js";

type PublicEvent=GameView['events'][number];
const labels:Record<string,string>={NOTICE:'村庄消息',NIGHT_FALLS:'入夜',SHOT:'公开枪击',NOMINATION:'提名',VOTE_RESULT:'表决结果',EXECUTION:'处决',DAWN:'黎明',GAME_OVER:'终局'};
function groupLabel(event:PublicEvent){
  if(event.kind==='GAME_OVER')return '终局';
  if(event.kind==='NIGHT_FALLS')return event.day===0?'首夜':event.day===undefined?'夜晚':`第 ${event.day+1} 夜`;
  return event.day===undefined?'此前记录':event.day===0?'开局':`第 ${event.day} 天`;
}
function eventPlayers(event:PublicEvent){
  const players:Array<{seat:number;label:string}>=[];
  if(event.actorSeat!==undefined)players.push({seat:event.actorSeat,label:event.kind==='SHOT'?'开枪':event.kind==='NOMINATION'?'提名人':'行动人'});
  if(event.targetSeat!==undefined)players.push({seat:event.targetSeat,label:event.kind==='NOMINATION'||event.kind==='VOTE_RESULT'?'被提名':event.kind==='EXECUTION'?'处决对象':'目标'});
  if(event.kind==='DAWN')for(const seat of event.seats??[])if(!players.some(p=>p.seat===seat))players.push({seat,label:'当夜死亡'});
  return players;
}

/** Render only structured, public event subjects; text-only history never gains inferred targets. */
export function VillageRecords({events,seats=[]}:{events:GameView['events'];seats?:GameView['seats']}){
  const groups=new Map<string,PublicEvent[]>();
  for(const event of [...events].sort((a,b)=>b.seq-a.seq)){const label=groupLabel(event);const entries=groups.get(label)??[];entries.push(event);groups.set(label,entries);}
  const latest=[...groups.values()][0]?.[0];
  return <details className="village-records"><summary><strong>村庄记录</strong><span>{events.length}</span>{latest?<small>最新：{formatPlayerText(latest.message)}</small>:null}</summary>
    <div className="village-records__timeline">{groups.size?[...groups].map(([label,entries])=><section className="village-records__group" key={label}><h3>{label}</h3><ol>{entries.map(event=><li className={`village-records__entry village-records__entry--${(event.kind??'NOTICE').toLowerCase()}`} key={event.id??event.seq}>
      <header><span>{labels[event.kind??'NOTICE']??'村庄消息'}</span>{event.votes===undefined?null:<small>{event.votes}票{event.threshold===undefined?'':` · ${event.threshold}票达标`}</small>}</header>
      {eventPlayers(event).length?<div className="village-records__players" aria-label="相关玩家">{eventPlayers(event).map(({seat,label},index)=>{const player=seats.find(p=>p.seat===seat);return <span className="village-records__player" key={`${seat}:${index}`}><Avatar id={player?.id??`seat-${seat}`} name={player?.nickname??'玩家'} url={player?.avatar}/><span><small>{label}</small><strong>{playerLabel(seat,player?.nickname)}</strong></span></span>;})}</div>:null}
      <p>{formatPlayerText(event.message)}</p>
    </li>)}</ol></section>):<p className="village-records__empty">尚无村庄记录</p>}</div>
  </details>;
}
