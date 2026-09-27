import { useState } from "react";
import { Button } from "./Button.js";

export interface RoleCardProps {
  name: string;
  alignment: string;
  ability: string;
  portraitUrl: string;
  portraitPosition?: string;
  beginnerTip?: string;
}

export function RoleCard({ name, alignment, ability, portraitUrl, portraitPosition = "50% 50%", beginnerTip }: RoleCardProps) {
  const [covered, setCovered] = useState(false);
  if (covered) {
    return (
      <article className="rn-role-card rn-role-card--covered" aria-label="身份已遮住">
        <div className="rn-role-card__seal" aria-hidden="true">☾</div>
        <p>身份已遮住</p>
        <Button variant="quiet" onClick={() => setCovered(false)} aria-label="显示身份">显示身份</Button>
      </article>
    );
  }
  return (
    <article className="rn-role-card">
      <div className="rn-role-card__portrait-wrap">
        <RolePortrait className="rn-role-card__portrait" label={`${name}角色立绘`} url={portraitUrl} position={portraitPosition} />
        <div className="rn-role-card__fade" />
      </div>
      <div className="rn-role-card__copy">
        <p className="rn-role-card__alignment">{alignment}</p>
        <h2>{name}</h2>
        <p className="rn-role-card__ability">{ability}</p>
        {beginnerTip ? <p className="rn-role-card__tip">新手提示：{beginnerTip}</p> : null}
        <Button variant="quiet" onClick={() => setCovered(true)} aria-label="遮住身份">遮住身份</Button>
      </div>
    </article>
  );
}

/** The source atlas is 1500 × 844 (3 × 2). SVG crops without stretching faces. */
export function RolePortrait({ url, position = "50% 50%", label, className }: { url: string; position?: string; label: string; className?: string }) {
  const [x = 50, y = 50] = position.split(" ").map(parseFloat);
  return <svg {...(className ? { className } : {})} role="img" aria-label={label} viewBox={`${x * 10} ${y * 4.22} 500 422`} preserveAspectRatio="xMidYMid slice"><image href={url} width="1500" height="844" /></svg>;
}
