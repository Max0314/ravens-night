const portraits = {
  baron:'男爵',butler:'管家',chef:'厨师',drunk:'酒鬼',empath:'共情者',fortune_teller:'占卜师',imp:'小恶魔',investigator:'调查员',
  librarian:'图书管理员',mayor:'镇长',monk:'僧侣',poisoner:'投毒者',ravenkeeper:'守鸦人',recluse:'隐士',saint:'圣徒',
  scarlet_woman:'猩红女郎',slayer:'猎魔人',soldier:'士兵',spy:'间谍',undertaker:'送葬者',virgin:'处女',washerwoman:'洗衣妇',
};

const sounds = {
  'blood-impact':'血滴击落','bone-crack':'骨裂','butler':'管家动作','butler-voice':'管家问候',
  'carriage-hinge':'马车车门','carriage-roll':'马车车轮','carriage-stop':'马车停稳',
  'cloak-hem':'披风衣角','cloak-unfold':'披风展开','coffin-hinge':'棺盖铰链','coffin-open':'开棺','coffin-settle':'棺盖落定',
  'crystal-resonance':'水晶球共鸣','crystal-shiver':'水晶球轻颤','cup-sway-left':'酒杯向左晃动','cup-sway-right':'酒杯向右晃动',
  'dawn-bell':'黎明钟声','dawn-door':'酒馆木门','demon':'恶魔攻击','empath-pulse':'共情者脉动',
  'envelope-draw':'抽出信纸','envelope-flap':'翻开信封','envelope-seal':'拆开封蜡','evil':'邪恶胜利','flower-ribbon':'花簇丝带',
  'glass':'玻璃碎裂','glass-hit':'玻璃受击','glass-shards':'玻璃飞溅','good':'善良胜利',
  'guillotine-blade':'断头台闸刀','guillotine-impact':'断头台落定','guillotine-tension':'断头台拉紧','guillotine-unlock':'断头台释放','guillotine-wind':'空刑台晚风',
  'gun-cock':'枪击前上膛','impact':'重物落地','investigator-evidence':'调查证物','investigator-lens':'放大镜扫查','lamp-chain':'提灯细链',
  'mayor-document':'镇长展开文书','night-bell':'入夜钟声','nomination':'提名提示','poison':'毒剂','poison-bottle':'毒瓶触碰',
  'poison-bubbles':'毒剂气泡','poison-cork':'拔开毒瓶','poison-pour':'倒出毒剂','raven-feathers':'鸦羽拂动','raven-short-call':'短鸦鸣',
  'raven-wing-fold':'乌鸦收翼','raven-wing-open':'乌鸦起翼','scepter-contact':'权杖落定','scream':'惊叫','shield':'钢盾防护','shot':'猎枪击发',
  'slash-left':'左侧撕裂','slash-right':'右侧撕裂','small-flame':'烛火低响','soldier-shield':'士兵盾面受力',
  'ui-close':'关闭面板','ui-error':'操作提示','ui-open':'打开面板','ui-press':'按钮轻触','ui-select':'确认选择','ui-success':'操作成功',
  'vote-stamp':'投票落印','washer-dip':'布料入水','washer-drops':'衣料滴水','washer-scrub':'搓洗布料','washer-whisper':'洗衣房低语',
  'wing-air':'恶魔翅风','wing-flap':'恶魔振翅','wing-root':'恶魔展翼',
};

const variants = {
  'chef-chop':'厨师落刀','contract-seal':'契约封蜡','contract-unroll':'契约展卷','cough':'咳嗽',
  'hurt-night':'夜间受击','hurt-shot':'枪击受伤','paper-lift':'提起书页','paper-turn':'纸张翻页',
};

export function runtimeEffectTitle(id) {
  if (id.startsWith('role-') && portraits[id.slice(5)]) return `${portraits[id.slice(5)]} · 角色出场`;
  const variant = /^(.*)-([1-9])$/.exec(id);
  return sounds[id] ?? (variant && variants[variant[1]] ? `${variants[variant[1]]} · ${variant[2]}` : undefined);
}
