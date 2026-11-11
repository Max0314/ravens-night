import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { beginnerRoles } from "@ravens/content";
import { SeatAvatarDecoration } from "@ravens/ui";
import { getRoomResult, type GameView, type RoomResult } from "../api.js";
import { Avatar } from "./Avatar.js";
import { RoomSheet } from "./RoomPage.js";

const roleName = (id: string) => beginnerRoles.find(role => role.id === id)?.name ?? id;
const evil = (id: string) => ["MINION", "DEMON"].includes(beginnerRoles.find(role => role.id === id)?.type ?? "");
const reasons:Record<string,string>={"saint-executed":"圣徒被处决","mayor-final-three":"镇长达成三人存活胜利","demon-dead":"恶魔已死亡","final-two":"仅剩两人存活"};

// Keep every touch rectangle disjoint; dense/short tables use two shallow arcs.
function resultSeatLayout(count:number,width:number,height:number){
  const dense=count>9,ringWidth=dense?60:68,ringHeight=dense?72:80;
  const ring=Array.from({length:count},(_,i)=>({x:width/2+Math.sin(2*Math.PI*i/count)*(width/2-36),y:height/2-Math.cos(2*Math.PI*i/count)*(height/2-42)}));
  const collides=ring.some((a,i)=>ring.some((b,j)=>j>i&&Math.abs(a.x-b.x)<ringWidth+2&&Math.abs(a.y-b.y)<ringHeight+2));
  if(width>=360&&height>=320&&!collides){
    let top=height*.3,bottom=height*.3;
    for(const point of ring)if(point.x+ringWidth/2>width*.29-2&&point.x-ringWidth/2<width*.71+2){
      if(point.y<height/2)top=Math.max(top,point.y+ringHeight/2+2);
      else bottom=Math.max(bottom,height-point.y+ringHeight/2+2);
    }
    return {kind:'ring',points:ring,buttonWidth:ringWidth,buttonHeight:ringHeight,portrait:dense?36:44,names:true,top,bottom,modal:height-top-bottom<110,canvasHeight:height};
  }
  const columns=Math.max(1,Math.min(6,Math.floor((width-8)/44))),half=Math.ceil(count/2);
  if(half>columns||height<96){
    const rows=Math.ceil(count/columns),canvasHeight=Math.max(height,rows*46),cellWidth=width/columns,cellHeight=canvasHeight/rows,buttonHeight=Math.min(64,cellHeight-2);
    return {kind:'grid',points:Array.from({length:count},(_,i)=>({x:(i%columns+.5)*cellWidth,y:(Math.floor(i/columns)+.5)*cellHeight})),buttonWidth:Math.max(44,Math.min(60,cellWidth-2)),buttonHeight,portrait:Math.min(30,buttonHeight-18),names:cellHeight>=66,top:0,bottom:0,modal:true,canvasHeight};
  }
  const buttonHeight=height>=300?64:height>=200?56:44,depth=Math.max(0,Math.min(8,(height-2*buttonHeight-24)/4));
  const points=Array.from({length:count},(_,i)=>{
    const lower=i>=half,n=lower?count-half:half,column=lower?n-1-(i-half):i;
    const bend=depth*(1-Math.sin(Math.PI*(column+.5)/n));
    return {x:4+(column+.5)*(width-8)/n,y:lower?height-4-buttonHeight/2-bend:4+buttonHeight/2+bend};
  });
  const edge=4+buttonHeight+depth;
  return {kind:'arcs',points,buttonWidth:Math.min(60,Math.max(44,(width-8)/half-2)),buttonHeight,portrait:buttonHeight===44?26:32,names:height>=300,top:edge,bottom:edge,modal:height-2*edge<110,canvasHeight:height};
}

