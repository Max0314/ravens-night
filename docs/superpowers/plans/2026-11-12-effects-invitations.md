# 2026-11-12 动效、提名与邀请恢复完整实施方案

状态：两位独立 review 复审通过，实施中；用户本轮授权实施、提交合并推送及独立部署。验证约束：不打开本地游戏或演示页面，不运行有头/无头浏览器。本文的 DOM、音频文件及接口检查不代替微信真机视觉/听感验收。

## 1. 目标、范围与准源

覆盖：独立动效演示页、枪击/处决/投毒/管家/僧人/恶魔动作与分层音效、善恶胜利、非阻塞提名与合法枪击、游客随机资料、失效邀请、房主跨房切换。保留已认可首页、固定圆桌、手册位置、角色隐私和权威结果发布节奏。加入时提供“线上加入/线下加入”，仅设置本设备私密音效默认值，创建也提供同一入口；不恢复房间级三种玩法，不新增语音服务。

以 GitHub Ravens Night main 7aa5606 为开发基线。2026-11-12 01:13 UTC 实际读取 ops main 964c0ba2357810506ba4d9e883d217f377ea0615；发布前再读。只更新本游戏，不修改中央账号、路由、依赖版本或数据库表。Slayer 官方说明允许白天任意时点发动；Monk 官方说明被保护导致无人死亡时不公开原因。参考：https://wiki.bloodontheclocktower.com/Slayer 、https://wiki.bloodontheclocktower.com/Monk 。

## 2. 模块职责与实现边界

| 模块 | 职责 |
| --- | --- |
| contracts/experience-timing | 版本3演出时长、结果发布时间及音效cue；保留1/2解释器 |
| rooms/service、presentation | 新局使用v3；公开投影定时发布；提名不产生阻塞演出锁；枪击/处决仍在结果点发布死亡；暂停后续计票直至枪击演出完毕 |
| EventStage + 新effects-art/CSS | 真实与演示共用场景；根据公开结果决定血迹/死亡；私密回执只表达提交成功；读取中不夺焦点 |
| experience-audio + participation-audio | 原始/授权素材解码与分层调度；总开关与本机参与方式；过时cue不补播，失焦/隐藏/跳过停止 |
| EffectsPreview | 合成无网络玩家与事件；场景、分支、回放、暂停、速度、进度和声音测试；不写任何真实房间 |
| Join/Create/RoomTools | 本机线上/线下切换；游客随机；稳定的状态反馈与内部滚动 |
| App + invitation/session helper | 有效邀请优先、失效邀请清理、原房主房间候选、换房确认与完成后更新URL/席位；不按昵称认定房主 |
| app join/switch ticket + service | 原房主凭据授权关闭；在一个 runtime.execute/repository.commit 中加入新房并删除旧房；持久化失败全部回滚 |

主代理负责集成与文档；独立 review 分别核对前端演出/音频和后端投影/换房权限。并行修改须分开文件范围，不同时修改App或同一service。

## 3. 数据模型、接口与配置

### 3.1 演出兼容

PresentationVersion、GameRuntime.presentationVersion、ExperienceEvent.timingVersion 扩展为1|2|3。新开局使用3；现存局保持原值，历史事件不重写。快照4保持，HTTP/WS协议升级5：旧请求返回426，旧WS拒绝并提示刷新；客户端不把v3解释成v1。协议握手、API headers、ws URL和所有协议相关类型/夹具同批更新。回退限制见§9。

v3时序（毫秒；从startsAt计算）：

