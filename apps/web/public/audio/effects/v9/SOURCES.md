# 提灯、烛焰与男爵马车材质声 v9

本组9轨只读动作共享合同237a314的recluse/saint/baron相位，不改美术、动作时钟、结果门槛或总时长。ROLE_CHANGE另按共享669b119的scarlet.wingStart+demon.flap/air/open读取原认可翼三轨，不含刀痕/斩击或原身份道具；scarlet身份介绍不加翼声。其他已认可翻页、M19、v1盾、v5斩击、投毒、My lord、配乐及公共提名轨未重编码。

来源：

- DenisChardonnet：[Small chain #1](https://bigsoundbank.com/small-chain-1-s0355.html)，发布者未改MP3，真实细金属链移动；取四段渐弱短摩擦作小提灯链摆，没有脚步或开门撞。
- Joseph SARDIN：[Squeaky wheelbarrow #4](https://bigsoundbank.com/squeaky-wheelbarrow-4-s2519.html)，发布者未改FLAC，真实独轮车滚动片段作马车轮短距离轻滚拟音，低通软化；不冒称木马车实录，没有马队/人声。
- Joseph SARDIN & Axeline T.：[Creaking Door #2](https://bigsoundbank.com/creaking-door-2-s3205.html)，复用v7原始FLAC，短门铰摩擦不加关门砰声。
- artisticdude：[RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)，复用v7原始wood-small.wav作轻车厢停稳。
- Joseph SARDIN：[Torn Paper #1](https://bigsoundbank.com/torn-paper-s0018.html)、[Pages that turn #6](https://bigsoundbank.com/pages-that-turn-6-s2213.html)，DavidGreck：[Turned Page](https://bigsoundbank.com/turned-page-s0164.html)，复用v6原始MP3；两段不同干纸裂作蜡封释放拟音（不伪称真实蜡录音），两份不同纸take作厚羊皮卷展开，无叮/成功音。
- AntumDeluge：[Fire Crackling](https://opengameart.org/content/fire-crackling)，复用既有A04原始OGG的固定350..3000ms片段，压低/滤波作小烛/提灯已燃火焰细响，不声称烛芯实录、不加三次点火或不真实翻书声。

以上录音均为CC0-1.0；[BigSoundBank许可](https://bigsoundbank.com/licenses.html)、[CC0](https://creativecommons.org/publicdomain/zero/1.0/)。两个新未改发布者文件在`artifacts/cinematic-motion-2026-11-12/sources/role-audio-v9/`；其余按已存Git路径原位引用。sources.json逐项列SHA/作者/源页/下载或原件路径，不依赖新电脑缓存。

重建：`python scripts/build-role-audio-v9.py`（Python、NumPy、FFmpeg及v6PCM工具），只读固定原件，输出本组MP3/manifest与自动生成role-audio-v9.ts；最终可寻址文件严格解码测量后对齐，来源加工如表及manifest.layers。无API/房间录音/玩家数据。

| 轨道 | 时长ms | 起音ms | 峰值ms |
| --- | --- | --- | --- |
| lamp-chain | 2650.0 | 6.553 | 64.694 |
| small-flame | 2650.0 | 20.998 | 2295.238 |
| carriage-roll | 500.0 | 6.644 | 45.057 |
| carriage-stop | 280.0 | 23.288 | 26.735 |
| carriage-hinge | 550.0 | 9.864 | 241.882 |
| contract-seal-1 | 200.0 | 5.193 | 18.118 |
| contract-seal-2 | 200.0 | 5.147 | 51.497 |
| contract-unroll-1 | 700.0 | 19.841 | 47.982 |
| contract-unroll-2 | 700.0 | 63.923 | 256.077 |

映射：隐士细链/低火起音对swing350，渐弱到约3000；圣徒只低火对flame350，不为650蜡泪制造硬撞。男爵轮声起音对arrive350、木停定峰对stop800、门铰起音对doorStart900，两封释放峰对seals1450/1650，纸起音对paperStart1550/1750并分别约700ms展开；不加无共享触点的额外灯链层，避免遮住真实卷纸。卷纸/链/低火是可按offset续的连续材质；封蜡/停定是过点不补的瞬态。马车只是开局契约道具，没有招人/外来者真值/成功语义；所有声音受master/private参与门控和预览隔离。

所有新URL为`/audio/effects/v9/<轨道>.mp3`；预览单轨已登记。没有本地游戏、演示、浏览器或实际试听，媒体/代码/DOM验证不代表手机真实听感。
