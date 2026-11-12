import {FeedbackButton} from '@ravens/ui';
import { useEffect, useRef, type ReactNode } from "react";
import { useBackLayer } from "../use-back-layer.js";
import { Avatar } from "./Avatar.js";

// Portal placement does not express which sheet the user opened most recently.
const sheetStack:HTMLElement[]=[];

export function RoomPageShell({ title, onBack, subtitle, children, actions, className="",hideBack=false }: {hideBack?:boolean;title:string;onBack:()=>void;subtitle?:ReactNode;children:ReactNode;actions?:ReactNode;className?:string}) {
  return <main className={`room-page ${className}`}><header className="room-page__header">{hideBack?null:<FeedbackButton type="button" onClick={onBack} aria-label="返回首页">←</FeedbackButton>}<div><h1>{title}</h1>{subtitle ? <small>{subtitle}</small> : null}</div></header><div className="room-page__content">{children}</div>{actions ? <RoomActionBar>{actions}</RoomActionBar> : null}</main>;
}
export function RoomActionBar({children}:{children:ReactNode}){return <footer className="room-action-bar">{children}</footer>;}
export function OperationStatus({busy,error,notice}:{busy?:boolean;error?:string|undefined;notice?:string|undefined}) {return <>{busy?<p className="operation-status" role="status">正在提交…</p>:null}{error?<p className="form-error" role="alert">{error}</p>:notice?<p className="operation-status" role="status">{notice}</p>:null}</>;}
export function PlayerTile({player,selected,disabled,onClick,detail}:{player:{id?:string;seat?:number;nickname:string;avatar?:string|undefined;controller?:"HUMAN"|"BOT";alive?:boolean};selected?:boolean;disabled?:boolean;onClick:()=>void;detail?:ReactNode}){return <FeedbackButton type="button" className={`player-tile${selected?" is-selected":""}`} disabled={disabled} aria-pressed={selected} onClick={onClick}><span className="player-tile__seat">{player.seat}号{player.controller==="BOT"?<small>人机</small>:null}</span><Avatar id={player.id??String(player.seat)} name={player.nickname} url={player.avatar}/><strong>{player.nickname}</strong><small>{detail??(player.alive===false?"已死亡":null)}</small></FeedbackButton>;}

/** Fixed close/actions; only its body scrolls. A nested confirmation is the only extra layer. */
export function RoomSheet({title,onClose,children,actions,confirmation=false,privateFeedback=false}:{title:string;onClose:()=>void;children:ReactNode;actions?:ReactNode;confirmation?:boolean;privateFeedback?:boolean}){
  const ref=useRef<HTMLElement>(null); const close=useRef(onClose);close.current=onClose;
  useBackLayer(true,()=>close.current());
  useEffect(()=>{
    const node=ref.current;if(node)sheetStack.push(node);
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;node?.focus({preventScroll:true});
    const tabbable=(element:HTMLElement)=>{
      if(element.tabIndex<0&&!(element.tagName==='SUMMARY'&&!element.hasAttribute('tabindex'))||element.matches(':disabled,[type="hidden"]'))return false;
      for(let parent:HTMLElement|null=element;parent;parent=parent.parentElement){
        if(parent.hidden||parent.inert||parent.getAttribute('aria-hidden')==='true')return false;
        const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden')return false;
        if(parent instanceof HTMLDetailsElement&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(element))return false;
      }
      return true;
    };
    const trap=(event:KeyboardEvent)=>{
      const active=document.activeElement;
      if(event.key!=='Tab'||!node||sheetStack.at(-1)!==node||!node.contains(active)&&!(active instanceof Element&&active.closest('.private-action-notice,.nomination-notice')))return;
      const buttons=[...node.querySelectorAll<HTMLElement>('button,input,textarea,select,summary,a[href],[tabindex="0"]')].filter(element=>element.closest('.room-sheet')===node&&tabbable(element));
      if(!confirmation)buttons.push(...[...document.querySelectorAll<HTMLElement>('.private-action-notice button,.nomination-notice button')].filter(tabbable));
      event.preventDefault();if(!buttons.length)return;
      const index=buttons.indexOf(active as HTMLElement),next=event.shiftKey?(index<=0?buttons.length-1:index-1):(index<0||index===buttons.length-1?0:index+1);
      buttons[next]?.focus();
    };
    document.addEventListener('keydown',trap);
    return()=>{if(node){const index=sheetStack.indexOf(node);if(index>=0)sheetStack.splice(index,1);}document.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div data-private-feedback={privateFeedback?'true':undefined} className={`room-sheet-backdrop${confirmation?" room-sheet-backdrop--confirm":""}`} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="room-sheet" ref={ref} tabIndex={-1} role={confirmation?"alertdialog":"dialog"} aria-modal="true" aria-label={title}><header><h2>{title}</h2><FeedbackButton type="button" onClick={onClose} aria-label={`关闭${title}`}>×</FeedbackButton></header><div className="room-sheet__body">{children}</div>{actions?<RoomActionBar>{actions}</RoomActionBar>:null}</section></div>;
}