| kind | 总时长 | 结果点 | 关键cue |
| --- | ---: | ---: | --- |
| SHOT | 2600 | 850 | 200机械、850枪击+玻璃、结果到达后同一事件死亡短叫、1650余响 |
| EXECUTION | 2800 | 1000 | 180刑架、1000绳索/冲击；有目标且死亡才血迹/短叫；无目标只有风 |
| NOMINATION | 800 | 0 | 120短促宣告；视觉非模态，不能遮操作 |
| VOTE_RESULT | 1200 | 0 | 120票印；非模态 |
| NIGHT_FALLS | 3600 | 0 | 300低钟；保留可读过场 |
| DAWN | 4200 | 1400 | 300黎明、1400死亡揭晓/无死亡；不公布被保护原因 |
| GAME_OVER | 5200 | 900 | 900阵营揭晓，后续阵营分支声音/翼碎/火声；直到end后才解密结算角色 |
| NOTICE | 0 | 0 | 无 |

新v3阻塞事件交付lead为250ms（1/2仍1500ms）；v3非阻塞NOMINATION/VOTE_RESULT的startsAt=occurredAt，业务公开状态在同一提交同步，不设交付lead；客户端只以服务端startsAt定位，不用本地按钮时间确认结果。最早前置安全投影可公开actor/target，结果字段/死亡/胜利/角色解密点仍由publication控制。SHOT/EXECUTION/DAWN在结果未到时禁止渲染死亡或使用结果分支音效；数据稍晚到时不补播已经过去的重击，已显示结论用轻量变化。

PrivateReceipt.kind增加BUTLER、DEMON，已有POISON/PROTECT/DIVINE/SEALED兼容；targetSeats只来自本人实际提交，目标名称用已有playerLabel。无success/poisoned/protected等真值字段，不把实际结算成败传给私密动画。旧SEALED仍正常显示。私密演出2300ms（恶魔3000ms），App不在演出结束前清receipt；重新连接不补演旧回执。

### 3.2 本机音效偏好

localStorage新增ravens_participation_audio_v1={version:1,mode:'ONLINE'|'IN_PERSON'}；ONLINE允许私密声音，IN_PERSON禁止。无记录默认IN_PERSON，损坏记录也回IN_PERSON；存储失败本页内存生效。保留ravens_effects_audio总开关：实际播放=总开关开启且浏览器已被用户手势解锁；私密还要求ONLINE。选择任一模式只修改mode；ONLINE同一手势中尝试解锁AudioContext，但绝不改已有总开关。创建/加入同时提供独立“开启演出音效”开关，关闭时显示“演出音效已关闭”；无偏好仍默认总音效关闭、IN_PERSON。局内菜单的模式切换立即取消已排私密音源，公开音源不受模式变化影响。模式属设备偏好，不上传、不写房间、不同玩家可各自选择。

新增共用ParticipationAudioChoice，创建/加入表单和局内菜单展示两选项及一行“仅影响私密动作音效”；不传旧RoomPlayMode参数，不改变邀请链接语义。

### 3.3 房间摘要与换房接口

GET /api/rooms/:code/summary增量返回roomInstanceId、state、canJoin及已有占用头像/人数。不返回身份/账号/凭据。404为明确失效；403/429/5xx/网络错误不能当成销毁。

POST /api/rooms/:source/switch-ticket：PLAYER授权来源房间，body={sourceRoomInstanceId,targetCode,targetRoomInstanceId}。校验来源实例、当前房主（最初创建者若已被接任无销毁权限）、可信账号与来源座位，读取目标实例存在且不同房间。签发5分钟HMAC票据，绑定sourceCode/instance/hostId/hostTokenHash、targetCode/instance、accountDigest或GUEST、issuedAt/expiresAt/nonce。返回{switchTicket,expiresAt,source:{code,roomInstanceId,state,activeHumanCount,playerCount}}。票据不持久化、不记录日志，不修改座位或版本；使用同源Origin和既有账户核验、限流。

POST /api/rooms/:target/join增量可选switchTicket，mode必须PLAYER。正常加入规则/头像/昵称/资料版本/原席恢复不变。在同一次runtime.execute中：校验票据签名和绑定→验证当前source实例和房主仍一致→在target恢复原本人席或正常加入（包含替换人机）→校验所有步骤成功→删除source并清理其任务/邀请/在线连接投影→把转移回执写入target metadata→一个repository.commit(changed,[source])完成。失败不改两房、不消耗票据、不清理本地原席位。成功返回已有join结果并附closedRoomCode，设置target路径Cookie；来源Cookie按原路径清理。

