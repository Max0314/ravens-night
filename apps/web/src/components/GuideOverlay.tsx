import { beginnerRoles } from "@ravens/content";
import { useEffect, useRef, useState } from "react";
import type { PrivateView } from "../api.js";
import { rolePlayGuides, roleTypeGuidance, roleTypeNames, tutorialSteps } from "../guide-content.js";
import { roleArt } from "../role-art.js";

export type GuideMode = "tutorial" | "roles" | "mine";

export function GuideOverlay({ mode, ownRole, onClose }: { mode: GuideMode; ownRole?: PrivateView["role"]; onClose: () => void }) {
  const [activeMode, setActiveMode] = useState<GuideMode>(mode);
  const [step, setStep] = useState(0);
  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>(ownRole?.roleId);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const selectedRole = beginnerRoles.find((role) => role.id === selectedRoleId);
  const selectedRoleArt = selectedRole ? roleArt(selectedRole.id) : undefined;
  const selectedPlayGuide = selectedRole ? rolePlayGuides[selectedRole.id] : undefined;
  const ownPlayGuide = ownRole ? rolePlayGuides[ownRole.roleId] : undefined;
  const tabs: Array<{ id: GuideMode; label: string }> = [
    ...(ownRole ? [{ id: "mine" as const, label: "我的角色" }] : []),
    { id: "tutorial", label: "新手教程" },
    { id: "roles", label: "角色表" },
  ];

  return <div className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="guide-sheet" role="dialog" aria-modal="true" aria-label="游戏帮助" tabIndex={-1}>
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
        {ownPlayGuide ? <><div className="guide-callout"><span>规则细节</span><p>{ownPlayGuide.mechanics}</p></div><div className="guide-callout"><span>实战例子</span><p>{ownPlayGuide.example}</p></div><div className="guide-callout guide-callout--quiet"><span>冒充与反制</span><p>{ownPlayGuide.bluff}</p></div></> : null}
        <div className="guide-callout guide-callout--quiet"><span>阵营目标</span><p>{roleTypeGuidance[ownRole.type as keyof typeof roleTypeGuidance]}</p></div>
      </div> : null}

      {activeMode === "tutorial" ? <div className="guide-tutorial">
        <p className="guide-step-count">规则 {step + 1} / {tutorialSteps.length}</p>
        <div className="guide-tutorial__symbol">{tutorialSteps[step]!.symbol}</div>
        <h1>{tutorialSteps[step]!.title}</h1>
        <p>{tutorialSteps[step]!.detail}</p>
        {tutorialSteps[step]!.points ? <ul className="tutorial__points">{tutorialSteps[step]!.points!.map((point) => <li key={point}>{point}</li>)}</ul> : null}
        {tutorialSteps[step]!.example ? <aside className="tutorial__example"><span>{tutorialSteps[step]!.example!.label}</span><p>{tutorialSteps[step]!.example!.text}</p></aside> : null}
        <div className="guide-tutorial__actions">
          <button type="button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>上一条</button>
          <button type="button" onClick={() => step === tutorialSteps.length - 1 ? setActiveMode("roles") : setStep((value) => value + 1)}>{step === tutorialSteps.length - 1 ? "继续看角色表" : "下一条"}</button>
        </div>
      </div> : null}

      {activeMode === "roles" ? <div className="role-compendium">
        <div className="role-compendium__intro"><div><p>暗流涌动 · 22 个角色</p><h1>{selectedRole ? selectedRole.name : "选择角色查看规则"}</h1></div>{selectedRole ? <button type="button" onClick={() => setSelectedRoleId(undefined)}>返回全部</button> : null}</div>
        {selectedRole ? <article className="role-detail">
          <div className="role-detail__portrait" role="img" aria-label={`${selectedRole.name}角色立绘`} style={{ backgroundImage: `url(${selectedRoleArt!.portraitUrl})`, backgroundPosition: selectedRoleArt!.portraitPosition }} />
          <div className="role-detail__copy"><p className={`role-alignment role-alignment--${selectedRole.type === "MINION" || selectedRole.type === "DEMON" ? "evil" : "good"}`}>{roleTypeNames[selectedRole.type]} · {roleTypeGuidance[selectedRole.type]}</p>
          <h2>能力</h2><p>{selectedRole.summary}</p>
          <h2>第一次玩</h2><p>{selectedRole.beginnerTip}</p>
          {selectedPlayGuide ? <><h2>规则细节</h2><p>{selectedPlayGuide.mechanics}</p><h2>怎么玩</h2><p>{selectedPlayGuide.play}</p><h2>实战例子</h2><p>{selectedPlayGuide.example}</p><h2>冒充与反制</h2><p>{selectedPlayGuide.bluff}</p></> : null}</div>
        </article> : <div className="role-groups">{(["TOWNSFOLK", "OUTSIDER", "MINION", "DEMON"] as const).map((type) => <section key={type}>
          <header><h2>{roleTypeNames[type]}</h2><span>{beginnerRoles.filter((role) => role.type === type).length}</span></header>
          <p>{roleTypeGuidance[type]}</p>
          <div>{beginnerRoles.filter((role) => role.type === type).map((role) => <RoleIndexButton key={role.id} role={role} onSelect={setSelectedRoleId} />)}</div>
        </section>)}</div>}
      </div> : null}
    </section>
  </div>;
}

function RoleIndexButton({ role, onSelect }: { role: (typeof beginnerRoles)[number]; onSelect: (roleId: string) => void }) {
  const art = roleArt(role.id);
  return <button type="button" onClick={() => onSelect(role.id)}><span className="role-index__portrait" role="img" aria-label={`${role.name}角色缩略立绘`} style={{ backgroundImage: `url(${art.portraitUrl})`, backgroundPosition: art.portraitPosition }} /><span className="role-index__copy"><strong>{role.name}</strong><small>{role.summary}</small></span></button>;
}
