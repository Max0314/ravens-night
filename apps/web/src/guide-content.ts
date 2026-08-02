export const tutorialSteps = [
  { symbol: "⚖", title: "两个阵营，一项使命", detail: "善良要找出并处决恶魔；邪恶要保护恶魔，直到只剩两名存活玩家。" },
  { symbol: "♟", title: "系统就是隐形说书人", detail: "系统负责分发身份、保守秘密、按夜序收集行动、给出线索并结算死亡与胜负。你们只需按手机提示行动，并在白天面对面讨论。" },
  { symbol: "☾", title: "夜晚看手机，白天看彼此", detail: "夜间只看自己的手机，按提示秘密行动。白天放下手机，面对面讨论、说真话或巧妙伪装。" },
  { symbol: "✦", title: "死亡不是离场", detail: "死亡后仍可参与讨论，但不能提名，并且整局只剩一张幽灵票。把它留给最关键的一次投票。" },
  { symbol: "?", title: "信息可能并不可靠", detail: "中毒、醉酒和角色能力会制造合理的错误信息。信息矛盾不代表某个人一定在说谎。" },
  { symbol: "♜", title: "提名、投票与处决", detail: "存活玩家每天最多提名一次。所有玩家都要在手机上选择举手或不举手，最高且达到门槛者在日落时被处决；最高票平局则无人被处决。" },
  { symbol: "◎", title: "始终看“当前任务”", detail: "系统会在你的手机上显示现在是否需要行动、该选择谁或只需等待。角色表和教程可在游戏右上角随时打开。" },
] as const;

export const roleTypeNames = {
  TOWNSFOLK: "镇民",
  OUTSIDER: "外来者",
  MINION: "爪牙",
  DEMON: "恶魔",
} as const;

export const roleTypeGuidance = {
  TOWNSFOLK: "善良阵营。利用能力和讨论找出恶魔。",
  OUTSIDER: "善良阵营，但能力常带来限制或危险。",
  MINION: "邪恶阵营。制造假信息并保护恶魔。",
  DEMON: "邪恶核心。夜间杀人，并避免白天被处决。",
} as const;
