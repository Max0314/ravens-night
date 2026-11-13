import {TestRolePicker} from '../components/TestRolePicker.js';
import {RoomProfileEditor} from '../components/RoomProfileEditor.js';
import {SeatOrderGrid} from '../components/SeatOrderGrid.js';
import {RoomSheet} from "../components/RoomPage.js";
import { useBackLayer } from "../use-back-layer.js";
import { Button } from "@ravens/ui";
import { useEffect, useState } from "react";
import type { RoomView,PrivateView } from "../api.js";
import { Avatar } from "../components/Avatar.js";
import '../styles/six-player-rules.css';

export function Lobby({ rehearsal,rolePending=false,onRetryRole,onChooseRole,onSetCooperation,room, onBegin, onLeave, onTutorial, onRoles, canBegin, busy, error, participantId, onReady, onReorder, onRetryReorder, onRemove }: { rehearsal?:PrivateView["rehearsal"];rolePending?:boolean;onRetryRole?:(()=>Promise<void>)|undefined;onChooseRole?:(roleId:string|null)=>Promise<void>;onSetCooperation?:(enabled:boolean)=>void;room: RoomView; onBegin: (tutorialMode?: "SKIP" | "OPTIONAL") => void; onLeave: () => void; onTutorial: () => void; onRoles: () => void; canBegin: boolean; busy: boolean; error?: string; participantId?: string; onReady?: (ready: boolean) => void; onRemove?: (id:string)=>void; onRetryReorder?:()=>Promise<RoomView>; onReorder?: (ids: string[]) => void|RoomView|Promise<void|RoomView> }) {
  const players = room.participants.filter(p => p.mode === "PLAYER").sort((a,b) => (a.seat ?? 0)-(b.seat ?? 0));
  const ids = players.map(p => p.id);
  const[selected,setSelected]=useState<string>(),[confirmRemove,setConfirmRemove]=useState(false),[tutorial,setTutorial]=useState(false),[notice,setNotice]=useState(''),[sorting,setSorting]=useState(false),[editing,setEditing]=useState(false);
  useEffect(()=>{setSelected(undefined);setConfirmRemove(false);setEditing(false);},[room.roomInstanceId]);
  const mine = players.find(p => p.id === participantId);
  const current = players.find(p => p.id === selected);
  const offline = players.filter(p => p.controller!=="BOT" && !p.connected);
  const missing=room.playerCount-players.length;
  const reason=missing>0?`还缺 ${missing} 席，可用人机补位`:offline.length?"有真人离线，等待重新连接":players.some(p=>p.id!==participantId&&!p.ready)?"等待其他玩家准备":"";
  const canStart = !busy && !sorting && players.length === room.playerCount && players.every(p => p.connected && (p.id === participantId || p.ready));
  return <main className="compact-lobby">
    <header><button type="button" onClick={onLeave} disabled={busy}>离开房间</button><h1>{room.code}</h1><span>{players.length}/{room.playerCount} 人</span></header>
    <div className="lobby-content"><p className="lobby-readiness">{room.activeHumanCount??players.filter(p=>p.controller!=="BOT").length} 真人 · {room.botCount??0} 人机 · {players.filter(p => p.ready).length}/{room.playerCount} 已准备</p>
    {room.playerCount===6?(canBegin&&room.state==='LOBBY'&&onSetCooperation?<label className="six-player-rule"><input type="checkbox" aria-label="6人局邪恶协作" checked={room.sixPlayerEvilCooperation===true} disabled={busy||sorting||rolePending} onChange={event=>onSetCooperation(event.target.checked)}/><span><strong>6人局邪恶协作 <small>自定义增强</small></strong><small>首夜相认 · 3个伪装 · 夜杀不变</small></span></label>:<p className="six-player-rule six-player-rule--readonly" role="status">{room.sixPlayerEvilCooperation?'自定义增强 · 6人局邪恶协作':'6人局 · 标准规则'}</p>):null}
    {onChooseRole?<TestRolePicker key={`${room.roomInstanceId}:${room.setupId}:${participantId}`} rehearsal={rehearsal} busy={busy} pending={rolePending} onRetry={onRetryRole} onChoose={onChooseRole}/>:null}
    <SeatOrderGrid items={players} total={room.playerCount} setupId={room.setupId} instanceId={room.roomInstanceId} enabled={canBegin} busy={busy} onCommit={onReorder} onRetry={onRetryReorder} onInteraction={setSorting} renderCard={(p,index)=><button className="seat-card" type="button" onClick={()=>setSelected(p.id)} aria-label={`${index+1}号 ${p.nickname} ${p.ready?'已准备':'未准备'}`}><span className="seat-number">{index+1}</span><span className={`seat-avatar${p.ready?' is-ready':''}`} onClick={e=>{if(p.id===participantId){e.stopPropagation();setEditing(true);}}}><Avatar id={p.id} name={p.nickname} url={p.avatar}/><span className="seat-ready-mark" aria-label={p.ready?'已准备':'未准备'}>{p.ready?'✓':'○'}</span></span><strong>{p.nickname}</strong></button>} renderEmpty={index=><button type="button" disabled={!canBegin||busy} onClick={()=>window.dispatchEvent(new Event('ravens:bot-controls'))}><span>{index+1}</span><small>{canBegin?'＋ 补人机':'等待加入'}</small></button>}/>
    {current ? <RoomSheet title={`${current.seat}号 ${current.nickname}`} onClose={()=>{setSelected(undefined);setConfirmRemove(false);}}><div className="seat-detail"><Avatar id={current.id} name={current.nickname} url={current.avatar}/><p>{current.id===participantId?"本人 · ":""}{current.controller==="BOT"?"人机":current.id===room.organizerId?"房主":"玩家"}</p></div>{current.id===participantId?<button type="button" onClick={()=>{setSelected(undefined);setEditing(true);}}>修改我的资料</button>:null}{canBegin&&current.id!==participantId&&onRemove?<div className="seat-detail-actions"><button type="button" disabled={busy} onClick={()=>setConfirmRemove(true)}>移除玩家</button></div>:null}{confirmRemove?<RoomSheet title="移除玩家" confirmation onClose={()=>setConfirmRemove(false)} actions={<><Button disabled={busy} onClick={()=>{onRemove?.(current.id);setConfirmRemove(false);setSelected(undefined);}}>确认移除</Button><button type="button" onClick={()=>setConfirmRemove(false)}>取消</button></>}><p>移除 {current.nickname}，所有人需要重新准备。</p></RoomSheet>:null}</RoomSheet> : null}
    {editing?<RoomSheet title="修改我的资料" onClose={()=>setEditing(false)}><RoomProfileEditor code={room.code} onSaved={()=>setEditing(false)}/></RoomSheet>:null}
    <div className="lobby-help"><button type="button" onClick={onRoles}>角色表</button><button type="button" onClick={onTutorial}>规则</button>{canBegin?<button type="button" onClick={()=>window.dispatchEvent(new Event("ravens:bot-controls"))}>人机补位 / 测试</button>:null}</div>
    {canBegin ? <label className="tutorial-choice"><input type="checkbox" checked={tutorial} onChange={e=>setTutorial(e.target.checked)}/>开局前看简短教学</label> : null}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="form-error">{error}</p> : null}
    </div><footer className="lobby-primary">{canBegin&&reason?<small role="status">{reason}</small>:null}<div className="lobby-primary__actions"><div className="lobby-primary__start">{canBegin ? <Button onClick={()=>onBegin(tutorial ? "OPTIONAL" : "SKIP")} disabled={!canStart}>{busy ? "正在提交…" : mine?.ready ? "开始游戏" : "准备并开始"}</Button> : mine && onReady ? <><Button disabled={busy} onClick={()=>onReady(!mine.ready)}>{mine.ready ? "取消准备" : "我已准备"}</Button><small>等待房主开始</small></> : null}</div></div></footer>
  </main>;
}
