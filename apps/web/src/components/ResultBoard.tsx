import {playerLabel} from '@ravens/ui';
import { useEffect, useState } from "react";
import { beginnerRoles } from "@ravens/content";
import { SeatAvatarDecoration } from "@ravens/ui";
import { getRoomResult, type GameView, type RoomResult } from "../api.js";
import {RoundTable} from './RoundTable.js';
import { Avatar } from "./Avatar.js";
import { RoomSheet } from "./RoomPage.js";

const roleName = (id: string) => beginnerRoles.find(role => role.id === id)?.name ?? id;
const evil = (id: string) => ["MINION", "DEMON"].includes(beginnerRoles.find(role => role.id === id)?.type ?? "");
const reasons:Record<string,string>={"saint-executed":"圣徒被处决","mayor-final-three":"镇长达成三人存活胜利","demon-dead":"恶魔已死亡","final-two":"仅剩两人存活"};

/** A result is already public. Live seats may enrich it only when both game ids match. */
export function ResultBoard({ code, gameId, game }: { code: string; gameId?: string | undefined; game?:GameView | undefined }) {
  const key=`${code}:${gameId??"latest"}`;
  const [loaded, setLoaded] = useState<{key:string;result:RoomResult|null}>();
  const [failure, setFailure] = useState<{key:string;message:string}>();
  const [attempt,setAttempt]=useState(0),[selection,setSelection]=useState<{gameId:string;id:string}>();
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

  const detail=picked?<><span>{playerLabel(picked.seat?.seat,picked.nickname)}</span><strong>{roleName(picked.finalRole)}</strong><small data-alignment={evil(picked.finalRole)?'evil':'good'}>{evil(picked.finalRole)?'邪恶阵营':'善良阵营'}{picked.controller==='BOT'?' · 人机':''}</small>{picked.seat?<small>{picked.seat.alive?'终局存活':'终局已死亡'}</small>:null}{picked.perceivedRole?<p>本局自认 {roleName(picked.perceivedRole)}</p>:null}<button type="button" onClick={()=>setSelection(undefined)}>返回战况</button></>:null;
  return <section aria-label="本局战报" className={`result-board result-town result-town--${result.winner.toLowerCase()}`}>
    {!gameId?<h2>{result.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜"}</h2>:null}
    <div className="result-town__meta"><span>第 {result.days} 天结束</span><small>{result.hadBots?"含人机":"全真人"}{result.rehearsalUsed?" · 测试对局":""}</small></div>
    <RoundTable key={result.gameId} count={players.length} className="result-town__table">{layout=><>
      <div className="result-town__center" aria-live="polite" aria-label="结算详情">
        <><span className="result-town__seal" aria-hidden="true">{result.winner==='GOOD'?'☀':'☾'}</span><strong>{result.winner==='GOOD'?'善良获胜':'邪恶获胜'}</strong><p>{reasons[result.reason]??'本局已结束'}</p><small>点头像查看身份</small></>
      </div>
      <ol className="result-town__ring" aria-label="终局角色圆桌">{players.map((player,index)=>{
        const point=layout.points[index]!,selected=player.id===picked?.id,dead=player.seat?.alive===false;
        return <li key={player.id} style={{left:point.x,top:point.y}}>
          <button type="button" className={`result-town__player${selected?' is-selected':''}${dead?' is-dead':''}`} aria-pressed={selected} aria-label={`${playerLabel(player.seat?.seat,player.nickname)}，真实身份${roleName(player.finalRole)}`} onClick={()=>setSelection({gameId:result.gameId,id:player.id})}>
            <span className="result-town__portrait"><Avatar id={player.id} name={player.nickname} url={player.avatar}/>{dead?<SeatAvatarDecoration state="DEAD"/>:null}{player.seat?<small className="result-town__number">{player.seat.seat}</small>:null}</span>
            <span className="result-town__name">{player.nickname}</span><strong data-alignment={evil(player.finalRole)?'evil':'good'}>{roleName(player.finalRole)}</strong>
          </button>
        </li>;
      })}</ol>
    </>}</RoundTable>
    {picked?<RoomSheet title={`${picked.nickname} · 真实身份`} onClose={()=>setSelection(undefined)}><div className="result-town__expanded"><Avatar id={picked.id} name={picked.nickname} url={picked.avatar}/>{detail}</div></RoomSheet>:null}
  </section>;
}
