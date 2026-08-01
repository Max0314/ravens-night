import { Button, Panel } from "@ravens/ui";
import { useState } from "react";
import { tutorialSteps } from "../guide-content.js";

export function Tutorial({ onDone }: { onDone: () => void }) { const [step, setStep] = useState(0); const item = tutorialSteps[step]!; return <main className="center-page tutorial"><p className="tutorial__progress">教学 {step + 1} / {tutorialSteps.length}</p><Panel className="tutorial__panel"><div className="tutorial__symbol">{item.symbol}</div><h1>{item.title}</h1><p>{item.detail}</p><Button onClick={() => step === tutorialSteps.length - 1 ? onDone() : setStep((value) => value + 1)}>{step === tutorialSteps.length - 1 ? "查看我的身份" : "我明白了"}</Button></Panel></main>; }
