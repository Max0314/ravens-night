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

实时三式重击使用独立待播状态：首次实际对局快照中过去的事件只记历史；后续只接收当前白天/当天、最新序号的事件。`room-audio-delivery.ts`以实际接收边界区分历史恢复和活跃晚包：曾送过快照的WS断开，或无健康WS时room/me快照GET网络失败/超时/5xx，进入一次恢复；第一份恢复快照无论先来自HTTP轮询还是WS，都固化历史seq/ID基线。该基线通过WeakMap标记实际公共/私密game对象，不增加协议字段；同包两次观察不会提前消费，React未渲染中间公共基线时，下一私密快照中更大seq仍视为新事件。提名/投票命令成功ACK若先于恢复轮询到达，按请求发送前的seq识别其新NOMINATION/VOTE_RESULT，明确确认的本次重击不归为历史，其余恢复事件仍记入基线；请求绑定、幂等与重试行为不变。WS构造重试不反复重置HTTP基线，健康WS期间单次轮询失败及非快照接口失败也不抑制实时事件。初始快照/恢复基线内的历史不补攻击；同代实时晚包保持播放资格。缺少接收事实的旧调用才沿用对应完整音轨寿命的有限历史边界。

获准实时事件等待并发加载、解码和AudioContext真正恢复running，不再以500ms加载超时丢弃；成功安排播放后才记已开始，失败按1秒间隔重试。微信桥就绪或新手势可以重试解锁，resume Promise完成但仍interrupted/suspended时不误报已播放。更新的提名/结果、权威context变更（含撤回）、换天或进入夜晚取消尚未出声的旧事件；已排入未来的声源也属待播，实际开始的完整尾音继续保留。静音/后台/暂停/epoch切换/离页取消待播并保留去重，旧事件不会在恢复后补攻击。缺失game不建立历史基线，低revision不覆盖较新状态。

若恢复WS先广播本次新命令、ACK后到，确认事实仍可修正该事件的“恢复历史”分类（包括同revision但ACK的serverNow较早）；只有因恢复历史且当时允许发声而跳过的当前事件可获准一次，已经静音/暂停/换context取消的事件不会复活。确认ID保留在本地恢复基线上，中间回包未渲染也不丢失；较旧ACK只传确认事实，不倒退房间快照。

本地可复现故障时间线与回归：①事件startsAt=1000，快照2500才到，旧500ms年龄筛选直接吞掉；②及时接收后4个加载槽拥堵或解码延迟2.6秒，旧sampleAt先claim再按500ms丢弃，后续快照不能重试；③微信上下文interrupted时收到实时事件，旧allowed=false即永久seen，resume恢复也无声；④稳定owner在断线后收到10秒前未见L04，单靠放宽年龄会错误补攻击，现按真实恢复seq基线抑制。现有定向用例分别覆盖晚包+慢解码、四槽排队、实际statechange恢复、失败后重试、旧历史/低revision/过期天、待播跨轮与未来已排源取消、HTTP先恢复/公共私密双观察/未渲染基线/WS持续重试，复用通道设置/角色/翻书用例核对公共输出和权限边界；这些为本地代码与模拟AudioContext验证，手机微信实听由主会话统一验收。

A03只读取公开SIMULTANEOUS ballotId/voteStartsAt/voteEndsAt；旧mode缺失不套用新时钟。8秒窗口按绝对时间映射到AudioContext，后加入/重连/暂停后按剩余offset恢复，不从头补8秒；截止以该轮权威end停止。presentationUntil未来时暂停并使用max(now,presentationUntil)，MANUAL暂停，epoch变化重新对齐当前轮，快进越过截止不补声。所有声音使用同一总开关和输出，不修改线上/线下私密许可；这些声音为公共反馈。

预览页仅将本地提名/结果时间轴扩为16/20/15秒，公共业务时序与提示寿命不变；顶部独立预览设置保留，暂停/seek从对应offset继续，不补过去的攻击点。来源会话负责业务挂载/发布与正式手机视听验收，本地只做代码、DOM和离线媒体数值检查。
