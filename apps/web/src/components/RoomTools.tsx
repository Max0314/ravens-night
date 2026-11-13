import {useInteractionFeedback} from '../interaction-feedback.js';
import {ParticipationAudioChoice} from './ParticipationAudioChoice.js';
import {AudioSettings} from './AudioSettings.js';
import {playerLabel} from '@ravens/ui';
import {RoomSheet} from './RoomPage.js';
import {BotControls} from './BotControls.js';
import {BotRehearsalCommands,type BotCommandReceipt} from './BotRehearsalCommands.js';
import {useGameClock} from '../use-game-clock.js';
import {InviteTools} from './InviteTools.js';
import {ResultBoard} from './ResultBoard.js';
import type {GuideMode} from './GuideOverlay.js';
import {useEffect,useState} from 'react';
import {cancelTutorialRoom,claimRoomHost,createRecoveryCode,hasPendingCommand,leaveRoom,removeRoomPlayer,reopenRoom,retryPendingCommand,type PrivateView,type RoomView} from '../api.js';
import './room-tools-refine.css';

/** Navigation preserves the seat; leaving is an explicit room command. */
export function RoomTools({room,participantId,view,onChanged,onLeft,onGuide,onHome}:{room:RoomView;participantId:string;view?:PrivateView;onChanged:()=>Promise<void>;onLeft?:()=>void;onGuide?:(mode:GuideMode)=>void;onHome?:()=>void}){
 const feedback=useInteractionFeedback();
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false),[testsOpen,setTestsOpen]=useState(false);
 const[recovery,setRecovery]=useState<{recoveryCode:string;expiresAt:number}>(),[confirmation,setConfirmation]=useState<{text:string;run:()=>Promise<unknown>}>();
 const[botReceipt,setBotReceipt]=useState<BotCommandReceipt>();
 const host=room.organizerId===participantId,now=useGameClock(room.game,room),locked=(room.game?.presentationUntil??0)>now;
 useEffect(()=>{const show=()=>{setOpen(true);setTestsOpen(true);},town=()=>{setOpen(false);setTestsOpen(false);setConfirmation(undefined);setRecovery(undefined);};window.addEventListener('ravens:bot-controls',show);window.addEventListener('ravens:return-town',town);return()=>{window.removeEventListener('ravens:bot-controls',show);window.removeEventListener('ravens:return-town',town);};},[]);
 useEffect(()=>{const hide=()=>{if(document.hidden){setRecovery(undefined);setConfirmation(undefined);}};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide);},[]);
 useEffect(()=>{setConfirmation(undefined);setRecovery(undefined);},[room.setupId,participantId]);
 async function run(action:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{const result=await action();setConfirmation(undefined);if(result&&typeof result==='object'&&'controlResult'in result){const v=result as PrivateView;if(v.controlResult?.message)setBotReceipt({...(v.game?.gameId?{gameId:v.game.gameId}:{}),result:v.controlResult});}if(result&&typeof result==='object'&&'left'in result&&result.left===true){setOpen(false);onLeft?.();return;}await onChanged();feedback.success();}catch(e){feedback.error();setError(e instanceof Error?e.message:'操作失败');await onChanged().catch(()=>undefined);}finally{setBusy(false);}}
 const close=()=>{feedback.close();setOpen(false);setRecovery(undefined);setConfirmation(undefined);};
 return <><button className="room-tools-trigger" type="button" aria-label="房间菜单" onClick={()=>{feedback.open();setOpen(true);}}><span aria-hidden="true" className="menu-dots">•••</span><span className="sr-only">更多</span>{room.timeline?.mode==='MANUAL'?<small>演练计时已冻结</small>:room.botControl?.requestedMode==='PAUSED'?<small>人机暂停，计时继续</small>:room.botControl?.effectiveMode==='SUSPENDED'?<small>人机已悬置</small>:null}</button>{open?<RoomSheet title={`房间 ${room.code}`} onClose={close} actions={<div className="room-tools-navigation">{onHome?<button type="button" aria-label="返回首页" disabled={busy} onClick={()=>{close();onHome();}}><span>返回首页</span><small>保留房间座位</small></button>:null}<button type="button" className="room-tools-leave" disabled={busy} onClick={()=>setConfirmation({text:'确认离开房间？离开后需重新加入或恢复座位。',run:()=>leaveRoom(room.code)})}>离开房间</button></div>}><section className="room-tools-body room-tools-refined" aria-label="房间操作">
  <section className="room-menu-section" aria-label="常用设置"><h3>常用设置</h3>{room.game?<button type="button" onClick={()=>{close();window.dispatchEvent(new Event('ravens:cover-private'));}}>遮住私密内容</button>:null}<AudioSettings/><ParticipationAudioChoice/>{onGuide?<div className="room-guide-shortcuts">{(['roles','tutorial',...(view?.role?['mine']:[])] as GuideMode[]).map(mode=><button type="button" key={mode} onClick={()=>{close();onGuide(mode);}}>{mode==='mine'?'我的角色':mode==='roles'?'角色表':'规则帮助'}</button>)}</div>:null}<a className="room-menu-credit" href="/audio/music/v2/credits.html" target="_blank" rel="noopener noreferrer">音乐来源与许可</a></section>
  <section className="room-menu-section" aria-label="邀请与连接"><h3>邀请与连接</h3><InviteTools code={room.code} voiceRoomUrl={room.voiceRoomUrl}/><button type="button" disabled={busy} onClick={()=>void run(async()=>setRecovery(await createRecoveryCode(room.code)))}>{recovery&&recovery.expiresAt<=Date.now()?'重新生成恢复码':'换设备恢复码'}</button>{recovery?<div className="room-tools__recovery"><code>{recovery.recoveryCode}</code><small>10分钟内在新设备使用，请私下保存。</small></div>:null}</section>
  {host?<details className="room-menu-group room-menu-section" open={testsOpen} onToggle={e=>setTestsOpen(e.currentTarget.open)}><summary>人机与测试<span>{room.botCount??0}席</span></summary><BotControls room={room} view={view} busy={busy} run={run}/>{view?<BotRehearsalCommands room={room} view={view} busy={busy} run={run} error={error} receipt={botReceipt}/>:null}</details>:null}
  <section className="room-menu-section room-menu-management" aria-label="房间管理"><h3>房间管理</h3>{room.state==='LOBBY'?<details><summary>上局战报</summary><ResultBoard code={room.code}/></details>:null}
   {!host&&room.organizerId&&(room.hostClaimAt??Infinity)<=(room.serverNow??Date.now())?<button type="button" disabled={busy} onClick={()=>setConfirmation({text:'房主已离线5分钟，接任后可以管理本房间。',run:()=>claimRoomHost(room.code,room.organizerId!)})}>接任房主</button>:null}
   {host&&room.state==='TUTORIAL'?<button type="button" disabled={busy} onClick={()=>setConfirmation({text:'取消本次教学，所有人返回大厅并重新准备。',run:()=>cancelTutorialRoom(room.code)})}>取消教学</button>:null}
   {host&&room.state==='RUNNING'?<button type="button" disabled={busy||locked||view?.canAbort===false} onClick={()=>setConfirmation({text:'本局不判胜负，所有人返回大厅并重新准备。',run:()=>reopenRoom(room.code)})}>重开本局</button>:null}
   {host&&['GAME_OVER','ABORTED'].includes(room.state)?<button type="button" disabled={busy||locked||view?.canRestart===false} onClick={()=>void run(()=>reopenRoom(room.code))}>{room.state==='GAME_OVER'?'下一把':'返回大厅'}</button>:null}
   {host&&['LOBBY','TUTORIAL'].includes(room.state)?<details><summary>移除玩家</summary><div className="room-menu-player-list">{room.participants.filter(p=>p.mode==='PLAYER'&&p.id!==participantId).map(p=><button type="button" key={p.id} disabled={busy} onClick={()=>setConfirmation({text:`移除 ${p.seat===undefined?p.nickname:playerLabel(p.seat,p.nickname)}？${room.state==='TUTORIAL'?'本次教学同时取消，':''}所有人需重新准备。`,run:()=>removeRoomPlayer(room.code,p.id,room.state==='TUTORIAL')})}>{p.seat===undefined?p.nickname:playerLabel(p.seat,p.nickname)}</button>)}</div></details>:null}
   {hasPendingCommand(room.code)?<button type="button" disabled={busy} onClick={()=>void run(()=>retryPendingCommand(room.code))}>重试待确认操作</button>:null}
  </section>
  {error?<p className="room-menu-error" role="alert">{error}</p>:null}
  {confirmation?<RoomSheet title="确认房间操作" confirmation onClose={()=>{if(!busy)setConfirmation(undefined);}} actions={<><button type="button" disabled={busy} onClick={()=>void run(confirmation.run)}>确认</button><button type="button" disabled={busy} onClick={()=>setConfirmation(undefined)}>取消</button></>}><p>{confirmation.text}</p>{error?<p role="alert" className="room-menu-error">{error}</p>:null}</RoomSheet>:null}
 </section></RoomSheet>:null}</>;
}
