# 公开提名与最后八秒声音

运行直接复用 `/audio-candidates/2026-11-12-v1/` 已归档完整MP3，不复制、裁短、变速或重新混音。manifest记录映射、原始/运行SHA、许可、来源、实际文件URL与ffprobe时长；既有候选与原件保持不变。

| 触发 | 文件 | 完整时长 | 来源/许可 |
| --- | --- | --- | --- |
| NOMINATION发起 | L03.mp3 · 第二式 | 16秒 | Marcelo Fernandez / marcelofg55，CC-BY-3.0 |
| VOTE_RESULT ON_BLOCK | L04.mp3 · 第三式 | 20秒 | 同上 |
| VOTE_RESULT NONE或TIED | L02.mp3 · 第一式 | 15秒 | 同上 |
| SIMULTANEOUS投票最终窗口 | A03.mp3 · 机械滴答 | 8秒 | bart，CC0-1.0 |

- Marcelo Fernandez / marcelofg55：[Dark Long Hits](https://opengameart.org/content/dark-long-hits)，[CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/)。候选包原有处理分别从源0/22/44秒取15/16/20秒、300ms收尾并归一化峰值，已完整保留；本轮未再剪辑。原件和运行副本SHA分别见manifest及候选包CREDITS.md。
- bart：[Ticking Clock](https://opengameart.org/content/ticking-clock)，[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)。本轮复用8秒MP3试听副本，未循环或拉伸。

`PublicNominationAudio`在稳定PlayerGame/Display父层唯一挂载，内部同时拥有重击和8秒音轨；不按小提示800/1200ms销毁，不阻断操作或下一合法提名。新重击起时将已在播旧尾降为非零增益，旧尾不剪断，也不受普通3声源上限截断。初始恢复的历史重击不会补播，静音/后台/暂停/离页可取消，恢复不重放过去的重击。

A03只读取公开SIMULTANEOUS ballotId/voteStartsAt/voteEndsAt；旧mode缺失不套用新时钟。8秒窗口按绝对时间映射到AudioContext，后加入/重连/暂停后按剩余offset恢复，不从头补8秒；截止以该轮权威end停止。presentationUntil未来时暂停并使用max(now,presentationUntil)，MANUAL暂停，epoch变化重新对齐当前轮，快进越过截止不补声。所有声音使用同一总开关和输出，不修改线上/线下私密许可；这些声音为公共反馈。

预览页仅将本地提名/结果时间轴扩为16/20/15秒，公共业务时序与提示寿命不变；顶部独立预览设置保留，暂停/seek从对应offset继续，不补过去的攻击点。来源会话负责业务挂载/发布与正式手机视听验收，本地只做代码、DOM和离线媒体数值检查。
