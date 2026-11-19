import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {FeedbackButton,RolePortrait} from '@ravens/ui';
import {useBackLayer} from '../use-back-layer.js';
import {roleArt} from '../role-art.js';
import './role-portrait-peek.css';

/** Only the owner's perceived role id enters this view. */
export function RolePortraitPeek({roleId,name,onClose,onAdvice}:{roleId:string;name:string;onClose:()=>void;onAdvice:()=>void}){
 const button=useRef<HTMLButtonElement>(null),art=roleArt(roleId);
 const advice=useRef<HTMLButtonElement>(null);
 useBackLayer(true,onClose);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;
  button.current?.focus({preventScroll:true});
  const conceal=()=>onClose(),visibility=()=>{if(document.hidden)onClose();};
  const hasOverlay=()=>!!document.querySelector('.guide-backdrop,.room-sheet-backdrop,.player-wheel-backdrop,.private-scene-dialog,.event-stage');
  const blocked=()=>{if(hasOverlay())onClose();};
  const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab'||hasOverlay())return;const buttons=[button.current,advice.current,...document.querySelectorAll<HTMLButtonElement>('.nomination-notice button,.private-action-notice button')].filter((node):node is HTMLButtonElement=>!!node&&!node.disabled&&!node.closest('[hidden],[inert]')&&getComputedStyle(node).display!=='none');if(!buttons.length)return;const index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=event.shiftKey?(index<=0?buttons.length-1:index-1):(index<0||index===buttons.length-1?0:index+1);event.preventDefault();buttons[next]?.focus({preventScroll:true});};
  const observer=new MutationObserver(blocked);observer.observe(document.body,{subtree:true,childList:true});blocked();
  document.addEventListener('keydown',trap);document.addEventListener('visibilitychange',visibility);window.addEventListener('ravens:cover-private',conceal);window.addEventListener('ravens:return-town',conceal);
  return()=>{observer.disconnect();document.removeEventListener('keydown',trap);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('ravens:cover-private',conceal);window.removeEventListener('ravens:return-town',conceal);if(previous?.isConnected&&!document.hidden&&!hasOverlay()&&!previous.closest('[hidden],[inert]'))previous.focus({preventScroll:true});};
 },[onClose]);
 if(document.hidden)return null;
 return createPortal(<section className="role-portrait-peek" data-private-feedback="true" data-town-reading="true" role="dialog" aria-modal="false" aria-label="我的角色立绘">
  <FeedbackButton ref={button} feedback="close" type="button" className="role-portrait-peek__surface" aria-label="收起我的角色立绘" onClick={onClose}>
   <span className="role-portrait-peek__frame">
    <RolePortrait className="role-portrait-peek__image" url={art.portraitUrl} srcSet={art.portraitSrcSet} sizes="(max-width: 640px) 90vw, 520px" label={`${name}立绘`} position={art.portraitPosition}/>
   </span>
  </FeedbackButton>
  <FeedbackButton ref={advice} feedback="open" type="button" className="role-portrait-peek__advice" onClick={onAdvice}>查看游玩建议</FeedbackButton>
 </section>,document.body);
}
