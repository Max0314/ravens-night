# 其余物件细节声音 v8

本组9轨用于权杖单次落定、士兵盾牌单次金属接触、披风展开与衣角迟滞、酒杯液体轻荡、共情者固定低脉冲，以及议事文书/花朵丝带细擦。无新背景乐或演出配乐；不实施M22/M03/M01/M18/M15等讨论项。没有玩家、数字、阵营、真假或成功结果数据输入。僧侣认可v1盾、翻页、M19、slash、投毒、My lord与公共提名稿未覆盖。

来源：

- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)，已归档固定SHA的CC0包中impactWood_heavy_001、impactMetal_heavy_000、impactMetal_light_001原始OGG，新增提取原件保留，归档内License.txt核对CC0。
- artisticdude：[RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)，复用v6已存Git的cloth/cloth-heavy原始WAV，不复制原件。低增益衣角声与重布声使用不同take。
- Joseph SARDIN：[Serving Wine #1](https://bigsoundbank.com/serving-wine-1-s1721.html)，未改发布者FLAC，实际倒酒入杯录音的两个不同液体片段，作为杯摆液荡的拟音材料，不冒称独立旋杯实录，不含杯碰或新合成气泡。[BigSoundBank许可](https://bigsoundbank.com/licenses.html)，[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)。
- 纸张复用v6 Joseph SARDIN的[Pages that turn #6](https://bigsoundbank.com/pages-that-turn-6-s2213.html)未改MP3原件，衣角/丝带采用不同轻布加工；不添加花瓣硬撞或成功提示。
- 共情者低脉冲为本项目代码原创，含安静上分音；无旋律，不声称真实心脏录音，不根据信息数字改变脉冲数量/音高/位置。

固定原件和SHA/作者/许可/归档成员见`artifacts/cinematic-motion-2026-11-12/sources/role-audio-v8/sources.json`。`python scripts/build-role-audio-v8.py`离线重建运行MP3与`role-audio-v8.ts`；需要Python/NumPy/FFmpeg及v6PCM工具，仅读取原件并核对SHA、只写本组v8文件。最终MP3严格解码后的起音/峰值：

| 轨道 | 时长ms | 起音ms | 峰值ms |
| --- | --- | --- | --- |
| scepter-contact | 340.658 | 5.17 | 10.816 |
| soldier-shield | 800.0 | 5.193 | 16.803 |
| cloak-unfold | 1100.0 | 64.989 | 225.488 |
| cloak-hem | 550.0 | 31.315 | 179.433 |
| cup-sway-left | 470.0 | 39.501 | 338.027 |
| cup-sway-right | 470.0 | 7.891 | 155.079 |
| empath-pulse | 220.0 | 8.095 | 22.744 |
| mayor-document | 600.0 | 18.798 | 397.415 |
| flower-ribbon | 420.0 | 25.125 | 138.594 |

映射只读共享动作合同3c17ac4：权杖峰值对mayor.contact850、文书起音对document1050；士兵峰值对armor.contact700，无1700ms多余甲撞；酒液两段起音对drunk.lean900/return1900，不撞杯或加气泡；披风/衣角起音对scarlet.start650/open1750，ROLE_CHANGE优先使用同披风，不泄露接任者旧道具；处女丝带对flower.ribbon950，无旧523Hz叮声。共情者同一短低脉冲峰值按left650、left+echoDelay820、right1050、right+echoDelay1220固定四次，回声略轻，不根据情报数字变化。近距脉冲最多两层重叠，不触发3源剪裁；过点的瞬态不补，连续衣料/纸/酒液按offset恢复。所有声音仍走master/private门控与预览隔离。

新URL为`/audio/effects/v8/<轨道>.mp3`。媒体数值/代码/DOM验证不代表手机听感验收，未打开本地游戏、演示或试听页面。背景乐新讨论仍由Root确认后另行实施。
