import { Button, Panel } from "@ravens/ui";
import { useState, type FormEvent } from "react";

export function Create({ onBack, onSubmit, busy, error }: { onBack: () => void; onSubmit: (name: string, count: number) => void; busy: boolean; error?: string }) {
  const [name, setName] = useState(""); const [count, setCount] = useState(8);
  return <main className="center-page"><button className="back-link" onClick={onBack}>← 返回</button><Panel className="form-panel"><h1>召集今夜的村民</h1><p>创建者仍然是普通玩家，开局后没有后台秘密权限。</p><form onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(name, count); }}><label>你的昵称<input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} required /></label><label>玩家人数<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 5).map((value) => <option key={value} value={value}>{value} 人</option>)}</select></label>{error ? <p className="form-error">{error}</p> : null}<Button type="submit" disabled={busy}>{busy ? "正在点亮钟楼…" : "创建房间"}</Button></form></Panel></main>;
}
