import { useEffect, useRef } from "react";
/** One history entry per opened layer; a back action consumes it without trapping navigation. */
export function useBackLayer(open: boolean, close: () => void, roleReference = false) {
  const callback=useRef(close);callback.current=close;
  useEffect(()=>{
    if(!open)return;
    const id=crypto.randomUUID();
    const state={...window.history.state,ravensLayer:id,ravensRoleReference:roleReference};
    if(window.history.state?.ravensLayer&&!active.includes(window.history.state.ravensLayer))window.history.replaceState(state,"",window.location.href);
    else window.history.pushState(state,"",window.location.href);
    const back=(event:PopStateEvent)=>{
      if(event.state?.ravensLayer===id)return;
      // Only the most recently opened listener handles this pop (capture in reverse registration is not guaranteed).
      if(active.at(-1)!==id)return;
      event.stopImmediatePropagation();callback.current();
    };
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"&&active.at(-1)===id){event.stopImmediatePropagation();callback.current();}};
    active.push(id);window.addEventListener("popstate",back,true);window.addEventListener("keydown",key,true);
    return()=>{
      const index=active.indexOf(id);
      if(index>=0)active.splice(index,1);
      window.removeEventListener("popstate",back,true);
      window.removeEventListener("keydown",key,true);
      if(roleReference){
        if(window.history.state?.ravensLayer===id)beginReferenceBack(id,state.ravensScreen);
      }else{
        queueMicrotask(()=>{if(window.history.state?.ravensLayer===id)window.history.back();});
      }
    };
  },[open,roleReference]);
}
const active:string[]=[];
let referenceBack:{href:string;screen:unknown}|undefined;
let referenceAction:(()=>void)|undefined;

export function afterRoleReferenceBack(action:()=>void){
  if(referenceBack)referenceAction=action;
  else action();
}

export function discardRoleReferenceBackAction(){
  referenceAction=undefined;
}

function finishReferenceBack(samePage:boolean){
  const action=referenceAction;
  referenceAction=undefined;
  referenceBack=undefined;
  if(samePage)action?.();
}

function beginReferenceBack(id:string,screen:unknown){
  if(referenceBack)return;
  const expected={href:window.location.href,screen};
  referenceBack=expected;
  queueMicrotask(()=>{
    if(referenceBack!==expected)return;
    if(window.history.state?.ravensLayer===id&&window.location.href===expected.href)window.history.back();
    else finishReferenceBack(false);
  });
}

if(typeof window!=="undefined")window.addEventListener("popstate",event=>{
  const id=event.state?.ravensLayer;
  const stale=id&&!active.includes(id);
  if(referenceBack){
    const samePage=window.location.href===referenceBack.href&&event.state?.ravensScreen===referenceBack.screen;
    if(samePage){
      event.stopImmediatePropagation();
      if(stale)window.history.back();
      else finishReferenceBack(true);
      return;
    }
    finishReferenceBack(false);
  }
  if(stale){
    event.stopImmediatePropagation();
    if(event.state.ravensRoleReference)beginReferenceBack(id,event.state.ravensScreen);
    else window.history.back();
  }
},true);
