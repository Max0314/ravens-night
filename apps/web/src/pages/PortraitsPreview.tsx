import { useState } from "react";
import { beginnerRoles } from "@ravens/content";
import { RolePortrait } from "@ravens/ui";
import { GuideOverlay } from "../components/GuideOverlay.js";
import { roleArt } from "../role-art.js";

const groups = [{ id: "ALL", label: "全部人物" }, { id: "TOWNSFOLK", label: "镇民" }, { id: "OUTSIDER", label: "外来者" }, { id: "MINION", label: "爪牙" }, { id: "DEMON", label: "恶魔" }];
export function PortraitsPreview() {
  const [group, setGroup] = useState("ALL");
  const [selected, setSelected] = useState<string>();
  const roles = beginnerRoles.filter((role) => group === "ALL" || role.type === group);
  return <main className="portrait-gallery">
    <header className="portrait-gallery__nav"><a href="/">☾ 鸦钟夜话</a><a href="?preview=effects">钟楼演出 ↗</a></header>
    <section className="portrait-gallery__intro"><p>RAVENS AT MIDNIGHT · THE TOWNSPEOPLE</p><h1>22 个角色<br />与能力说明</h1><div>点击角色，查看能力、规则和游玩建议。</div><span>角色图鉴</span></section>
    <nav className="portrait-gallery__filters" aria-label="人物类别">{groups.map((item) => <button key={item.id} type="button" aria-pressed={item.id === group} onClick={() => setGroup(item.id)}>{item.label}</button>)}<small>{roles.length} 位人物</small></nav>
    <div className="portrait-gallery__grid">{roles.map((role) => {
      const art = roleArt(role.id);
      return <button key={role.id} className="portrait-gallery__card" type="button" onClick={() => setSelected(role.id)} aria-label={`查看${role.name}`}>
        <RolePortrait url={art.portraitUrl} srcSet={art.portraitSrcSet} sizes="(max-width: 640px) 45vw, (max-width: 1000px) 30vw, 280px" label={`${role.name} A 版立绘`} loading="lazy" />
        <span><strong>{role.name}</strong><small>{groups.find((item) => item.id === role.type)?.label}</small></span>
      </button>;
    })}</div>
    <footer>按类别筛选角色，点击查看说明。<a href="/">返回钟楼 →</a></footer>
    {selected ? <GuideOverlay mode="roles" initialRoleId={selected} onClose={() => setSelected(undefined)} /> : null}
  </main>;
}