所有join成功分支（目标原Cookie、账号席位、已用joinTicket、新入座）先得到统一{participant,token}，再执行switch finalize；禁止early return跳过删房/写回执。

幂等记录写target.metadata.joinTransfers，以hash(switchTicket+joinTicket)为key，值含source/target实例、源actor散列、target participantId、账号绑定及请求fingerprint（完整资料/模式/票据散列）、expiresAt。另记录credentialKind=NEW_GUEST_TICKET|EXISTING_GUEST_COOKIE|ACCOUNT、targetCredentialHash与accountId绑定，禁止保存明文token。签名/结构/实例解析与新提交期限校验分开：NEW_GUEST_TICKET用原签名joinTicket推导token并比对当前hash；EXISTING_GUEST_COOKIE必须仍携带目标路径原Cookie并匹配当前hash，丢失则要求恢复座位；ACCOUNT要求当前可信sub及确定性token仍匹配当前hash。已提交重放不再调用join、同步资料或删房。响应丢失后，同一原ticket+原资料重试：先检查已提交回执（可接受票据刚过期的已提交重放），校验目标原参与者仍有效、账号及ticket签名/凭据绑定，再恢复原结果。参数变化409 COMMAND_ID_REUSED，目标席已移除403，目标实例已换409，不再次关闭新来源或加入第二席。回执恢复期24小时，只清理已到期记录；最多256条且均未到期时返回JOIN_TRANSFER_CAPACITY/429并保留两房，不驱逐仍有效回执。源已不存在且无本次已提交回执时返回SOURCE_ROOM_GONE，调用方清理过期源候选后按正常加入重新确认；源房主已变409HOST_CHANGED，保留旧房，不擅自降级销毁。

前端switch-ticket请求走来源URL以携带来源HttpOnly Cookie；join走目标URL以复用目标Cookie，杜绝跨路径凭据遗漏。API成员命令拦截对只读签票路由独立处理。切号清理票据和待恢复意图，晚到响应按已有generation规则丢弃。

## 4. 动画、音频与演示页

### 4.1 视觉

黑金为底、暗红为伤害、酸绿为毒液、银金为保护。冲击前短蓄势，冲击帧集中发力，尾部快速衰减。枪击死亡/未死亡均有屏幕弹孔和玻璃碎裂；只有公开DEATH分支出现头像喷血/倒下/惨叫，NO_DEATH不出现暗示真实原因的护盾。处决区分死亡、存活、无人被处决，后者空刑架风吹不生成未定义头像。下毒屏幕边缘腐蚀绿泡、药瓶破裂；管家西装剪影向主人鞠躬；僧人钢盾合拢；恶魔红翼展开后左右两次斜抓。夜间目标头像的爪痕仅行动者看见且文案为“选择已提交”，不表示实际死亡；对方屏幕不播放。实际死者只在公开黎明揭晓时显示血痕，不新增杀手/保护/醉毒原因。

善良胜利：恶魔轮廓受击、残翼崩裂、暗雾退去和晨光。邪恶胜利：燃烧城镇、灰烬、巨大恶魔双翼遮天。字幕使用权威winReason，不把镇长胜利等都写为恶魔被杀；只在winner发布后选分支，不提前暴露结算角色。保留稳定“跳过”入口；完成后显示既有城镇式复盘。

用imagegen生成透明恶魔/左右翼素材、西装管家，以及恶魔占据燃烧城镇背景，落入public/art/effects/v1并保存提示词/来源清单；不替换既有主页资产。玻璃、弹孔、抓痕、血迹、泡泡、盾牌用可控SVG/CSS叠层。最多24泡/30碎片/28血滴，透明粒子层pointer-events:none；强烈晃动限短程、不用频闪。减少动态效果时取消晃动/粒子/大幅旋转，保留静态结果与短渐变；音效仍遵循用户开关。

