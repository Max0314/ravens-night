import {FeedbackButton} from '@ravens/ui';
import { Button } from '@ravens/ui';
import {useRef,type ReactNode} from 'react';
import '../styles/home-effects-entry.css';
import type { RoomView } from '../api.js';
import { FilingLinks } from '../components/FilingLinks.js';
import { AccountPanel } from '../components/AccountPanel.js';
import { HomePortrait } from '../components/HomePortrait.js';

interface HomeProps {
  onCreate:()=>void;onJoin:()=>void;onTutorial:()=>void;onRoles:()=>void;
  activeRoom?:RoomView;activeMode?:'PLAYER'|'DISPLAY';onResume?:()=>void;onLeave?:()=>void;busy?:boolean;error?:string;guestCode?:string;
  onAccountResume?:(code:string,id:string,mode:'PLAYER'|'DISPLAY')=>void;accountTools?:ReactNode;audioControl?:ReactNode;
}
export function Home({onCreate,onJoin,onTutorial,onRoles,activeRoom,activeMode,onResume,onLeave,busy=false,error,onAccountResume,accountTools,audioControl}:HomeProps){
  const titleTaps=useRef({count:0,at:0});
  const canLeave=activeRoom?.state==='LOBBY'||activeRoom?.state==='GAME_OVER'||activeRoom?.state==='ABORTED'||activeMode==='DISPLAY';
  return <main className="home home--compact">
    <header className="home-header"><div className="home-brand"><span aria-hidden="true">☾</span><div><h1><a className="home-title-preview" href="/?preview=effects" title="快速三击打开动效调试" onClick={event=>{const now=performance.now(),tap=titleTaps.current;tap.count=now-tap.at<=450?tap.count+1:1;tap.at=now;if(tap.count<3)event.preventDefault();else tap.count=0;}}>鸦钟夜话</a></h1><small>RAVENS AT MIDNIGHT</small></div></div><div className="home-header-tools">{audioControl}<AccountPanel onResume={onAccountResume??(()=>undefined)} {...(accountTools?{tools:accountTools}:{})}/></div></header>
    <HomePortrait/>
    <section className="home-controls" aria-label="游戏入口">
      <div className={`home-current-room${activeRoom?"":" is-empty"}`} aria-hidden={!activeRoom}>{activeRoom?<><span>房间 {activeRoom.code} · {activeMode==='DISPLAY'?'大屏':'席位已保留'}</span>{canLeave&&onLeave?<FeedbackButton type="button" disabled={busy} onClick={onLeave}>离开房间</FeedbackButton>:null}</>:null}</div>
      <nav className="home-entry-grid" aria-label="首页操作">
        <Button onClick={activeRoom&&onResume?onResume:onJoin} disabled={busy}>{activeRoom?'继续当前房间':'加入房间'}</Button>
        <FeedbackButton className="home-guide-entry" type="button" onClick={onTutorial}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z"/></svg><span>查看教程</span></FeedbackButton>
        <Button variant="quiet" onClick={onCreate} disabled={busy||Boolean(activeRoom)}>创建房间</Button>
        <FeedbackButton className="home-guide-entry" type="button" onClick={onRoles}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/></svg><span>查看角色表</span></FeedbackButton>
      </nav>
      {error?<p className="home-error" role="alert">{error}</p>:null}
    </section>
    <FilingLinks/>
  </main>;
}
