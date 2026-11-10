import { Button } from '@ravens/ui';
import type { ReactNode } from 'react';
import type { RoomView } from '../api.js';
import { FilingLinks } from '../components/FilingLinks.js';
import { AccountPanel } from '../components/AccountPanel.js';
import { HomePortrait } from '../components/HomePortrait.js';

interface HomeProps {
  onCreate:()=>void;onJoin:()=>void;onTutorial:()=>void;onRoles:()=>void;
  activeRoom?:RoomView;activeMode?:'PLAYER'|'DISPLAY';onResume?:()=>void;onLeave?:()=>void;busy?:boolean;error?:string;guestCode?:string;
  onAccountResume?:(code:string,id:string,mode:'PLAYER'|'DISPLAY')=>void;accountTools?:ReactNode;
}
export function Home({onCreate,onJoin,onTutorial,onRoles,activeRoom,activeMode,onResume,onLeave,busy=false,error,onAccountResume,accountTools}:HomeProps){
  const canLeave=activeRoom?.state==='LOBBY'||activeRoom?.state==='GAME_OVER'||activeRoom?.state==='ABORTED'||activeMode==='DISPLAY';
  return <main className="home home--compact">
    <header className="home-header"><div className="home-brand"><span aria-hidden="true">☾</span><div><h1>鸦钟夜话</h1><small>RAVENS AT MIDNIGHT</small></div></div><AccountPanel onResume={onAccountResume??(()=>undefined)} {...(accountTools?{tools:accountTools}:{})}/></header>
    <HomePortrait/>
    <section className="home-controls" aria-label="游戏入口">
      {activeRoom?<div className="home-current-room"><span>房间 {activeRoom.code} · {activeMode==='DISPLAY'?'大屏':'席位已保留'}</span>{canLeave&&onLeave?<button type="button" disabled={busy} onClick={onLeave}>离开房间</button>:null}</div>:null}
      <nav className="home-entry-grid" aria-label="首页操作">
        <Button onClick={activeRoom&&onResume?onResume:onJoin} disabled={busy}>{activeRoom?'继续当前房间':'加入房间'}</Button>
        <Button variant="quiet" onClick={onTutorial}>查看教程</Button>
        <Button variant="quiet" onClick={onCreate} disabled={busy||Boolean(activeRoom)}>创建房间</Button>
        <Button variant="quiet" onClick={onRoles}>查看角色表</Button>
      </nav>
      {error?<p className="home-error" role="alert">{error}</p>:null}
    </section>
    <FilingLinks/>
  </main>;
}
