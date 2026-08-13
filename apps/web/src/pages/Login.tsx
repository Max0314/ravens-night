import { Button, Panel } from "@ravens/ui";
import { useState, type FormEvent } from "react";

export function Login({ onSubmit, busy, error }: { onSubmit: (password: string) => void; busy: boolean; error?: string }) {
  const [password, setPassword] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (password) onSubmit(password); }
  return <main className="login-page">
    <div className="login-page__art" aria-hidden="true" />
    <Panel className="login-panel"><div className="brand"><span className="brand__mark">☾</span><span>鸦钟夜话</span><small>RAVENS AT MIDNIGHT</small></div><p className="eyebrow">受邀者入口</p><h1>钟楼只为受邀者敲响</h1><p>输入主人提供的访问口令。进入后，所有人仍需使用同一个六位房间邀请码。</p>
      <form onSubmit={submit}><label>访问口令<input aria-label="访问口令" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p role="alert" className="form-error">{error}</p> : null}<Button type="submit" disabled={!password || busy}>{busy ? "正在验证…" : "进入钟楼"}</Button></form>
    </Panel>
  </main>;
}
