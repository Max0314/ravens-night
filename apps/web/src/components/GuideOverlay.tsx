import { beginnerRoles } from "@ravens/content";
import { useEffect, useState } from "react";
import type { PrivateView } from "../api.js";
import { roleTypeGuidance, roleTypeNames, tutorialSteps } from "../guide-content.js";

export type GuideMode = "tutorial" | "roles" | "mine";

export function GuideOverlay({ mode, ownRole, onClose }: { mode: GuideMode; ownRole?: PrivateView["role"]; onClose: () => void }) {
  const [activeMode, setActiveMode] = useState<GuideMode>(mode);
  const [step, setStep] = useState(0);
  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>(ownRole?.roleId);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const selectedRole = beginnerRoles.find((role) => role.id === selectedRoleId);
  const tabs: Array<{ id: GuideMode; label: string }> = [
    ...(ownRole ? [{ id: "mine" as const, label: "我的角色" }] : []),
    { id: "tutorial", label: "新手教程" },
    { id: "roles", label: "角色表" },
  ];

  return <div className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="guide-sheet" role="dialog" aria-modal="true" aria-label="游戏帮助">
      <header className="guide-sheet__header">
        <div><span className="guide-sheet__mark">☾</span><strong>钟楼手册</strong></div>
        <button type="button" onClick={onClose} aria-label="关闭游戏帮助">关闭 ×</button>
      </header>
      <nav className="guide-tabs" aria-label="手册页面">
        {tabs.map((tab) => <button type="button" key={tab.id} className={activeMode === tab.id ? "is-active" : ""} onClick={() => setActiveMode(tab.id)}>{tab.label}</button>)}
      </nav>

      {activeMode === "mine" && ownRole ? <div className="own-role-guide">
        <p className={`role-alignment role-alignment--${ownRole.alignment.toLowerCase()}`}>{ownRole.alignment === "GOOD" ? "善良阵营" : "邪恶阵营"} · {roleTypeNames[ownRole.type as keyof typeof roleTypeNames]}</p>
        <h1>{ownRole.name}</h1>
        <p className="own-role-guide__ability">{ownRole.summary}</p>
        <div className="guide-callout"><span>游玩建议</span><p>{ownRole.beginnerTip}</p></div>
        <div className="guide-callout guide-callout--quiet"><span>阵营目标</span><p>{roleTypeGuidance[ownRole.type as keyof typeof roleTypeGuidance]}</p></div>
      </div> : null}

      {activeMode === "tutorial" ? <div className="guide-tutorial">
        <p className="guide-step-count">规则 {step + 1} / {tutorialSteps.length}</p>
        <div className="guide-tutorial__symbol">{tutorialSteps[step]!.symbol}</div>
        <h1>{tutorialSteps[step]!.title}</h1>
        <p>{tutorialSteps[step]!.detail}</p>
        <div className="guide-tutorial__actions">
          <button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>上一条</button>
          <button type="button" onClick={() => step === tutorialSteps.length - 1 ? setActiveMode("roles") : setStep((value) => value + 1)}>{step === tutorialSteps.length - 1 ? "继续看角色表" : "下一条"}</button>
        </div>
      </div> : null}

      {activeMode === "roles" ? <div className="role-compendium">
        <div className="role-compendium__intro"><div><p>暗流涌动 · 22 个角色</p><h1>{selectedRole ? selectedRole.name : "选择角色查看规则"}</h1></div>{selectedRole ? <button type="button" onClick={() => setSelectedRoleId(undefined)}>返回全部</button> : null}</div>
        {selectedRole ? <article className="role-detail">
          <p className={`role-alignment role-alignment--${selectedRole.type === "MINION" || selectedRole.type === "DEMON" ? "evil" : "good"}`}>{roleTypeNames[selectedRole.type]} · {roleTypeGuidance[selectedRole.type]}</p>
          <h2>能力</h2><p>{selectedRole.summary}</p>
          <h2>第一次玩</h2><p>{selectedRole.beginnerTip}</p>
        </article> : <div className="role-groups">{(["TOWNSFOLK", "OUTSIDER", "MINION", "DEMON"] as const).map((type) => <section key={type}>
          <header><h2>{roleTypeNames[type]}</h2><span>{beginnerRoles.filter((role) => role.type === type).length}</span></header>
          <p>{roleTypeGuidance[type]}</p>
          <div>{beginnerRoles.filter((role) => role.type === type).map((role) => <button type="button" key={role.id} onClick={() => setSelectedRoleId(role.id)}><strong>{role.name}</strong><small>{role.summary}</small></button>)}</div>
        </section>)}</div>}
      </div> : null}
    </section>
  </div>;
}
