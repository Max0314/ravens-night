import { Button, Panel } from "@ravens/ui";
import { useState } from "react";

const steps = [
  ["两个阵营，一项使命", "善良要找出并处决恶魔；邪恶要保护恶魔，直到只剩两名存活玩家。"],
  ["夜晚看手机，白天看彼此", "夜间按手机提示秘密行动。天亮后放下手机，面对面讨论谁值得相信。"],
  ["死亡不是离场", "死亡后仍可讨论，但整局只剩一张幽灵票。选一个最关键的时刻使用它。"],
  ["信息可能并不可靠", "中毒、醉酒和角色能力会制造合理的错误信息。矛盾本身就是线索。"],
] as const;
export function Tutorial({ onDone }: { onDone: () => void }) { const [step, setStep] = useState(0); const item = steps[step]!; return <main className="center-page tutorial"><p className="tutorial__progress">教学 {step + 1} / {steps.length}</p><Panel className="tutorial__panel"><div className="tutorial__symbol">{["⚖", "☾", "✦", "? "][step]}</div><h1>{item[0]}</h1><p>{item[1]}</p><Button onClick={() => step === steps.length - 1 ? onDone() : setStep((value) => value + 1)}>{step === steps.length - 1 ? "查看我的身份" : "我明白了"}</Button></Panel></main>; }
