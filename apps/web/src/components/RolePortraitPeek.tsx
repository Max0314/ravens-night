import {useEffect,useRef,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {useBackLayer} from '../use-back-layer.js';
import {roleArt} from '../role-art.js';
import './role-portrait-peek.css';

/** Only the owner's perceived role id enters this borderless view. */
export function RolePortraitPeek({roleId,name,onClose}:{roleId:string;name:string;onClose:()=>void}){
 const button=useRef<HTMLButtonElement>(null),art=roleArt(roleId);
 useBackLayer(true,onClose);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  button.current?.focus({preventScroll:true});
  const conceal=()=>onClose(),visibility=()=>{if(document.hidden)onClose();};
  const hasOverlay=()=>!!document.querySelector('.guide-backdrop,.room-sheet-backdrop,.player-wheel-backdrop,.private-scene-dialog,.event-stage');
  const blocked=()=>{if(hasOverlay())onClose();};
  const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab'||hasOverlay())return;const buttons=[button.current,...document.querySelectorAll<HTMLButtonElement>('.nomination-notice button,.private-action-notice button')].filter((node):node is HTMLButtonElement=>!!node&&!node.disabled&&!node.closest('[hidden],[inert]')&&getComputedStyle(node).display!=='none');if(!buttons.length)return;const index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.shiftKey?(index<=0?buttons.length-1:index-1):(index<0||index===buttons.length-1?0:index+1);event.preventDefault();buttons[next]?.focus({preventScroll:true});};
  const observer=new MutationObserver(blocked);observer.observe(document.body,{subtree:true,childList:true});blocked();
  document.addEventListener('keydown',trap);document.addEventListener('visibilitychange',visibility);window.addEventListener('ravens:cover-private',conceal);window.addEventListener('ravens:return-town',conceal);
  return()=>{observer.disconnect();document.removeEventListener('keydown',trap);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('ravens:cover-private',conceal);window.removeEventListener('ravens:return-town',conceal);if(previous?.isConnected&&!document.hidden&&!hasOverlay()&&!previous.closest('[hidden],[inert]'))previous.focus({preventScroll:true});};
 },[onClose]);
 if(document.hidden)return null;
 return createPortal(<section className="role-portrait-peek" data-private-feedback="true" data-town-reading="true" role="dialog" aria-modal="false" aria-label="我的角色立绘"><button ref={button} type="button" className="role-portrait-peek__surface" aria-label="收起我的角色立绘" onClick={onClose}><span className="role-portrait-peek__glow" aria-hidden="true"/><img className="role-portrait-peek__image" src={art.portraitUrl} alt={`${name}立绘`} draggable={false} style={{objectPosition:art.portraitPosition} as CSSProperties}/></button></section>,document.body);
}
