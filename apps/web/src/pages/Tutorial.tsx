import { Button, Panel } from "@ravens/ui";
import { useState } from "react";
import { tutorialSteps } from "../guide-content.js";

export function Tutorial({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const item = tutorialSteps[step]!;
  return <main className="center-page tutorial">
    <button className="screen-back" type="button" onClick={onBack}>← 返回首页</button>
    <p className="tutorial__progress">教学 {step + 1} / {tutorialSteps.length}</p>
    <Panel className="tutorial__panel">
      <div className="tutorial__symbol">{item.symbol}</div><h1>{item.title}</h1><p>{item.detail}</p>
      {item.points ? <ul className="tutorial__points">{item.points.map((point) => <li key={point}>{point}</li>)}</ul> : null}
      {item.example ? <aside className="tutorial__example"><span>{item.example.label}</span><p>{item.example.text}</p></aside> : null}
      <div className="tutorial__actions">
        {step > 0
          ? <Button variant="quiet" onClick={() => setStep((value) => value - 1)}>上一步</Button>
          : <Button variant="quiet" onClick={onDone}>跳过教程，查看身份</Button>}
        <Button onClick={() => step === tutorialSteps.length - 1 ? onDone() : setStep((value) => value + 1)}>{step === tutorialSteps.length - 1 ? "查看我的身份" : "我明白了"}</Button>
      </div>
      {step === 0 ? <small className="tutorial__skip-note">跳过后，游戏中仍可随时打开教程和角色表。</small> : null}
    </Panel>
  </main>;
}
