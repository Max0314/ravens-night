import { Button, Panel } from "@ravens/ui";
import { useState, type FormEvent } from "react";

export interface JoinValues { code: string; nickname: string; mode: "PLAYER" | "DISPLAY"; recoveryCode?: string }

export function Join({ initialCode = "", onBack, onSubmit, busy, error }: { initialCode?: string; onBack: () => void; onSubmit: (values: JoinValues) => void; busy: boolean; error?: string }) {
  const [code, setCode] = useState(initialCode);
  const [nickname, setNickname] = useState("");
  const [mode, setMode] = useState<"PLAYER" | "DISPLAY">("PLAYER");
  const [recovering, setRecovering] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); onSubmit({ code: code.toUpperCase().replace(/[^A-Z2-9]/g, ""), nickname: mode === "DISPLAY" ? "公共大屏" : nickname, mode, ...(recovering && mode === "PLAYER" ? { recoveryCode: recoveryCode.trim() } : {}) }); }
  return (
    <main className="center-page">
      <button className="back-link" onClick={onBack}>← 返回</button>
      <Panel className="form-panel">
        <p className="eyebrow">加入游戏</p><h1>进入村庄</h1><p>输入所有人相同的邀请码。你的身份只会显示在这台设备上。</p>
        <form onSubmit={submit}>
          <label>六位邀请码<input aria-label="六位邀请码" inputMode="text" autoCapitalize="characters" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="7K3MQ8" required /></label>
          <div className="mode-choice" role="group" aria-label="加入方式">
            <button type="button" aria-pressed={mode === "PLAYER"} className={mode === "PLAYER" ? "is-active" : ""} onClick={() => setMode("PLAYER")}><span aria-hidden="true">♟</span>手机玩家<small>每人一台手机 · 身份与操作仅自己可见</small></button>
            <button type="button" aria-pressed={mode === "DISPLAY"} className={mode === "DISPLAY" ? "is-active" : ""} onClick={() => setMode("DISPLAY")}><span aria-hidden="true">▣</span>电视公共大屏<small>电脑连接电视 · 只显示公开城镇信息</small></button>
          </div>
          {mode === "PLAYER" ? <><button type="button" className="recovery-toggle" onClick={() => setRecovering((value) => !value)}>{recovering ? "以新玩家身份加入" : "从另一台设备恢复座位"}</button>{recovering ? <label>一次性恢复码<input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} maxLength={32} autoComplete="off" placeholder="原设备在公开城镇中生成" required /></label> : <label>你的昵称<input maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="大家认识的名字" required /></label>}</> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button type="submit" disabled={busy || code.length < 6}>{busy ? "正在敲门…" : recovering && mode === "PLAYER" ? "恢复我的座位" : "进入房间"}</Button>
        </form>
      </Panel>
    </main>
  );
}
