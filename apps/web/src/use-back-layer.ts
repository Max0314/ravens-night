import { useEffect, useRef } from "react";
/** One history entry per opened layer; a back action consumes it without trapping navigation. */
export function useBackLayer(open: boolean, close: () => void) {
  const callback=useRef(close);callback.current=close;
  useEffect(()=>{
    if(!open)return;
    const id=crypto.randomUUID();
    const state={...window.history.state,ravensLayer:id};
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
    return()=>{const index=active.indexOf(id);if(index>=0)active.splice(index,1);window.removeEventListener("popstate",back,true);window.removeEventListener("keydown",key,true);queueMicrotask(()=>{if(window.history.state?.ravensLayer===id)window.history.back();});};
  },[open]);
}
const active:string[]=[];
if(typeof window!=="undefined")window.addEventListener("popstate",event=>{
  if(event.state?.ravensLayer&&!active.includes(event.state.ravensLayer)){event.stopImmediatePropagation();window.history.back();}
},true);
