import { useEffect, useState } from "react";
import { beginnerRoles } from "@ravens/content";
import { getRoomResult, type RoomResult } from "../api.js";
import { Avatar } from "./Avatar.js";

export function ResultBoard({ code, gameId }: { code: string; gameId?: string | undefined }) {
  const [result, setResult] = useState<RoomResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let live = true; setResult(null); void getRoomResult(code).then(value => { if (live) setResult(value.result); }, () => { if (live) setError("战报暂未取得，请稍后重新打开"); }); return () => { live = false; }; }, [code, gameId]);
  const roleName = (id: string) => beginnerRoles.find(role => role.id === id)?.name ?? id;
  if(gameId && result && result.gameId !== gameId) return <p>战报正在同步</p>;
  return <section aria-label="本局战报" className="result-board">{result ? <><h2>{result.winner === "GOOD" ? "善良阵营获胜" : "邪恶阵营获胜"}</h2><p>{result.reason} · 第 {result.days} 天</p><div className="result-grid">{result.participants.map(player => <article key={player.id}><Avatar id={player.id} name={player.nickname} url={player.avatar} /><strong title={player.nickname}>{player.nickname}</strong><span>{roleName(player.finalRole)}</span>{player.perceivedRole ? <small>自认{roleName(player.perceivedRole)}</small> : null}</article>)}</div></> : <p>{error || "暂无已公布战报"}</p>}</section>;
}
