# 清晨木门环境原件

本目录保存Joseph SARDIN的1703真实木门开启未改FLAC、固定Kenney CC0归档中的impactWood_light_001未改Ogg，sources.json给出作者/许可/源链接/下载及每个SHA。不同于此前棺盖原件3205；不改旧源或运行音轨。没有生成式声源或AI prompt；准确剪辑、滤波、包络、轻木层及响度处理在build-dawn-audio.py与运行manifest.layers记录。

`python scripts/build-dawn-audio.py`需要Python/NumPy/FFmpeg及v6 PCM工具，离线核对原件后生成唯一1.8秒环境轨与最终MP3实测onset索引；只写独立ambience/v1和dawn-audio.ts。动作接点由共享405b7d2提供，不改公共时序或Cine视觉。详细边界见apps/web/public/audio/ambience/v1/SOURCES.md。
