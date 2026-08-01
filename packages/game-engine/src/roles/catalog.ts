import type { RoleType } from "../types.js";

export type ActionKind = "NONE" | "SELECT_ONE" | "SELECT_TWO" | "PUBLIC_SELECT_ONE" | "INFORMATION";

export interface RoleDefinition {
  id: string;
  name: string;
  type: RoleType;
  summary: string;
  beginnerTip: string;
  action: ActionKind;
  firstNightOrder?: number;
  otherNightOrder?: number;
}

export const ROLE_CATALOG: RoleDefinition[] = [
  { id: "washerwoman", name: "洗衣妇", type: "TOWNSFOLK", summary: "首夜得知两名玩家中有一位是指定镇民。", beginnerTip: "先记录两人的发言，不必立即公开全部线索。", action: "INFORMATION", firstNightOrder: 30 },
  { id: "librarian", name: "图书管理员", type: "TOWNSFOLK", summary: "首夜得知两名玩家中有一位是指定外来者。", beginnerTip: "外来者仍属善良，但能力可能带来麻烦。", action: "INFORMATION", firstNightOrder: 31 },
  { id: "investigator", name: "调查员", type: "TOWNSFOLK", summary: "首夜得知两名玩家中有一位是指定爪牙。", beginnerTip: "你的线索很强，也可能因此成为邪恶目标。", action: "INFORMATION", firstNightOrder: 32 },
  { id: "chef", name: "厨师", type: "TOWNSFOLK", summary: "首夜得知相邻邪恶玩家对的数量。", beginnerTip: "座位首尾也相邻，死亡不会改变原始邻座。", action: "INFORMATION", firstNightOrder: 33 },
  { id: "empath", name: "共情者", type: "TOWNSFOLK", summary: "每夜得知仍存活的最近邻中邪恶玩家数量。", beginnerTip: "邻座死亡后继续向外寻找最近存活玩家。", action: "INFORMATION", firstNightOrder: 40, otherNightOrder: 60 },
  { id: "fortune_teller", name: "占卜师", type: "TOWNSFOLK", summary: "每夜选择两人，得知其中是否包含恶魔或红鲱鱼。", beginnerTip: "一名善良红鲱鱼也会得到肯定结果。", action: "SELECT_TWO", firstNightOrder: 41, otherNightOrder: 61 },
  { id: "undertaker", name: "送葬者", type: "TOWNSFOLK", summary: "每夜得知当天被处决玩家的真实角色。", beginnerTip: "只有处决才会触发，其他死亡不会提供信息。", action: "INFORMATION", otherNightOrder: 62 },
  { id: "monk", name: "僧侣", type: "TOWNSFOLK", summary: "每夜选择另一名玩家，使其免受恶魔杀害。", beginnerTip: "不能保护自己，保护只针对恶魔的攻击。", action: "SELECT_ONE", otherNightOrder: 40 },
  { id: "ravenkeeper", name: "守鸦人", type: "TOWNSFOLK", summary: "若夜间死亡，可选择一名玩家并得知其角色。", beginnerTip: "适当伪装成强信息角色，可能引诱恶魔攻击。", action: "SELECT_ONE", otherNightOrder: 80 },
  { id: "virgin", name: "处女", type: "TOWNSFOLK", summary: "首次被镇民提名时，提名者立即被处决。", beginnerTip: "谨慎选择何时邀请可信玩家验证你的能力。", action: "NONE" },
  { id: "slayer", name: "猎魔人", type: "TOWNSFOLK", summary: "整局一次公开选择玩家，若为恶魔则其死亡。", beginnerTip: "能力公开且仅一次，先听取足够信息再使用。", action: "PUBLIC_SELECT_ONE" },
  { id: "soldier", name: "士兵", type: "TOWNSFOLK", summary: "恶魔的夜间攻击无法杀死你。", beginnerTip: "其他死亡来源仍然有效，不要过早暴露身份。", action: "NONE" },
  { id: "mayor", name: "镇长", type: "TOWNSFOLK", summary: "三人存活且白天无人处决时，善良获胜。", beginnerTip: "恶魔攻击你时可能改为另一名玩家死亡。", action: "NONE" },
  { id: "butler", name: "管家", type: "OUTSIDER", summary: "每夜选择主人，只有主人投票时你的票才有效。", beginnerTip: "你仍可举手，但系统只在主人举手时计票。", action: "SELECT_ONE", firstNightOrder: 50, otherNightOrder: 50 },
  { id: "drunk", name: "酒鬼", type: "OUTSIDER", summary: "你以为自己是某镇民，但实际能力始终无效。", beginnerTip: "界面不会告诉你是酒鬼，你收到的信息可能不可靠。", action: "NONE" },
  { id: "recluse", name: "隐士", type: "OUTSIDER", summary: "你可能被能力登记为邪恶、爪牙或恶魔。", beginnerTip: "矛盾查验不一定说明查验者或你在说谎。", action: "NONE" },
  { id: "saint", name: "圣徒", type: "OUTSIDER", summary: "若你因处决而死，邪恶阵营立即获胜。", beginnerTip: "避免被处决，同时解释为何邪恶可能冒充你。", action: "NONE" },
  { id: "poisoner", name: "投毒者", type: "MINION", summary: "每夜选择一人，使其能力失效直到次日黄昏。", beginnerTip: "持续干扰同一人稳定，轮换目标更难被识别。", action: "SELECT_ONE", firstNightOrder: 10, otherNightOrder: 10 },
  { id: "spy", name: "间谍", type: "MINION", summary: "每夜查看全部身份，并可能被登记为善良或镇民。", beginnerTip: "利用完整信息构造可信的善良身份与发言。", action: "INFORMATION", firstNightOrder: 90, otherNightOrder: 90 },
  { id: "scarlet_woman", name: "猩红女郎", type: "MINION", summary: "五人以上存活时恶魔死亡，你会接替成为恶魔。", beginnerTip: "接替发生后要迅速调整伪装和夜间目标。", action: "NONE" },
  { id: "baron", name: "男爵", type: "MINION", summary: "开局增加两名外来者并减少两名镇民。", beginnerTip: "角色配置变化能帮助邪恶制造身份冲突。", action: "NONE" },
  { id: "imp", name: "小恶魔", type: "DEMON", summary: "每夜选择一人死亡；选择自己时爪牙接替恶魔。", beginnerTip: "利用三个不在场善良角色作为安全伪装。", action: "SELECT_ONE", otherNightOrder: 30 },
];

export function rolesByType(type: RoleType): RoleDefinition[] {
  return ROLE_CATALOG.filter((role) => role.type === type);
}

export function roleById(roleId: string): RoleDefinition {
  const role = ROLE_CATALOG.find((candidate) => candidate.id === roleId);
  if (!role) throw new Error(`Unknown role ${roleId}`);
  return role;
}
