import { useEffect, useState } from "react";
import { Button, SeatRing } from "@ravens/ui";
import type { ExperienceEvent } from "@ravens/contracts";
import type { GameView } from "../api.js";
import { EventStage, type PrivateReceipt } from "../components/EventStage.js";
import { effectsAudioEnabled, enableEffectsAudio } from "../components/experience-audio.js";

const previewSeats = ["阿德里安", "伊芙琳", "卢卡斯", "奥莉薇亚", "爱德华", "维奥拉"].map((nickname, index) => ({ seat: index + 1, nickname, connected: true, alive: true, ghostVoteAvailable: true }));
const scenarios: Array<{ kind: ExperienceEvent['kind']; outcome?: ExperienceEvent['outcome']; label: string; detail: string; message: string }> = [
  { kind: "SHOT", outcome: "DEATH", label: "猎魔人 · 枪击命中", detail: "拔枪 → 瞄准 → 击发 → 座位倒下", message: "阿德里安向卢卡斯发动猎魔人能力。卢卡斯死亡。" },
  { kind: "SHOT", outcome: "NO_DEATH", label: "猎魔人 · 无人死亡", detail: "相同的宣称演出，保留身份秘密", message: "阿德里安向卢卡斯发动猎魔人能力。无人死亡。" },
  { kind: "EXECUTION", outcome: "DEATH", label: "处决 · 判决落下", detail: "钟声 → 机械落刃 → 烛火熄灭", message: "卢卡斯被处决并死亡。" },
  { kind: "EXECUTION", outcome: "NO_DEATH", label: "处决 · 无人死亡", detail: "公布处决，保留存活状态", message: "卢卡斯被处决，但仍然存活。" },
  { kind: "DAWN", outcome: "DEATH", label: "黎明 · 死者揭晓", detail: "晨光入窗 → 熄灭的蜡烛 → 死者姓名", message: "天亮了。昨夜死亡：卢卡斯（3号）。" },
  { kind: "DAWN", outcome: "NO_DEATH", label: "黎明 · 平安之夜", detail: "温暖晨光与仍亮着的烛火", message: "天亮了。昨夜无人死亡。" },
  { kind: "NOMINATION", label: "提名 · 公开指控", detail: "提名令牌浮现，邀请被提名者辩护", message: "阿德里安提名卢卡斯。请先陈述理由并听取辩护。" },
  { kind: "VOTE_RESULT", outcome: "TIED", label: "投票 · 最高票平票", detail: "票数封印与清晰的处决席状态", message: "本轮 3 票，与最高票持平。当前无人将被处决。" },
  { kind: "NIGHT_FALLS", label: "入夜 · 闭眼", detail: "夜幕收拢，私密行动即将开始", message: "夜幕降临。请闭眼，等待自己的行动。" },
  { kind: "GAME_OVER", outcome: "GOOD", label: "终局 · 善良获胜", detail: "城镇迎来最终的黎明", message: "恶魔已死亡。善良阵营获胜。" },
];

export function EffectsPreview() {
  const [event, setEvent] = useState<ExperienceEvent>();
  const [receipt, setReceipt] = useState<PrivateReceipt>();
  const [sound, setSound] = useState(effectsAudioEnabled);
  useEffect(() => { const sync = () => setSound(effectsAudioEnabled()); window.addEventListener("ravens-effects-audio", sync); return () => window.removeEventListener("ravens-effects-audio", sync); }, []);
  function play(scenario: typeof scenarios[number]) {
    if (sound) void enableEffectsAudio();
    const now = Date.now();
    setEvent({ id: crypto.randomUUID(), gameId: "effects-preview", seq: now, kind: scenario.kind, message: scenario.message, occurredAt: now, startsAt: now + 180, durationMs: scenario.kind === "SHOT" || scenario.kind === "EXECUTION" ? 4_500 : scenario.kind === "NIGHT_FALLS" ? 2_000 : 5_000, actorSeat: 1, targetSeat: 3, seats: scenario.outcome === "DEATH" ? [3] : [], day: 2, votes: 3, threshold: 3, ...(scenario.outcome ? { outcome: scenario.outcome } : {}) });
  }
  const game: GameView = { gameId: "effects-preview", phase: "DAY_DISCUSSION", day: 2, seats: previewSeats, events: event ? [event] : [], aliveCount: 6, readyCount: 0 };
  return <main className="effects-preview"><header><a href="/">☾ 鸦钟夜话</a><span>体验研究室 · 公开预览</span></header><section className="effects-preview__intro"><p>THE THEATRE OF RAVENS</p><h1>让每个决定，<br />都被钟楼记住。</h1><div><span>全员同场演出</span><span>身份始终保密</span><span>手机独立可玩</span></div><p>枪声、判决与黎明共享同一套演出。下毒、守护与查验，仅属于自己的屏幕。</p><label><input type="checkbox" checked={sound} onChange={(change) => { setSound(change.target.checked); void enableEffectsAudio(change.target.checked); }} /> 启用演出音效</label></section><section className="effects-preview__scenarios" aria-label="特效演出目录">{scenarios.map((scenario) => <button key={`${scenario.kind}-${scenario.outcome}`} onClick={() => play(scenario)}><span>{scenario.kind === "SHOT" ? "⌁" : scenario.kind === "DAWN" ? "☀" : scenario.kind === "EXECUTION" ? "⚜" : "☾"}</span><strong>{scenario.label}</strong><small>{scenario.detail}</small><b>播放演出 ↗</b></button>)}</section><section className="effects-preview__private"><p>ONLY YOU KNOW</p><h2>私密行动，一场无声的仪式。</h2><div>{([['POISON', '下毒 · 倾下毒液'], ['PROTECT', '守护 · 点亮烛火'], ['DIVINE', '占卜 · 向星辰提问']] as const).map(([kind, label]) => <Button key={kind} variant="quiet" onClick={() => { setEvent(undefined); setReceipt({ id: crypto.randomUUID(), kind, target: "3号 卢卡斯" }); }}>{label}</Button>)}</div><small>私密演出默认无声音，避免向身旁玩家暴露夜间行动。</small></section><section className="effects-preview__town"><p>公开城镇 · 无需大屏</p><SeatRing seats={previewSeats} /></section><EventStage game={game} {...(receipt ? { receipt } : {})} preview /></main>;
}