### 4.2 音频

同源静态素材，预解码缓存，分公共/私密gain总线；耳机左右声像仅作空间感，不作为信息。真实材质采用可核验CC0资源（Kenney Impact Sounds，TinyWorlds Glass Break，CC0男声受击包），每个使用文件记录作者、源页、下载地址、许可与SHA256；加工/混音为本项目生成，不引用影视原声。My lord使用本地可用语音合成后降调/共鸣加工成低男声，不模仿特定演员，生成结果存WAV；生成人声资产失败则必须报告并处理，不能以字幕假充音效。

枪声高频瞬态+低频冲击+玻璃；死亡另短叫。投毒玻璃+液体+泡泡；护盾金属展开与落定；管家衣料+My lord；恶魔展翼+两次撕裂+血浆/骨裂层，私密提交不播放代表确认死亡的目标惨叫；死亡惨叫留到实际公开死亡。善良胜利明亮和弦/钟声+翼碎；邪恶低音/火/远哀嚎。所有混音峰值<=-1dBFS，单cue有上限，单事件音源并发受控，避免手机破音。

基础cue与outcome cue分开，死亡短叫仅首次收到公开DEATH时触发，且now-resultAt在[0,500]ms内；超过500ms不补播。outcome/结果发布状态加入调度依赖，key分别使用base/outcome前缀。基础枪声/玻璃预排不依赖outcome；所有cue按event id+cue id去重；重连晚到不补枪声；未知结果不抢播死亡；切后台/静音/跳过/切离线停止相关源；取消尚未resume的异步音频，失败静默保持页面可用并在演示页显示未解锁/加载失败状态。冻结暂停音源并在恢复时仅排未来cue，不重新播放冲击。声音组件卸载释放节点，不复用被stop的source。

### 4.3 演示页

保留/?preview=effects，无需API/登录/房间；合成6位有头像玩家，全部状态仅本页内存。场景包含枪击死亡/无人死亡、处决死亡/存活/空刑架、提名、最高票/平票/未达标、天亮死亡/无人死亡、天黑、POISON/PROTECT/BUTLER/DEMON/DIVINE、GOOD/EVIL胜利。默认使用v3统一时序，可选旧版作比较。播放会先停止旧动画/声音并产生唯一id；可重播、暂停/继续、0.5x/1x速度、拖动进度、返回目录。EventStage增加可选playback={now,paused,rate,epoch}：真实对局无该参数时仍用useGameClock；演示用{anchorElapsed,anchorPerformance,rate,paused}积分驱动，定位/变速递增epoch、取消本场未来源并按(cueAt-elapsed)/rate重排。公开、私密场景和receipt到期都用该时钟，不另设真实setTimeout；向后拖动不重播已过cue，只有重播新id重置。暂停和拖动定位同步视觉；进度拖到已过cue不补播，慢放预览明确声音按同一逻辑cue点调度。固定工具栏和返回按钮，目录内部滚动，遵守全局不整页滚动和安全区；不做第二份真实动效实现。

## 5. 非阻塞提名与行动

v3 NOMINATION/VOTE_RESULT标记为非阻塞：同次提交立即syncImmediate/publishDue当前业务状态，后续展示节点只更新event，不写phase/contextId/nomination/voteSubmissions/锁票；事件可以有短视觉duration，但不写game.presentationUntil、不推迟后续动作的startsAt，projection对应start不能覆盖更晚阻塞事件的presentationUntil。提名公开状态及时发布；辩护/逐席计票保持原官方顺序与鬼票锁定，动画不重置ballotId、已计票、鬼票或已提交举手。v1/2现有计时与publication保持兼容；客户端提名/VOTE_RESULT统一用不抢焦点的非模态提示，不占全屏。

