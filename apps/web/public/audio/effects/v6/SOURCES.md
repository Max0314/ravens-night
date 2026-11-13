# 角色细节声音 · 第一组 v6

11条新轨；原声与未改动发布者下载保存在 `artifacts/cinematic-motion-2026-11-12/sources/role-audio-v6/`，源索引记录每个文件SHA/作者/许可/下载页。运行原翻页、M19、僧侣v1盾、v5左右撕裂、投毒v4与My lord未覆盖。公共提名/投票声音稿不改。

来源：

- Joseph SARDIN & Axeline T.：[Whisper #1](https://bigsoundbank.com/whisper-1-s3255.html)，未改动FLAC。
- Joseph SARDIN：[Drops of water #1](https://bigsoundbank.com/drops-of-water-1-s1384.html)，未改动FLAC；[Torn Paper #1](https://bigsoundbank.com/torn-paper-s0018.html)、[Pages that turn #6](https://bigsoundbank.com/pages-that-turn-6-s2213.html)，未改动发布者MP3。
- DavidGreck：[Turned Page](https://bigsoundbank.com/turned-page-s0164.html)，未改动发布者MP3。此为原始源副本，未改已认可的运行翻页音轨。
- artisticdude：[RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)，固定SHA归档中cloth/cloth-heavy/bottle原始WAV。
- 上述录音均按发布者CC0-1.0使用，[BigSoundBank许可](https://bigsoundbank.com/licenses.html)、[CC0](https://creativecommons.org/publicdomain/zero/1.0/)。两条水晶声音为项目原创的确定性低频/玻璃式分音合成，不伪称实录或真实法术。

耳语只使用固定录音的反向130ms颗粒、叠层与滤波，破坏原词语顺序；生成器无玩家名、席位、角色/阵营或游戏数据入口，不配真假候选或占卜YES/NO差异。拆封声是录制纸撕裂的拟音，不伪称真实蜡封现场录音；翻盖与抽信为不同原始纸张录音。镜缘/证物为细摩擦，替代旧印章撞击主题。

重建：在仓库运行 `python scripts/build-role-audio-v6.py`，需NumPy和FFmpeg。仅读取已归档源、仅写v6新轨/manifest与自动生成 `role-audio-v6.ts` 实测索引，无下载、付费API或秘密。先滤波，再按记录的RMS/峰值与软饱和处理，最终从可寻址MP3文件解码测量（不以未去编码器padding的pipe测量当作接触偏移）。

| 新轨 | 时长ms | 起音ms | 峰值ms |
| --- | --- | --- | --- |
| washer-dip | 500.0 | 32.313 | 69.977 |
| washer-scrub | 720.0 | 19.887 | 104.558 |
| washer-drops | 1200.0 | 43.424 | 46.054 |
| washer-whisper | 1600.0 | 14.422 | 145.85 |
| crystal-resonance | 2700.0 | 18.118 | 291.542 |
| crystal-shiver | 1250.0 | 12.336 | 370.59 |
| investigator-lens | 800.0 | 34.83 | 233.855 |
| investigator-evidence | 400.0 | 18.481 | 44.989 |
| envelope-seal | 220.0 | 5.964 | 44.989 |
| envelope-flap | 600.0 | 46.032 | 180.181 |
| envelope-draw | 700.0 | 16.893 | 293.9 |

映射共用动作合同 `65e05a882cd2bd8754005b1d8e09fde36818f62c` 的envelope/investigator/crystal/washer字段：拆封峰对seal，其余起音对各移动起点；不复制动作时钟常量。每条运行URL为 `/audio/effects/v6/<新轨>.mp3`。低共鸣和玻璃细颤慢起，不增加通用“叮”或真假识别音。所有角色声音仍走master/private参与方式/预览隔离；连续尾音恢复从offset继续，短瞬态过点不补。单轨试听已纳入既有预览目录。本地仅媒体数值/代码/DOM验证，不代表正式手机听感验收。
