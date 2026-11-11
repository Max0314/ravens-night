import {RoomPageShell} from "../components/RoomPage.js";
import { Button, Panel } from "@ravens/ui";
import { useState } from "react";
const tutorialSteps = [
  {symbol:"☾",title:"查看身份",detail:"每个人只看自己的身份，并亲自确认。夜晚按手机提示行动。"},
  {symbol:"☀",title:"讨论与提名",detail:"白天交换线索。存活玩家每天可提名一次，每人每天只可被提名一次。"},
  {symbol:"✋",title:"举手与鬼票",detail:"辩护后顺时针计票，轮到你之前可改手势。死者全局仅有一枚赞成票。"},
];

export function Tutorial({ onBack, onDone, busy = false, error, completeCount, total }: { onBack: () => void; onDone: () => void; busy?: boolean; error?: string; completeCount?: number; total?: number }) {
  const [step, setStep] = useState(0);
  const item = tutorialSteps[step]!;
  return <RoomPageShell title="开局教学" subtitle={`教学 ${step+1} / ${tutorialSteps.length}`} onBack={onBack} actions={<><div className="tutorial__actions"><Button variant="quiet" onClick={onDone} disabled={busy}>跳过教学</Button><Button disabled={busy} onClick={()=>step===tutorialSteps.length-1?onDone():setStep(value=>value+1)}>{busy?"正在提交…":step===tutorialSteps.length-1?"完成教学":"下一步"}</Button></div>{error?<p role="alert" className="form-error">{error}</p>:null}</>}><Panel className="tutorial__panel"><div className="tutorial__symbol">{item.symbol}</div><h1>{item.title}</h1><p>{item.detail}</p></Panel>{total?<p className="operation-status">{completeCount??0}/{total} 人已完成</p>:null}</RoomPageShell>;
}