电影事件与提示事件分离：eventAt优先选择SHOT/EXECUTION/DAWN/NIGHT_FALLS/GAME_OVER，NOMINATION/VOTE_RESULT走独立非模态提示通道，不能占电影槽或取消另一场音源。

手册/角色详情/记录/普通信息弹窗打开时：提名浮卡通过portal显示双方头像、playerLabel、票数/门槛、本席举手/锁票状态、举手/放下/回城镇。不关闭阅读、不改滚动；“回城镇”主动关闭阅读。鬼票沿用二次确认、disabled和锁票校验；浮卡可折叠但状态始终可见。卡片有44px操作，正文扣除实测卡片高度，不遮返回/保存。RoomSheet与GuideOverlay的最上层焦点循环均包含外部提名浮卡/枪击入口；打开枪击目标确认或鬼票确认后仅新确认层捕获焦点，关闭恢复原触发按钮。

可公开宣称枪击的存活玩家在VOTING也有动作入口（所有有资格玩家均可宣称，不能由UI暴露真猎魔人），在浮卡/城镇可打开轻量目标选择并明确确认；只用公开canClaimSlayer/dayAbilityTargets。服务端继续校验当前game/context与投票；枪击演出期间暂停计票并保留当前锁票，结束后从剩余时长继续。造成胜利立即按权威状态结束投票；造成死亡但未结束的鬼票/顺序由原规则处理。不能通过skip动画提前解除服务端阻塞。查看手册时枪击用非模态短冲击/结果提示，保留阅读；城镇可播放完整公共枪击。

## 6. 三个bug与房间恢复流程

### 6.1 随机资料

把随机索引统一到guest-profile的crypto优先/Math.random降级函数，删除PlayerProfileEditor直接无保护crypto调用。随机昵称排除当前昵称，头像从房间未占用且不同于当前的候选中选；只有一张可用时保留头像仍换昵称，无可用头像显示明确提示。点击一次仅更新当前草稿，保存/加入按原流程持久化，账号用户不展示游客随机入口。初始化账号响应不得覆盖已修改草稿，旧pending join期间只显示明确重试原操作；确定失败可解除锁。存储失败当页仍更新并提示未持久保存。

### 6.2 邀请失效

导航区分URL邀请、已存席位与自己房主候选，不能把新邀请覆盖原记录后再发现失败。启动先查询邀请summary：404明确失效→清该邀请参数/display/该房pending join与过期席位索引→如有有效自有房主候选恢复原房并显示提示，否则HOME（有创建、加入入口）；403/429/5xx/网络错误显示重试/返回首页，不删原席位、不自动销毁房。返回首页显式清当前邀请查询参数，保留有效席位索引以供“恢复房间”。新建/加入成功用selectRoomUrl覆盖为新code，InviteTools从当前权威room.code生成，不拼接旧参数。

统一终态加入清理：确认ROOM_NOT_FOUND、无写入的资料/容量/状态拒绝时清该次join意图（包括ticket获取失败路径）；网络中断、5xx或未知结果保留原intent/票据并提供重试，不允许改资料后偷偷发第二次加入。不存在房间不能永久留下frozen按钮。被移除只清该房记录；其他房间索引不受影响。

### 6.3 房主跨房

StoredSession增量isHost、roomInstanceId（无秘密）由最新room.organizerId===self校验后保存；旧记录无标记时查询真实getRoom确认，不能仅按本地isHost授权。查找当前session和同账户命名空间本地索引中的来源候选（优先最新有效房主房间），每次用服务端权限核对；不枚举他人房间。若新邀请就是原房，直接恢复，不显示关闭确认；DISPLAY邀请不触发关闭。有效新房+有效自有来源，显示两个选择，切换按钮明确“加入新房间并关闭旧房间”，二次确认显示source code、开局状态和真人数，说明旧房所有人会退出。用户已确认无论旧房是否开局/是否有真人均允许关闭。

