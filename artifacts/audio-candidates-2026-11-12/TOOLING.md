# 音频分析工具与本轮执行记录

## 已安装并实际运行

| 项目 | 版本／来源 | 用途 |
| --- | --- | --- |
| LAION CLAP | [GitHub](https://github.com/LAION-AI/CLAP)；[公开权重](https://huggingface.co/laion/clap-htsat-unfused) | 音频与文字的相似度、材质与音乐倾向辅助筛选 |
| Hugging Face Transformers | 4.57.1；[GitHub](https://github.com/huggingface/transformers) | 运行CLAP公开权重，未安装原仓库的训练环境 |
| PyTorch CPU | 2.9.1+cpu；[GitHub](https://github.com/pytorch/pytorch) | 本地推理，不需要GPU |
| librosa | 0.11.0；[GitHub](https://github.com/librosa/librosa) | 抽样频谱重心、平坦度、能量起伏和音乐速度估计 |
| SoundFile | 0.13.1；[GitHub](https://github.com/bastibe/python-soundfile) | 音频依赖与读取支持 |
| FFmpeg / ffprobe | 本机已有9.0.1 | 全文件解码、时长、声道、LUFS与真峰值，转码和混音输出 |
| py7zr | 1.0.0 | 解开作者发布的7z拟音包 |

插件管理目录查找了音频／音乐相关能力，返回的Descript、fal等偏编辑或生成。本轮采用可本地运行、无需连接外部账户的上述开源工具，没有安装或声称连接这些云插件。

安装包版本详见 [requirements-installed.txt](tools/requirements-installed.txt)。这是本轮独立工具环境的快照，不是游戏依赖清单；没有修改package.json、锁文件或应用环境。

## 本机位置与复用

为避免把模型加入项目资源，使用以下本机布局（不构成团队环境规范）：

- Python环境：用户目录下 `.codex/tools/ravens-night-audio/venv/`。
- CLAP模型：项目 `outputs/audio-tools/models/clap-htsat-unfused/`，该outputs目录原已被Git忽略。
- 下载源包缓存：用户目录下 `.codex/tools/ravens-night-audio/source-cache/`。
- 交付候选：本文件所在目录，音频、中文说明、许可和分析结果均在这里。

安装曾因D盘空间不足中断，随后在独立环境安装成功；为了分配两盘空间，模型最终放在项目已忽略的outputs目录。只移动了本轮创建的工具／模型，没有清理其他项目或全局缓存。

模型固定revision：`8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`。权重SHA256见 [verification.json](verification.json)。原CLAP项目与此Transformers权重的许可分别以各自发布页为准；该权重页面标明Apache-2.0，librosa使用ISC许可。模型和安装包未复制进可提交的候选目录。

重新分析（PowerShell，在项目根目录执行）：

```powershell
$audioPython = Join-Path $env:USERPROFILE '.codex/tools/ravens-night-audio/venv/Scripts/python.exe'
& $audioPython -X utf8 artifacts/audio-candidates-2026-11-12/tools/analyze_audio.py
& $audioPython -X utf8 artifacts/audio-candidates-2026-11-12/tools/write_catalog.py
```

analyze_audio.py只为音频哈希变化或新增条目重新分析；未变化结果复用。若模型放在其他位置，传入`--model <模型目录>`；write_catalog.py的权重快照记录当前约定位置。生成组合使用build_candidates.py，需保留源缓存；它会更新本目录的衍生候选，不会接入游戏。

研究和下载脚本记录了本轮来源选择。collect_sources.py会重新建立基础清单，不能在最终清单上直接运行，否则会覆盖后续组合的清单条目；从源重建时应按基础收集、替代音乐收集、组合生成、补充音乐收集、分析、写目录的顺序操作。本轮遇到的网络失败已记录，联网重跑不保证所有研究曲目可下载。

## 实际分析方式

1. ffprobe读取所有55个文件的格式、时长、采样率与声道。
2. FFmpeg对完整文件运行loudnorm分析，记录原始综合响度、响度范围、真峰值。分析输出丢弃，不偷偷改写原始配乐。
3. 长文件取三个最多10秒的片段，短文件取完整或有限片段；起点逐文件保存。CLAP输出文本与音频的余弦相似度，保留全部候选提示词、前五标签及各片段首标签。
4. librosa在这些抽样片段上计算频谱和能量特征，音乐另有速度估计。速度可能是半拍／倍拍，不作为准确拍号或艺术结论。
5. 首版男声与动作组合的模型结果促使本轮调整了男声选择、接触层配比和布料撕开层。修改后只重新分析音频哈希变化的条目。

交付核对另检查了55条文件与清单一一对应、哈希与分析保持一致、试听页JavaScript可解析。仅对本地试听HTML运行了Chromium检查：55条展示、12首音乐分类、F13搜索，以及F13/D04/M23/M18四项MP3／OGG元数据加载通过，无页面脚本错误。没有打开游戏页面；这也不代表浏览器已经进行艺术试听或真机听感验收。

音频模型不是艺术裁判：例如中世纪独唱可能被提示为“合唱”，普通古典配乐可能匹配“圆舞曲”，湿润瞬态可能匹配“枪声”。这些差异保留在文档里，没有用文件名代替分析，也没有用模型标签代替真实表演的来源记录。

**本轮完成的是素材准备、机器辅助筛选与可试听交付，尚无逐条人工听感验收。** 场景配乐、循环接缝、手机扬声器质感以及死亡／撕裂是否符合用户审美，需要在后续试听讨论中确定；当前没有改动或发布游戏。
