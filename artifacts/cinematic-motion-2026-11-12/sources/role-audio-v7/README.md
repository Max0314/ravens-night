# 乌鸦与斜棺声音原件

本目录保存发布者未改动的真实鸟翼、门铰链FLAC和固定RPG归档wood-small原始WAV；sources.json记录每个SHA、作者、许可、下载页及归档成员。鸦鸣复用Git中已有A05原始OGG，按path引用，不复制或改写。全部CC0-1.0，运行加工说明及实测lead见apps/web/public/audio/effects/v7/SOURCES.md与manifest.json。

`python scripts/build-role-audio-v7.py`可离线重建6条声音与自动生成的TypeScript起音/峰值索引；依赖Python、NumPy、FFmpeg及既有v6 PCM工具。脚本不下载、不读取房间信息、不写旧音轨或动作时钟。鸟翼来自真实鸽子，作为乌鸦演出的材质；棺盖声来自门铰/木材拟音，来源不冒称棺材或乌鸦实录。