待换房意图按账户命名空间写sessionStorage（与既有join票据相同保管范围），字段为{sourceCode,sourceInstance,targetCode,targetInstance,switchTicket,joinTicket,profile,fingerprint,createdAt}；target请求发出前必须保存，无法保存时保持内存并提示不要关闭页面。启动优先恢复待换房意图，再查URL邀请和旧房主候选。网络/5xx未知结果保持原意图；只在已提交回执或明确未提交终态后清理。切号清理旧命名空间的活动内存、不在新账号重试。

确认时重新读摘要并取得§3.3签票，提交原target加入；加入成功与源删除同事务，收到回执才清source索引、更新target URL/session。目标404/满员/已开局不可新加入/头像或昵称冲突/持久化失败：保持旧房，显示原因，可返回；来源已经结束：清来源候选重新提供正常加入；房主已转移：不销毁并告知权限变化。断线重试使用原票据和资料，不再确认新销毁意图；源其他客户端通过已有删除广播/404回到HOME并清过期URL，统一提示“房间已结束或被房主关闭，可创建或加入其他房间”，不伪造精确删除原因，不得卡LOADING。

## 7. 权限、异常与并发总约定

所有动作仍走现有account可信sub、HttpOnly座位、同源Origin、roomInstance/game/context/ballot和command版本检查。演示页没有任何真实操作接口。秘密行为不写公开event/共享音效频道；加载的素材名不能含真实目标或身份。并行后台poll/WS只能接受当前generation和非旧revision。双击换房合并同一flight；多标签页源同一签票只成功一次，第二次可取回同一回执，改目标/资料不能复用。不同意图抢同一来源仅一个成功，其余SOURCE_ROOM_GONE/HOST_CHANGED明确终态；新房和旧房都由同一个runtime全局队列串行。

关闭旧房清理其bot状态、计时/私聊/公共事件/快照；既有runtime删除发布负责断线通知。不得顺带删除账号全局资料、其他房间或重置游客资料。错误不返回token/hash/私密身份；访问日志不记录body。声画资源失败不影响权威业务提交，不伪造成功或自动重试游戏命令。

## 8. 测试与验收（无浏览器）

只新增能保护真实边界的用例，不断言纯CSS常量。

- Vitest/Fastify：v3结果发布前无死亡/胜利泄露、提名提交后立即举手/枪击及票结果后立即再提名/结束白天不被旧publication覆盖、逐席锁票和鬼票在枪击前后保持、暂停/重连/旧v1/2历史解释。
- 换房：游客/账号房主、非房主、切号、实例复用、目标满/开局/不存在、头像冲突、原目标座位恢复、同房/DISPLAY拒绝、旧房进行中与多人关闭、重复/丢响应/过期已提交重试、改参数重放拒绝；用注入repository失败验证加入与删除同时回滚，订阅只见提交后删除。
- DOM：随机crypto缺失与重复候选、草稿不被迟到账号加载覆盖；失效邀请→HOME→新建/新邀/新加入，旧房主冲突选择及失败保留；手册及普通RoomSheet内提名可举手/枪击，目标选择→取消回原阅读与焦点、阅读位置/关闭可达与跨轮提示清理。
- 音频假时钟：总静音、ONLINE/IN_PERSON切换取消、未解锁、加载失败、晚到不重击、结果分支只在结果后、暂停恢复和预览进度；原始音频解析检查格式/时长/峰值/非静音与清单SHA。
- 演示：目录完整、场景隔离/重播/暂停/速度/定位、无API写入；减少动态效果时功能完整。
- 稳定后执行Web/Server相关类型与构建。复用未受变更影响的旧验证；不自动全量历史回归，不运行Playwright。
- 发布：Git提交/合并/推送后，ops再读、全局锁、固定版本镜像/资源SHA、专库备份与隔离恢复、只切本游戏、健康/loopback/协议/匿名WS/新签票schema拒绝/日志、非目标容器路由/环境摘要与房间数据保持。资源含新增图片和音频。无生产测试房或真实销毁测试。

