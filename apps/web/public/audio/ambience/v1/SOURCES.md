# 新版黎明画外木门环境声

只在DAWN v4读取动作会话共享合同405b7d2的`cinematicTiming.dawn.door`。这是画外清晨生活环境，不表示任何玩家、夜杀、保护、身份或结算真值，不读取outcome/resultVisible；旧版1/2/3不增加。公共6600ms时长、结果门槛和原两声悠长晨钟的素材/时钟不变。

来源原件：

- Joseph SARDIN：[Apartment Door, Opening #2](https://bigsoundbank.com/apartment-door-opening-2-s1703.html)，发布者未改FLAC，归类为真实木门开启。固定取原件1200..2500ms摩擦段，原音高/速度，温和收边、去低频轰鸣并保留生活化木纹，不复用棺盖/车门已加工轨或其原始3205门声。这里是木门录音的酒馆画外环境拟音，不冒称酒馆现场实录。
- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds)，固定Git归档SHA中的`Audio/impactWood_light_001.ogg`未改原始Ogg，取前240ms以低权重放在片段1350ms作轻木落定，不是重拍/棺盖/炮声。原归档License.txt确认CC0。
- 两份原件均在`artifacts/cinematic-motion-2026-11-12/sources/dawn-audio-v1/`，逐文件作者/源页/下载或归档成员/SHA见sources.json。许可[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)，另见[BigSoundBank许可](https://bigsoundbank.com/licenses.html)。无欢呼、语音、通用叮或新增旋律；没有AI声源生成，故无生成prompt，全部加工由脚本可重建。

重建：`python scripts/build-dawn-audio.py`，需要Python/NumPy/FFmpeg及已审v6 PCM工具。仅读取固定SHA原件，写本组独立`/audio/ambience/v1/dawn-door.mp3`、manifest及`dawn-audio.ts`实测索引，不下载或覆盖旧轨。先包络/滤波/温和软饱和再增益限制，从最终可寻址MP3严格解码测量。

输出1800.0ms，29718字节，解码317520字节；起音122.834ms、峰值727.664ms、RMS -25.45dBFS、峰值-15.37dBFS。运行以shared door减实测起音调度，使可闻起音落在3000ms；clip内轻落定约在随后1350ms，并在黎明视觉结束前自然收尾。

运行只加独立ambient:dawn-door样本路由与本cue，音量0.5；环境声不触发现有前景压钟逻辑，两声晨钟不会被本声降增益或剪源，正常材质源上限也不统计晨钟。按事件id取消只停本DAWN的环境/钟，不取消nomination/ballot owner尾音；未改EventStage，Root已修的跳过event scope保持。晚到START不补开门，RESUME按真实offset续尾，SEEK越过不补；master/后台/preview沿现有public音效语义。预览直接通过原DAWN场景播放，无新增UI或单轨按钮。

有限验证覆盖最终媒体/源SHA、共享3000ms起音、v4双晨钟完整且不压钟、旧版无门声、late/seek/resume、事件取消/独立提名尾音和master/隔离preview。无本地游戏/试听页/浏览器或实际试听，不代表手机听感验收；Root配套新黎明视觉后合并部署。
