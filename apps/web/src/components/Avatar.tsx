import { useEffect, useState, type CSSProperties } from "react";

export function Avatar({ id, name, url }: { id: string; name: string; url?: string | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const hue = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 360, 0);
  return <span className="player-avatar" style={{ "--avatar-hue": hue } as CSSProperties}>
    {url && !failed ? <img src={url} width="64" height="64" loading="lazy" alt="" onError={() => setFailed(true)} /> : <span aria-hidden="true">{[...name][0] ?? "客"}</span>}
  </span>;
}
