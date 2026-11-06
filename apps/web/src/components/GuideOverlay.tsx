import { useBackLayer } from "../use-back-layer.js";
import { beginnerRoles } from "@ravens/content";
import { RolePortrait } from "@ravens/ui";
import { useEffect, useRef, useState } from "react";
import type { PrivateView } from "../api.js";
import { rolePlayGuides, roleTypeGuidance, roleTypeNames, tutorialSteps } from "../guide-content.js";
import { roleArt } from "../role-art.js";

export type GuideMode = "tutorial" | "roles" | "mine";

export function GuideOverlay({ mode, ownRole, initialRoleId, onClose }: { mode: GuideMode; ownRole?: PrivateView["role"]; initialRoleId?: string; onClose: () => void }) {
  const [activeMode, setActiveMode] = useState<GuideMode>(mode);
  const [step, setStep] = useState(0);
  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>(initialRoleId);
  const [filter, setFilter] = useState("ALL");
  const selectedRef = useRef(selectedRoleId); selectedRef.current = selectedRoleId;
  const gridRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const scroll = useRef(0);
  const filtered = beginnerRoles.filter(role => filter === "ALL" || role.type === filter);
  function selectRole(id: string) { scroll.current = dialogRef.current?.scrollTop ?? 0; setSelectedRoleId(id); }
  function closeDetail() { const id=selectedRef.current; setSelectedRoleId(undefined); requestAnimationFrame(() => { if (dialogRef.current) dialogRef.current.scrollTop = scroll.current; gridRef.current?.querySelector<HTMLButtonElement>(`[data-role-id="${id}"]`)?.focus({preventScroll:true}); }); }
  const closeDetailRef = useRef(closeDetail); closeDetailRef.current = closeDetail;
  useEffect(() => { if (selectedRoleId) detailRef.current?.focus(); }, [selectedRoleId]);
  useBackLayer(true,onClose);
  useBackLayer(Boolean(selectedRoleId),closeDetail);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (selectedRef.current) closeDetailRef.current(); else closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element=>!element.closest('[hidden]'));
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      previousFocus?.focus();
    };
  }, []);

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
        <div hidden={Boolean(selectedRole)} ref={gridRef}>
          <label className="role-filter">角色类型<select value={filter} onChange={event => setFilter(event.target.value)}><option value="ALL">全部角色</option>{(["TOWNSFOLK","OUTSIDER","MINION","DEMON"] as const).map(type => <option key={type} value={type}>{roleTypeNames[type]}</option>)}</select></label>
          <div className="role-grid">{filtered.map(role => <RoleIndexButton key={role.id} role={role} onSelect={selectRole}/>)}</div>
        </div>
        {selectedRole ? <article className="role-detail" ref={detailRef} tabIndex={-1} aria-label={`${selectedRole.name}详情`}>
          <header className="role-detail-nav"><button type="button" onClick={closeDetail}>返回角色表</button><strong>{selectedRole.name}</strong><span>{roleTypeNames[selectedRole.type]}</span></header>
          <RolePortrait className="role-detail__portrait" label={`${selectedRole.name}角色立绘`} url={selectedRoleArt!.portraitUrl} srcSet={selectedRoleArt!.portraitSrcSet} sizes="(max-width: 820px) 90vw, 390px" position={selectedRoleArt!.portraitPosition} />
          <div className="role-detail__copy"><h2>能力</h2><p>{selectedRole.summary}</p><h2>第一次玩</h2><p>{selectedRole.beginnerTip}</p>{selectedPlayGuide ? <><h2>规则细节</h2><p>{selectedPlayGuide.mechanics}</p><h2>怎么玩</h2><p>{selectedPlayGuide.play}</p><h2>实战例子</h2><p>{selectedPlayGuide.example}</p><h2>冒充与反制</h2><p>{selectedPlayGuide.bluff}</p></> : null}</div>
          <footer className="role-detail-nav"><button type="button" disabled={filtered.findIndex(r=>r.id===selectedRole.id)<=0} onClick={()=>setSelectedRoleId(filtered[filtered.findIndex(r=>r.id===selectedRole.id)-1]!.id)}>上一位</button><button type="button" disabled={filtered.findIndex(r=>r.id===selectedRole.id)>=filtered.length-1} onClick={()=>setSelectedRoleId(filtered[filtered.findIndex(r=>r.id===selectedRole.id)+1]!.id)}>下一位</button></footer>
        </article> : null}
      </div> : null}
    </section>
  </div>;
}

function RoleIndexButton({ role, onSelect }: { role: (typeof beginnerRoles)[number]; onSelect: (roleId: string) => void }) {
  const art = roleArt(role.id);
  return <button type="button" data-role-id={role.id} onClick={() => onSelect(role.id)}><RolePortrait className="role-index__portrait" label={`${role.name}角色缩略立绘`} url={art.thumbnailUrl} loading="lazy" position={art.portraitPosition} /><span className="role-index__copy"><strong>{role.name}</strong><small aria-label={roleTypeNames[role.type]} className={`role-type-dot role-type-dot--${role.type.toLowerCase()}`}>●</small></span></button>;
}