/** A result is already public. Live seats may enrich it only when both game ids match. */
export function ResultBoard({ code, gameId, game }: { code: string; gameId?: string | undefined; game?:GameView | undefined }) {
  const key=`${code}:${gameId??"latest"}`;
  const [loaded, setLoaded] = useState<{key:string;result:RoomResult|null}>();
  const [failure, setFailure] = useState<{key:string;message:string}>();
  const [attempt,setAttempt]=useState(0),[selection,setSelection]=useState<{gameId:string;id:string}>();
  const table=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:320,height:300});
  useLayoutEffect(()=>{
    const node=table.current;if(!node)return;
    const measure=()=>{const rect=node.getBoundingClientRect();if(rect.width<1||rect.height<1)return;const width=Math.floor(rect.width),height=Math.floor(rect.height);setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height});};
    measure();const observer=typeof ResizeObserver==='undefined'?undefined:new ResizeObserver(measure);observer?.observe(node);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
    const disclosures:HTMLElement[]=[];
    for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'){parent.addEventListener('toggle',measure);disclosures.push(parent);}
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);disclosures.forEach(parent=>parent.removeEventListener('toggle',measure));};
  },[key,loaded?.result?.gameId,failure?.key]);
  useEffect(() => {
    let live = true; setFailure(undefined);
    void getRoomResult(code).then(value => { if (live) setLoaded({key,result:value.result}); }, () => { if (live) setFailure({key,message:"战报暂未取得"}); });
    return () => { live = false; };
  }, [code, gameId, key, attempt]);
  const result=loaded?.key===key?loaded.result:undefined,error=failure?.key===key?failure.message:undefined;
  const retry=<button type="button" className="result-town__retry" onClick={()=>setAttempt(n=>n+1)}>重新获取战报</button>;
  if(error)return <section className="result-board result-town" aria-label="本局战报"><p role="alert">{error}</p>{retry}</section>;
  if(gameId && result && result.gameId !== gameId) return <section className="result-board result-town" aria-label="本局战报"><p role="status">战报正在同步</p>{retry}</section>;
  if(!result)return <section className="result-board result-town" aria-label="本局战报"><p role="status">{loaded?.key===key?"暂无已公布战报":"正在取得战报…"}</p></section>;
  const sameGame=game?.gameId===result.gameId&&game?.phase==='GAME_OVER';
  const players=result.participants.map(player=>({ ...player,seat:sameGame?game.seats.find(s=>s.id===player.id):undefined })).sort((a,b)=>(a.seat?.seat??Infinity)-(b.seat?.seat??Infinity));
  const picked=selection?.gameId===result.gameId?players.find(p=>p.id===selection.id):undefined;
  const layout=resultSeatLayout(players.length,size.width,size.height);
  const detail=picked?<><span>{picked.seat?`${picked.seat.seat}号 · `:''}{picked.nickname}</span><strong>{roleName(picked.finalRole)}</strong><small data-alignment={evil(picked.finalRole)?'evil':'good'}>{evil(picked.finalRole)?'邪恶阵营':'善良阵营'}{picked.controller==='BOT'?' · 人机':''}</small>{picked.seat?<small>{picked.seat.alive?'终局存活':'终局已死亡'}</small>:null}{picked.perceivedRole?<p>本局自认 {roleName(picked.perceivedRole)}</p>:null}<button type="button" onClick={()=>setSelection(undefined)}>返回战况</button></>:null;
  return <section aria-label="本局战报" className={`result-board result-town result-town--${result.winner.toLowerCase()}`}>
    {!gameId?<h2>{result.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜"}</h2>:null}
    <div className="result-town__meta"><span>第 {result.days} 天结束</span><small>{result.hadBots?"含人机":"全真人"}{result.rehearsalUsed?" · 测试对局":""}</small></div>
    <div ref={table} className="result-town__table" data-layout={layout.kind} data-names={layout.names} style={{'--result-button-width':`${layout.buttonWidth}px`,'--result-button-height':`${layout.buttonHeight}px`,'--result-portrait':`${layout.portrait}px`,'--result-detail-top':`${layout.top}px`,'--result-detail-bottom':`${layout.bottom}px`,'--result-canvas-height':`${layout.canvasHeight}px`} as CSSProperties}>
      <div className={`result-town__center${picked&&!layout.modal?' has-player':''}`} aria-live="polite" aria-label="结算详情">
        {picked&&!layout.modal?detail:<><span className="result-town__seal" aria-hidden="true">{result.winner==='GOOD'?'☀':'☾'}</span><strong>{result.winner==='GOOD'?'善良获胜':'邪恶获胜'}</strong><p>{reasons[result.reason]??'本局已结束'}</p><small>点头像查看身份</small></>}
      </div>
      <ol className="result-town__ring" aria-label="终局角色圆桌">{players.map((player,index)=>{
        const point=layout.points[index]!,selected=player.id===picked?.id,dead=player.seat?.alive===false;
        return <li key={player.id} style={{left:point.x,top:point.y}}>
          <button type="button" className={`result-town__player${selected?' is-selected':''}${dead?' is-dead':''}`} aria-pressed={selected} aria-label={`${player.seat?`${player.seat.seat}号 `:''}${player.nickname}，真实身份${roleName(player.finalRole)}`} onClick={()=>setSelection({gameId:result.gameId,id:player.id})}>
            <span className="result-town__portrait"><Avatar id={player.id} name={player.nickname} url={player.avatar}/>{dead?<SeatAvatarDecoration state="DEAD"/>:null}{player.seat?<small className="result-town__number">{player.seat.seat}</small>:null}</span>
            <span className="result-town__name">{player.nickname}</span><strong data-alignment={evil(player.finalRole)?'evil':'good'}>{roleName(player.finalRole)}</strong>
          </button>
        </li>;
      })}</ol>
    </div>
    {picked&&layout.modal?<RoomSheet title={`${picked.nickname} · 真实身份`} onClose={()=>setSelection(undefined)}><div className="result-town__expanded"><Avatar id={picked.id} name={picked.nickname} url={picked.avatar}/>{detail}</div></RoomSheet>:null}
  </section>;
}
