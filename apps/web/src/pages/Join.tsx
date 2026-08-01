import { Button, Panel } from "@ravens/ui";
import { useState, type FormEvent } from "react";

export interface JoinValues { code: string; nickname: string; mode: "PLAYER" | "DISPLAY" }

export function Join({ onBack, onSubmit, busy, error }: { onBack: () => void; onSubmit: (values: JoinValues) => void; busy: boolean; error?: string }) {
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<"PLAYER" | "DISPLAY">("PLAYER");
  function submit(event: FormEvent) { event.preventDefault(); onSubmit({ code: code.toUpperCase().replace(/[^A-Z2-9]/g, ""), nickname: mode === "DISPLAY" ? "公共大屏" : nickname, mode }); }
  return (
    <main className="center-page">
      <button className="back-link" onClick={onBack}>← 返回</button>
      <Panel className="form-panel">
        <h1>进入村庄</h1><p>输入所有人相同的邀请码。你的身份只会显示在这台设备上。</p>
        <form onSubmit={submit}>
          <label>六位邀请码<input aria-label="六位邀请码" inputMode="text" autoCapitalize="characters" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="7K3MQ8" required /></label>
          <div className="mode-choice" role="group" aria-label="加入方式">
            <button type="button" className={mode === "PLAYER" ? "is-active" : ""} onClick={() => setMode("PLAYER")}>手机玩家<small>身份与操作仅自己可见</small></button>
            <button type="button" className={mode === "DISPLAY" ? "is-active" : ""} onClick={() => setMode("DISPLAY")}>公共大屏<small>只显示公开城镇信息</small></button>
          </div>
          {mode === "PLAYER" ? <label>你的昵称<input maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="大家认识的名字" required /></label> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={busy || code.length < 6}>{busy ? "正在敲门…" : "进入房间"}</Button>
        </form>
      </Panel>
    </main>
  );
}
