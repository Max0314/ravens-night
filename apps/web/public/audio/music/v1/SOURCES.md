# 开场背景音乐 M19《短暂的人世》响度修订副本

同一份完整175.521秒录音，作者 Magdalen Kadel (Makemi)，由ceninan发布，CC0-1.0。已归档来源页：https://opengameart.org/content/breves-dies-hominis ；许可 https://creativecommons.org/publicdomain/zero/1.0/ 。固定输入是 `/audio-candidates/2026-11-12-v1/M19.mp3`，原件/候选文件不变，不取用新外部素材，不换曲目，不裁剪、变调或变速。

运行 `python scripts/build-lobby-music.py`（FFmpeg）重建；manifest记录输入/输出SHA、加工链和输出实测响度。原件约-29.26 LUFS，旧运行音量0.24额外衰减约12.4dB，首秒极轻；新副本使用-20 LUFS目标的动态响度处理，保留立体声/完整时长，50ms淡入，运行音量0.8。输出实测-20.73 LUFS、-2.44dBTP，不把处理目标当作实测数值。

播放器按实际媒体状态更新：play请求不等于扬声器已发声；暂停、缓冲、加载错误、8秒仍未开始均给出开启/重试入口，不阻断游戏。直接click/touchend/键盘手势可重试自动挂起的请求，切后台暂停，回来按偏好尝试继续。这里只完成离线媒体测量与代码/DOM验证，正式手机听感仍待用户验收。

2026-11-13范围调整：同一播放器需稳定挂在App入口公共层，从首页贯穿创建/加入/大厅/教学/身份确认和首夜，直到首个公开DAWN演出startsAt。`OpeningMusic`为`LobbyMusic`兼容别名，props为`active`、可选`fadeOut`、可选`ducked`。App负责用公开时钟/已公布进度给出首晨截止，不读个人身份确认。active跨上述入口保持true；fadeOut=true在800ms内从当前音量淡至0后暂停并保留播放进度，且不改变用户偏好；ducked=true在240ms内压到0.26（常态0.8）。返回菜单/下一把大厅可令fadeOut=false恢复同一进度。active=false或卸载是立即离页停止，不能与首晨fadeOut同时关掉active而期望保留淡出。App集成和发布事实由来源会话统一维护。

跨入口正式集成优先在App根层只调用一次 `useOpeningMusic(active, {fadeOut, ducked})`（`useLobbyMusic`为兼容别名）。返回`playing/starting/blocked/wanted/message/toggle/available`，各页面仅放置`OpeningMusicControl({controller,compact:true})`的44px内联控制；它不持有音源且无固定底部大面板，可随页面移动。`LobbyMusic`/`OpeningMusic`旧组件仍包装同一hook供兼容，但不要在每个页面各挂一个wrapper。已覆盖控制从HOME移动至CREATE/JOIN/LOBBY/FIRST_NIGHT仍保留同一音源/进度、首晨淡出、淡出后不复活、duck过渡中关闭重开恢复目标音量；这些是DOM/计时验证，不是正式手机视听验收。
