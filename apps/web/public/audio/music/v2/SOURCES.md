# 已确认游戏配乐 v2

唯一接入：`GameScoreOwner({screen: string, room?: RoomView | undefined})`来自`apps/web/src/components/GameScoreOwner.tsx`，由Root替换App唯一旧OpeningMusicOwner slot，不能同时保留两个owner。模块内部隔离80ms游戏时钟，不驱动首页/书本/整页重渲染。App、菜单/许可可见链接、部署由Root接入，本组不修改这些文件。

公开序列：M19既有`/audio/music/v1/lobby-m19.mp3`原字节与0.8基准音量保留，首页/创建/加入/教学/房间/身份/首夜不中断；第一DAWN公开startsAt起M15；第二夜NIGHT_FALLS(day1)起M18，第二DAWN起M15；第三夜NIGHT_FALLS(day2，首次入夜day0计1)起固定M19，后续昼夜不换。公开GAME_OVER事件到startsAt+该timingVersion结果偏移才依据GOOD淡入M01并连续到全员身份结算；EVIL用M19，已经M19则不重启；早于第三夜的EVIL此时才切M19。GAME_OVER phase或未知/预测winner不触发。历史记录/公开day/phase支持重连恢复，不读取本机role.alignment。

全曲使用每轨至多一个HTMLAudio，稳定owner缓存4个曲播放器，普通交叠2000ms、实际前景期间0.8→0.26于240ms调整，两个包络独立，重复playing/Promise确认不重开淡化。总静音、后台、MANUAL时间暂停、预览停正式播放；恢复同曲保留playhead；换房/下一把取消旧曲和过期请求。新曲未实际准备好前保留旧曲，拒绝播放/8秒未起播由全局音符状态提供重试；用户手势同栈play，晚到请求不恢复被取消的曲。DISPLAY/LOADING/LOGIN沿旧owner禁用，不自行新增投屏音乐。

私密配乐由独立`role-score.ts`附加，不重写物体roleAudioCues：7善良信息角色washerwoman/chef/investigator/librarian/empath/undertaker/ravenkeeper的IDENTITY或INFORMATION用M03原曲3秒处起4秒；fortune_teller同两类演出以及其合法ACTION_SUBMITTED/TARGET_SUBMITTED.action=DIVINE晶球提交演出用M22原曲0秒处4秒；其他主动提交及EVIL_START/ROLE_CHANGE不增加配乐。YES/NO、情报数字、候选/真假/席位不改变选曲。片段单声道、80ms淡入/末300ms淡出，不延长私密4秒轴。全部同master/private参与方式门控；独立music限额1，不挤掉洗衣水布/滴水或窃语。暂停offset续、跳过取消、离页/后台/线下静音全停。

`scoreDuckingActive()`只查询已经创建且当前时间实际覆盖的允许播放音源，预热/打开私密UI无声时为false；IN_PERSON不能仅因秘密界面打开改变本机背景。公开枪/钟/三式与投票已有音源可轻压背景，L02/L03/L04完整尾音仍按既有逻辑播放，不因配乐切换而剪掉。预览临时设置不写正式偏好且不压正式背景，返回恢复原正式状态。

源原件全部已在Git的`artifacts/audio-candidates-2026-11-12/music/`，只读取catalog固定SHA；完整候选URL/原件不改。运行复制的来源/作者/许可/原作品标题/加工/源及产物SHA在manifest.json。可见署名页`/audio/music/v2/credits.html`由Root链接到既有菜单，包含CC-BY-3.0 M01/M03/M22所需作品名、作者、原页、许可及改动说明；M15/M18及M19为既有CC0源。未接新外部播放器、付费API或服务端schema。

重建：`python scripts/build-game-score.py`（FFmpeg），只写新v2；署名/标题元数据可用`--credits-only`更新而不重编码声音。最终文件均严格解码检查；下表是最终MP3实测，不是手机听感验收。

| 编号 | 原题 | 输出秒 | 原件起始秒 | LUFS | 真峰dB |
| --- | --- | --- | --- | --- | --- |
| M01 | Moonlight Hall | 198.138776 | 0 | -19.26 | -4.03 |
| M15 | Unsolved Investigation | 48.0 | 0 | -20.13 | -8.55 |
| M18 | Dark Shrine Loop | 56.572517 | 0 | -19.86 | -5.37 |
| M03 | Comfortable Mystery | 4.0 | 3 | -24.15 | -12.6 |
| M22 | No More Magic | 4.0 | 0 | -31.03 | -19.5 |

两个私密短段解码估计合计1411200字节（约1.35MiB），M22/M03原曲约106/236秒均不整段解码；整首背景音乐只走HTMLAudio流式播放，不进入WebAudio缓存。仅目标代码/DOM/媒体数值核对，无浏览器、本地游戏/演示页面或实际试听；手机可听性和观感由正式环境人工验收。