验收：全部确认范围有实际实现，独立review问题闭环；无静态假按钮或缺失声音占位；主线远端对齐、运行固定SHA和发布记录一致；真机手感/听感单独标注待用户验收。

## 9. 兼容、发布与回滚

本轮不加表/外部依赖/环境变量；新metadata字段与可选join参数增量兼容。演出v3须同批Web+Server部署，现有旧客户端按既有资源版本刷新策略避免错时序；不能让不知道v3的缓存客户端仍发写命令。本轮协议升级为5，旧协议4及更早HTTP请求返回426，旧WS沿用升级拒绝；浏览器旧资源下无法继续写命令，必须刷新。旧快照4必须继续可读，不能重置现有局为v3；新局才创建v3。

回滚前若已产生v3事件/快照，旧b85a8c6不能直接运行这些局：保留当前库与镜像，优先前向修复；必须回滚时用包含v3兼容解释的回退提交，不恢复旧备份覆盖新进度。若尚无v3局/换房新回执，仍需核对后才选旧代码。发布记录写清真实检查，不把CLI视为微信端视觉/声音验收。

## 10. 阶段与完成记录

1. 方案独立review并消除关键未决项；文档修订到可直接实现。
2. 权威时序/换房与前端动效/资料导航分块实施、合入工作树，保持文件边界。
3. 逐项对照§1–8，独立代码review，修复遗漏并运行对应目标验证。
4. 文档同步、提交推送合并、固定版本部署和CLI验收、补发布回执提交。

实施期间逐项补充实际文件、验证、偏差与证据；未完成项不能标记完成或已部署。

独立review首轮记录：后端5项、前端6项均在对应章节修订，覆盖业务publication旧状态覆盖、恢复分支finalize、三种凭据重放/容量、通用关闭提示、outcome音效新鲜窗口、独立提示通道、待换房持久模型、播放驱动、总开关语义及焦点层级。两位审查者均已复审确认可直接实施。


### 实施对照与独立代码review闭环（2026-11-12候选）

| 范围 | 实际落地与验证 |
| --- | --- |
| 演示/共用动画 | EffectsPreview、EventStage、effects-art、effects-v3/preview CSS；19场景与逻辑时钟，DOM覆盖暂停/定位/重播/无房间写入 |
| 音效/模式 | experience-audio、participation-audio、ParticipationAudioChoice及3个表单/菜单入口；音频假时钟覆盖权限、去重、新鲜结果、慢放、取消与重复解锁 |
| 资产/胜利 | public/art/effects/v1及audio/effects/v1，3图10音979546字节；逐图检查和音频解码/峰值/来源SHA，不称真机听感验收 |
| 提名/枪击 | server v3即时公告，PlayerGame/NominationNotice/RoomPage/GuideOverlay；独立非模态通道、浮卡头像/投票/目标确认、旧锁票/隐私定向用例 |
| 随机资料 | guest-profile/PlayerProfileEditor；缺crypto、唯一剩余头像、迟到资料/持久化失败的本页内存优先用例 |
| 邀请/换房 | App/api/room-session及server switch-ticket/join finalize；源目标实例/账户绑定、三凭据24h恢复、失败原子回滚、源多人RUNNING关闭、原目标席位恢复 |
| 兼容/发布 | 协议5、快照4，保留旧时序/校验未知版本；Web/Server构建，正式发布回执写unified-deployment.md |

后端实现由前端代理只读交叉review，无剩余P1/P2。前端导航由后端代理交叉review，修复入口epoch、未落盘内存资料、结构化容量429及撤销tombstone。动效由未写应用代码的素材代理独立review，修复迟到解锁复活旧枪声、重复解锁打断私密声、屏幕层被transform祖先限制、结果子树定位/胜利字幕门控、旧v1/2新冲击错时与无WAAPI降级。阅读枪击装饰也统一staticMotion降级。没有为review重复执行已有效覆盖的验证；只补对应故障用例。
