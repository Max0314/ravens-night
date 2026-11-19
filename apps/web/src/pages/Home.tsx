import {FeedbackButton} from '@ravens/ui';
import {leaveRoomCopy} from '../leave-room-copy.js';
import { Button } from '@ravens/ui';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import '../styles/home-effects-entry.css';
import type { RoomView } from '../api.js';
import { FilingLinks } from '../components/FilingLinks.js';
import { AccountPanel } from '../components/AccountPanel.js';
import { HomePortrait } from '../components/HomePortrait.js';
import {RoomSheet} from '../components/RoomPage.js';

interface HomeProps {
  onCreate:()=>void;onJoin:()=>void;onTutorial:()=>void;onRoles:()=>void;
  activeRoom?:RoomView;activeMode?:'PLAYER'|'DISPLAY';onResume?:()=>void;onLeave?:()=>void;busy?:boolean;error?:string;guestCode?:string;
  onAccountResume?:(code:string,id:string,mode:'PLAYER'|'DISPLAY')=>void;accountTools?:ReactNode;audioControl?:ReactNode;
  debugMode?:boolean;onToggleDebug?:()=>void;accessBusy?:boolean;accessFailed?:boolean;
}
export function Home({onCreate,onJoin,onTutorial,onRoles,activeRoom,activeMode,onResume,onLeave,busy=false,error,onAccountResume,accountTools,audioControl,guestCode,debugMode,onToggleDebug,accessBusy,accessFailed}:HomeProps){
  const titleTaps=useRef({count:0,at:0});
  const leaveCopy=activeRoom?leaveRoomCopy(activeRoom,activeMode):undefined;
  const [leaveTarget,setLeaveTarget]=useState<string>(),leaveConfirmed=useRef(false);
  const roomKey=activeRoom?[activeRoom.roomInstanceId??activeRoom.code,activeRoom.code,activeRoom.state,activeMode??'PLAYER'].join(':'):undefined;
  const leaveOpen=!!roomKey&&leaveTarget===roomKey&&!!onLeave;
  useEffect(()=>{setLeaveTarget(undefined);leaveConfirmed.current=false;},[roomKey]);
  function tapTitle(){
    const now=performance.now(),tap=titleTaps.current;
    tap.count=now-tap.at<=520?tap.count+1:1;
    tap.at=now;
    if(tap.count===3){tap.count=0;onToggleDebug?.();}
  }
  return <main className="home home--compact">
    <header className="home-header"><div className="home-brand"><h1><button type="button" className="home-title-preview" title="快速三击切换调试模式" onClick={tapTitle}>
      <span className="home-title-preview__moon" aria-hidden="true">☾</span><span>血染钟楼<small aria-hidden="true">{debugMode?'调试模式':'BLOOD ON THE CLOCKTOWER'}</small></span>
    </button></h1></div><div className="home-header-tools">{audioControl}<AccountPanel disabled={accessBusy===true} onResume={onAccountResume??(()=>undefined)} {...(guestCode?{guestCode}:{})} {...(accountTools?{tools:accountTools}:{})}/></div></header>
    <HomePortrait/>
    <section className="home-controls" aria-label="游戏入口">
      {activeRoom&&onLeave?<FeedbackButton className="home-leave-room" type="button" disabled={busy} onClick={()=>{if(!busy){leaveConfirmed.current=false;setLeaveTarget(roomKey);}}}>离开房间</FeedbackButton>:null}
      <nav className="home-entry-grid" aria-label="首页操作">
        <Button onClick={activeRoom&&onResume?onResume:onJoin} disabled={busy}>{activeRoom?'继续当前房间':'加入房间'}</Button>
        <FeedbackButton className="home-guide-entry" type="button" disabled={accessBusy} onClick={onTutorial}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z"/></svg><span>查看教程</span></FeedbackButton>
        <Button data-opening-entry variant="quiet" onClick={onCreate} disabled={busy||accessBusy||Boolean(activeRoom)}>{accessBusy?'正在确认…':accessFailed?'重试开房':debugMode?'创建调试房':'创建房间'}</Button>
        <FeedbackButton className="home-guide-entry" type="button" disabled={accessBusy} onClick={onRoles}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/></svg><span>查看角色表</span></FeedbackButton>
      </nav>
      {error?<p className="home-error" role="alert">{error}</p>:null}
    </section>
    <FilingLinks/>
    {leaveOpen&&leaveCopy?<RoomSheet title={leaveCopy.blocked?'离开房间':'确认离开房间'} confirmation onClose={()=>{if(!busy)setLeaveTarget(undefined);}} actions={<>
      {!leaveCopy.blocked?<Button disabled={busy} onClick={()=>{if(busy||leaveConfirmed.current||leaveTarget!==roomKey)return;leaveConfirmed.current=true;setLeaveTarget(undefined);onLeave?.();}}>确认离开</Button>:null}
      <FeedbackButton type="button" disabled={busy} onClick={()=>setLeaveTarget(undefined)}>{leaveCopy.blocked?'知道了':'取消'}</FeedbackButton></>}><p>{leaveCopy.message}</p>{error?<p role="alert">{error}</p>:null}</RoomSheet>:null}
  </main>;
}
