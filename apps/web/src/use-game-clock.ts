import { useEffect, useRef, useState } from "react";
import type { GameView, RoomView } from "./api.js";

/** Game logic time is independent of heartbeat/credential wall time. */
export function useGameClock(game?:GameView,room?:Pick<RoomView,"timeline"|"roomInstanceId"|"revision">) {
  const frozen=room?.timeline?.mode==="MANUAL";
  const key=`${room?.roomInstanceId??""}:${game?.gameId??""}:${room?.timeline?.epoch??0}`;
  const sample=useRef({key,revision:room?.revision??game?.revision??0,server:game?.serverNow??Date.now(),at:performance.now()});
  const revision=room?.revision??game?.revision??0;
  if(key!==sample.current.key || revision>=sample.current.revision && game?.serverNow!==undefined && game.serverNow!==sample.current.server)sample.current={key,revision,server:game?.serverNow??Date.now(),at:performance.now()};
  const [,render]=useState(0);
  useEffect(()=>{if(frozen)return;const timer=window.setInterval(()=>render(value=>value+1),80);return()=>window.clearInterval(timer);},[frozen,key]);
  return frozen?sample.current.server:sample.current.server+Math.max(0,performance.now()-sample.current.at);
}
