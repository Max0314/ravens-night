# 开场背景音乐 M19《短暂的人世》响度修订副本

同一份完整175.521秒录音，作者 Magdalen Kadel (Makemi)，由ceninan发布，CC0-1.0。已归档来源页：https://opengameart.org/content/breves-dies-hominis ；许可 https://creativecommons.org/publicdomain/zero/1.0/ 。固定输入是 `/audio-candidates/2026-11-12-v1/M19.mp3`，原件/候选文件不变，不取用新外部素材，不换曲目，不裁剪、变调或变速。

运行 `python scripts/build-lobby-music.py`（FFmpeg）重建；manifest记录输入/输出SHA、加工链和输出实测响度。原件约-29.26 LUFS，旧运行音量0.24额外衰减约12.4dB，首秒极轻；新副本使用-20 LUFS目标的动态响度处理，保留立体声/完整时长，50ms淡入，运行音量0.8。输出实测-20.73 LUFS、-2.44dBTP，不把处理目标当作实测数值。

播放器按实际媒体状态更新：play请求不等于扬声器已发声；暂停、缓冲、加载错误、8秒仍未开始均给出开启/重试入口，不阻断游戏。直接click/touchend/键盘手势可重试自动挂起的请求，切后台暂停，回来按偏好尝试继续。这里只完成离线媒体测量与代码/DOM验证，正式手机听感仍待用户验收。

2026-11-13范围调整：同一播放器需稳定挂在App入口公共层，从首页贯穿创建/加入/大厅/教学/身份确认和首夜，直到首个公开DAWN演出startsAt。`OpeningMusic`为`LobbyMusic`兼容别名，props为`active`、可选`fadeOut`、可选`ducked`。App负责用公开时钟/已公布进度给出首晨截止，不读个人身份确认。active跨上述入口保持true；fadeOut=true在800ms内从当前音量淡至0后暂停并保留播放进度，且不改变用户偏好；ducked=true在240ms内压到0.26（常态0.8）。返回菜单/下一把大厅可令fadeOut=false恢复同一进度。active=false或卸载是立即离页停止，不能与首晨fadeOut同时关掉active而期望保留淡出。App集成和发布事实由来源会话统一维护。

跨入口正式集成优先在App根层只调用一次 `useOpeningMusic(active, {fadeOut, ducked})`（`useLobbyMusic`为兼容别名）。返回`playing/starting/blocked/wanted/message/toggle/available`，各页面仅放置`OpeningMusicControl({controller,compact:true})`的44px内联控制；它不持有音源且无固定底部大面板，可随页面移动。`LobbyMusic`/`OpeningMusic`旧组件仍包装同一hook供兼容，但不要在每个页面各挂一个wrapper。已覆盖控制从HOME移动至CREATE/JOIN/LOBBY/FIRST_NIGHT仍保留同一音源/进度、首晨淡出、淡出后不复活、duck过渡中关闭重开恢复目标音量；这些是DOM/计时验证，不是正式手机视听验收。

2026-11-13最新统一开关约束（替代前述独立音乐/书声控制）：正式声音唯一偏好为`ravens_effects_audio`，无值默认on，显式off尊重；旧`ravens_lobby_music`/`ravens_book_audio`不再门控。`GlobalAudioButton`为唯一44px音符组件，统一控制M19、公开音效和翻页声，线下私密声音仍额外受`privateAudioAllowed`限制。总关闭后bookOwners的准备生命周期不能再次打开纸声；预览仍使用原有独立临时偏好，不写正式总偏好或发送正式音乐事件。

`useOpeningMusic(active,{fadeOut,ducked})`的播放范围/淡出/压低接口保留，wanted/toggle使用总偏好；`OpeningMusic`/`LobbyMusic`现在是无可见控件持续层。`OpeningMusicControl`/`LobbyMusicControl`仅兼容转为同一个GlobalAudioButton，原固定长按钮与CSS已移除。App根层稳定hook，页面头部放音符；手册打开时由App隐藏外层重复键，在手册头部使用同一组件。正式EventStage不再挂悬浮长开关，footer复用总音符，预览footer不重复设置。

开启总声音时，`enableEffectsAudio(true)`在第一个await之前同步调用WebAudio.resume，再发送`CustomEvent('ravens:global-audio',{detail:{enabled:true}})`，音乐监听器同栈HTMLAudio.play；false则同栈取消音效/暂停音乐。`GlobalAudioButton({className?,onEnable?})`可让手册在总开后同步`prepare(true)`预热/确认，prepare本身不会打开总开关。按钮表示声音偏好请求，播放器实际playing/blocked由hook媒体状态给出，不能把偏好on记为手机已出声。Root/Guide具体接入及手机验收由来源会话统一维护。
