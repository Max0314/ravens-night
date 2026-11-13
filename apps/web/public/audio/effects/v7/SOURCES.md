# 守鸦人/送葬者材质声 v7

6条新轨，复用共享动作合同14cad8a；只读raven与coffin字段，不改动作、总时长或1900ms情报门槛。所有轨均受正式master与private参与方式门控；预览单轨仍与正式偏好隔离。短鸣固定，不读取玩家、真实角色、死亡或revealed值，不表示能力成功。

来源及未改动原件：

- Joseph SARDIN：[Flight of a Pigeon](https://bigsoundbank.com/flight-of-a-pigeon-s0840.html)，实际鸽子从枝头起飞的录音。使用两个不同片段作为守鸦人起翼/收翼，加轻微持续羽毛/气流层；是实际鸟翼材料，不声称是乌鸦实录。
- Joseph SARDIN & Axeline T.：[Creaking Door #2](https://bigsoundbank.com/creaking-door-2-s3205.html)，真实开门铰链摩擦，用作斜棺木盖长边开盖拟音，不声称录自棺材。
- artisticdude：[RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)，固定归档SHA的inventory/wood-small.wav。降调、低通和两次强衰减反射表现木盖落稳，尾部600ms内消退。
- IgnasD：[Crows singing](https://opengameart.org/content/crows-singing)，复用Git中既有A05原始OGG的固定600ms片段，不重复存档或覆盖完整候选。短鸣取固定1580..2180ms片段，所有描述符相同。

录音许可均为[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)，另见[BigSoundBank许可](https://bigsoundbank.com/licenses.html)。新下载2个FLAC及归档提取的原始WAV在`artifacts/cinematic-motion-2026-11-12/sources/role-audio-v7/`，A05原件按sources.json路径原位引用；逐文件SHA、作者、下载页及归档成员可追溯。

重建：`python scripts/build-role-audio-v7.py`，需要Python/NumPy/FFmpeg。离线读取固定原件SHA，复用v6已审PCM工具，不调用v6生成主函数。最终可寻址MP3严格解码测量，生成`role-audio-v7.ts`；未重新生成认可翻页、M19、盾、slash、投毒、My lord或公共提名/投票轨。

| 轨道 | 时长ms | 起音ms | 峰值ms |
| --- | --- | --- | --- |
| raven-wing-open | 420.0 | 12.2 | 300.408 |
| raven-wing-fold | 480.0 | 6.077 | 102.381 |
| raven-feathers | 1150.454 | 9.297 | 148.503 |
| raven-short-call | 600.0 | 9.456 | 159.887 |
| coffin-hinge | 1060.0 | 18.73 | 284.626 |
| coffin-settle | 600.0 | 26.168 | 33.084 |

接点：短鸣起音对raven.attention；起翼/羽毛起音对flapStart，收翼起音对spread；棺铰起音对coffin.start，落定峰值对coffin.open。新URL均为`/audio/effects/v7/<轨道>.mp3`，合计75490字节、解码约743KiB。连续材质按offset恢复；落定瞬态越过接点不补播。媒体/代码/DOM验证不代表真机听感验收，未打开本地页面或实际试听。
