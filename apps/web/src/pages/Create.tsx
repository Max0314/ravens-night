import { Button, Panel } from "@ravens/ui";
import { useState, type FormEvent } from "react";
import type { RoomPlayMode } from "../api.js";

const modeCopy: Record<RoomPlayMode, { title: string; detail: string; symbol: string }> = {
  IN_PERSON: { title: "围桌线下", detail: "一块公共大屏，所有人围坐讨论", symbol: "⌂" },
  REMOTE: { title: "纯线上", detail: "每人独立加入，可附上语音或视频链接", symbol: "⌁" },
  HYBRID: { title: "线上线下混合", detail: "现场大屏与远程玩家共享同一局", symbol: "◐" },
};

export function Create({ onBack, onSubmit, busy, error }: { onBack: () => void; onSubmit: (name: string, count: number, playMode: RoomPlayMode, voiceRoomUrl?: string) => void; busy: boolean; error?: string }) {
  const [name, setName] = useState("");
  const [count, setCount] = useState(8);
  const [playMode, setPlayMode] = useState<RoomPlayMode>("IN_PERSON");
  const [voiceRoomUrl, setVoiceRoomUrl] = useState("");
  const needsVoiceLink = playMode !== "IN_PERSON";

  return <main className="center-page create-page"><button className="back-link" type="button" onClick={onBack}>← 返回</button><Panel className="form-panel form-panel--create"><p className="eyebrow">创建房间</p><h1>召集今夜的村民</h1><p>选择这局人们如何相聚。规则、私密身份和公开城镇始终属于同一间房。</p><form onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(name, count, playMode, needsVoiceLink ? voiceRoomUrl : undefined); }}><div className="form-row"><label>你的昵称<input value={name} maxLength={24} placeholder="大家认识的名字" onChange={(event) => setName(event.target.value)} required /></label><label>玩家人数<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 5).map((value) => <option key={value} value={value}>{value} 人</option>)}</select></label></div><fieldset className="play-mode-picker"><legend>这局怎么玩</legend><div>{(Object.keys(modeCopy) as RoomPlayMode[]).map((mode) => <button key={mode} type="button" className={playMode === mode ? "is-selected" : ""} aria-pressed={playMode === mode} onClick={() => setPlayMode(mode)}><span aria-hidden="true">{modeCopy[mode].symbol}</span><strong>{modeCopy[mode].title}</strong><small>{modeCopy[mode].detail}</small></button>)}</div></fieldset>{needsVoiceLink ? <label>语音/视频房间链接（可选）<input type="url" inputMode="url" placeholder="https://meeting.example.com/…" value={voiceRoomUrl} onChange={(event) => setVoiceRoomUrl(event.target.value)} /><small>游戏不会监听通话；这里只让远程玩家方便进入同一频道。</small></label> : null}{error ? <p className="form-error">{error}</p> : null}<Button type="submit" disabled={busy}>{busy ? "正在点亮钟楼…" : "创建房间"}</Button></form></Panel></main>;
}
