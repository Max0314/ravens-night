# 角色声音第一组原件

本目录保存8个未改动的发布者源文件：2个FLAC、3个WAV、3个MP3，以及逐文件来源/许可/SHA索引。原始声源为固定公开CC0材料，不来自房间录音或玩家信息。`sources.json`为验证准源；运行混音/层/加工参数与实测接触偏移见 `apps/web/public/audio/effects/v6/manifest.json`。

重建命令：`python scripts/build-role-audio-v6.py`（Python、NumPy、FFmpeg）。脚本核对每个源SHA后生成11条新轨，严格解码失败即停止，不写已认可的旧轨。窃语为固定反向颗粒处理而非语音识别/合成API；水晶共鸣/细颤为代码原创合成，源码即其可重建原件。详细作者/许可链接见运行SOURCES.md。

这批声音对应独立动作会话共享contact第一组；美术原图和几何不由此脚本生成或修改。未运行本地页面、浏览器或实际试听，手机听感另行验收。
