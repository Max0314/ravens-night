# 鸦钟夜话：完整游玩交互与正式房间人机方案

日期：2026-11-10。状态：完整方案已独立review通过；2026-11-11按用户后续授权实施，业务与定向验证已完成，最终集成review通过，2026-11-11 09:42已部署9e20e67并完成公网验证。

## 1. 基线、目标和边界

源码基线为 `9b7f4c4408861f1e80a6f2425020fd92a736203c`，其运行代码为已发布的89e4b68。已读取最新Fribench规范 `964c0ba2357810506ba4d9e883d217f377ea0615` 的AGENTS/workflow/contracts。实施前重新核对GitHub主线差异及当时最新公共规范。本方案承接2026-11-06修复基准，不撤销已完成的投票串轮、管家隐私、公开演出时序、持久化和账号修复。

目标：把已认可的手机首页交互标准延伸到创建、加入、大厅、开局、实际游玩、结算和下一把；正式房间允许规则型人机补空位，一个真人可以走完整局并控制人机响应节奏。

已确认的设计约束：黑金视觉、少文案、清楚的当前任务、关键操作固定可达；整页不纵向滚动，长内容在明确的内部区域滚动；输入框可正常编辑复制，其他内容维持当前防选择/缩放策略；保留已认可的首页、7条教程文案、角色原画及翻书实现。微信、iOS/Android手机浏览器优先。

人机提供自动准备、身份确认、合法行动、表决及基础策略，显著标记“人机”；不新增大模型、语音识别、自动辩论、全知推理或中央房间服务。不增加查看其他玩家身份、任意指定胜负、直接跳阶段或公开修改牌组的入口。真实席位不在游戏中转交给人机。

本轮只交付文档与review，不授权代码、配置、数据库或生产变更。实施验收不打开本地游戏页面，不使用有头/无头浏览器；真机交互由用户在部署后验收，文档不可将DOM测试写成视觉验收。

## 2. 产品控制口径

### 2.1 正常房间与人机控制

房间仍为5—12席，IN_PERSON/REMOTE/HYBRID三种玩法保持。真人房主从大厅添加1名人机、补满空位、移除人机。填满后仍由房主点击开始，系统不自动开局。只有真人能担任房主。

普通多人局提供“暂停人机 / 继续人机 / 人机一步 / 正常·慢速”。暂停只停止自动的人机命令，辩护20秒、每席1.5秒计票及公开演出照常进行；控制条明确显示“人机暂停，游戏计时继续”。“人机一步”只执行一个合法人机命令，不替真人操作、不推进时间。

### 2.2 单真人演练计时

只有恰好1名未离房真人PLAYER且他是房主，并有至少1个人机时，开放“冻结演练计时”。DISPLAY不计入真人数量。该能力适用于现有正式房间，不建立第二套游戏引擎或另一种邀请协议。

开启后固定游戏逻辑时间，自动人机暂停，显示“演练计时已冻结”。“人机一步”执行一个真实业务命令；“推进计时”只推进到下一个真实计时边界。二者分开，避免点一次按钮同时跳过行动、计票和演出。房主自己仍可使用正常身份确认、目标选择、举手等操作。

关闭冻结时从当前逻辑时间连续恢复，不补算暂停期间的墙上时间。多人房间调用冻结/推进接口返回409 REHEARSAL_UNAVAILABLE。大厅新增第二名真人时，原子退出演练、恢复正常计时与自动人机，清除旧任务并重新准备；RUNNING本来就不允许新PLAYER加入。

“冻结演练计时”与现有“延长等待”完全分开：前者控制单真人验证的时间，后者只延长已有阶段的等待截止，不完成行动。

## 3. 手机交互规范与页面行为

### 3.1 统一页面结构

新增本游戏内部的RoomPageShell、RoomActionBar、PlayerTile、RoomSheet、OperationStatus组件，复用现有按钮/头像/视口/返回层能力；不重写公共UI库。

- 外壳高度取现有visualViewport变量，结构为固定顶部、minmax(0,1fr)内容、固定底部；safe-area计入上下左右。至少验证320×568、375×667、390×844、430×932以及844×390横屏。
- 主操作触摸区不小于48px，次要图标44px；正常正文14—16px。危险操作在管理弹窗内二次确认，普通准备、选人、切页不增加确认。
- 一个页面只有一个主要任务与一个主按钮区。错误、提交中、结果待确认、离线分别显示，不以无限加载覆盖全部界面。仅服务端提交成功才显示成功。
- 内容滚动容器有明确边界；切页记录当前位置，切阶段清除过期目标和确认层。弹窗固定标题/关闭与操作区，中部滚动；最多保留一个主弹窗及其一个确认层。
- 页面内部切换160—220ms淡入/轻位移，目标选择100—140ms描边反馈。翻书仅用于教程/角色资料；投票不采用长翻页动效。prefers-reduced-motion取消位移和3D。私密操作不自动发声；已存在的公开演出音效偏好保持。
- 返回键先关闭最上层，再回原分区；“首页”仅隐藏当前对局，不离房。离房必须明确点击“离开房间”，沿用阶段限制。
- 键盘弹出时输入区内部滚动，主操作区仍在可见视口内；关闭键盘不跳回内容开头。不要在焦点恢复时将整个页面滚动。

### 3.2 创建

可见首屏为昵称、5—12人数按钮组和三个简短玩法选项；默认昵称来自本游戏资料，默认8人、围桌线下。人数采用4列两行，不再使用系统下拉。每种玩法只保留名称及至多一行说明。语音链接收在“附加语音链接”内，仅线上/混合可见，切回线下时不提交链接但保留本次草稿。

底部主按钮“创建房间”。校验昵称trim后1—24字符、人数整数范围、链接沿用安全HTTP/HTTPS校验。错误定位对应字段；处理中锁定当前提交，不丢草稿。创建成功继续完成本人的入座；页面状态依次为“正在创建 / 正在加入 / 已进入大厅”。创建响应丢失重用第7节创建凭据，禁止凭超时新建第二个房间。创建成功、入座失败时保存code与pendingJoin，刷新或重试接着加入原房，不重新创建。

### 3.3 加入与恢复

首屏为房间码和昵称，默认“手机玩家”；大屏与“换设备恢复座位”是清楚的次要入口。邀请码输入统一大写，去空格后仅允许A—Z/2—9、恰好6位；原输入草稿仍可编辑，不能悄悄去掉中间非法字符后加入另一个房间。邀请URL预填但不自动占座。

底部显示“加入房间 / 恢复座位”。昵称预填不覆盖正在输入的值。旧Cookie、账号席位、已消费票据恢复优先于新入座；公开邀请码不提供他人身份。房满但有可替换人机时，按钮下显示“加入后替换一个人机”，处理规则见第5节。

SETUP_CHANGED且服务端明确票据未消费时只自动领新票重试一次；再次变化提示重试。403席位撤销清理该座位缓存，503识别/保存失败保留缓存和草稿，426显示刷新入口，404回到邀请码表单。更换房间或账号后旧响应由generation丢弃。

### 3.4 大厅

顶部显示房间码、邀请图标、人数、更多；中部头像座位网格，区分本人、真人房主、人机、空位、准备和离线。手机3—4列按可用宽度，12席可在中部局部滚动。准备统计只出现一次；底部固定“我已准备 / 取消准备”或“准备并开始 / 开始游戏”。

房主主按钮禁用时，在按钮上方只显示首要原因：缺N席→有真人离线→有真人未准备，按此优先级。不会用灰按钮让用户猜原因。人机数量与真人数量分别显示；不以人机lastSeen伪造真人在线状态。

点击座位弹出居中详情；房主可前移/后移或使用拖柄换座。拖动有占位、邻项平移与释放吸附，提交一次；取消、失焦、成员变化撤销预览。拖动结束不得触发座位点击。座序/成员变化清空真人准备，bot任务作废，人机在RUN模式重新准备。成员移除在该座位详情操作，不再要求到“更多”搜索另一份名单。

房主控制面板提供“添加一个人机 / 人机补满 / 清除人机”，仅LOBBY。空位点击也可进入同一面板。添加后保持原滚动位置；不能自动替本人确认准备或自动开局。教学选项为次要开关，默认跳过，已认可教程内容不改。

### 3.5 开局、教学、身份确认

start仍要求5—12席满、全部真人在线且准备、人机已准备；markHostReady仍允许一次完成房主准备与开局。先提交成功再切页，连点/超时重试同命令ID。

三卡开局教学沿用当前文案，顶部进度、中部内容、底部“跳过/下一步”，每卡均可跳过。人机按策略自动完成。已经完成的真人显示“你已完成，等待其他玩家”，可看角色表/返回首页，不重复点击完成。房主可取消教学回大厅。

身份确认使用现有原画拱门、角色名、能力与折叠建议；保留私密提示，底部固定“确认身份”。确认后原位显示“已确认，等待其他玩家”，不反复切换整页；全部确认后由公开阶段切换进入首夜。公开等待只显示统一文案，不列出正在使用能力的角色或座位。

### 3.6 夜晚

固定顶部为昼夜/本人座号，底部保留行动、城镇、记录。中部当前任务为“选择目标”“已提交”“等待行动”，三者明确区分。

目标采用统一头像/座号/昵称卡，合法目标可点，非法目标置灰且原因使用通用规则说明。最多双选；满选后点击新目标沿用当前替换最早选择的行为。底部固定“确认选择（N/M）”；未选满禁用，已提交后显示自己的选择回执。收到线索在记录页标新，不弹全屏私密消息、不自动播放角色音效。

切阶段、gameId/contextId变化、重连获得新快照时清除旧选择；请求结果未知时保留原命令重试并阻止新命令越过。公开演出遮挡时锁定操作，不提前公布未来死亡、胜负或内部行动进度。

### 3.7 白天、公开能力、投票

行动页顶部给出当前任务，主要内容为讨论/提名、辩护、计票三个状态。城镇保持完整头像座位与公共状态，记录页分私密与公开，不重复渲染同一段状态说明。

提名：点玩家卡→显示候选人与固定“确认提名/取消”。候选非法或轮次变更时清除确认。撤销提名保留已消耗次数说明。公开猎魔人宣称保留两步确认，任何真人都可按既定规则宣称；不通过入口是否可见泄露真实角色。

公开表决条始终在隐私遮罩外显示被提名者、当前计票座位、已计人数、赞成票和门槛，举手/放下按钮固定且显示已提交状态。辩护显示倒计时；已计本席锁定并说明。死者首次赞成保留鬼票确认层，只在服务端实际计入时消耗。人机投票与真人使用同一计票路径；管家只在本人私密区提醒，公开票数与举手一致。

日落确认固定在白天操作区，显示“同意结束今天/撤回同意”及公开人数；不得因点一次按钮同时隐式触发提名。断线后先同步当前ballot及截止时间，完成同步前禁止投票；过期请求409后要求重新决定，不转移到新轮。

### 3.8 社交、异常、结算与下一把

耳语邀请/接受/拒绝与聊天使用同一RoomSheet，固定返回/发送，消息列表内部滚动；切分区保留内存草稿。机器人可以接受白天真人邀请及回复固定确认，详见策略表。换设备恢复、移除/被移除、接任房主、重开保持现有确认与权限，不新增自动接管真人席位。

公开胜负演出结束前不开放身份与完整战报。结算顶部显示胜负及一句原因，中部为自己的真实身份、头像角色网格、可展开复盘；底部房主“下一把”，所有真人“离开房间”固定。演出可按当前客户端减少动态/跳过显示，但不提前解锁服务端结果。

下一把调用reset回同房大厅，保留真人与人机席位、邀请地址、玩法；清空本局角色、鬼票、能力、目标、草稿、bot知识、排队任务。所有真人重新准备，人机按RUN/PAUSED模式准备，房主再次明确开始。旧局请求被gameId/setupId拦截。

## 4. 模块职责

| 模块 | 责任与禁止事项 |
|---|---|
| packages/contracts/src/room-protocol.ts及新增bot-control.ts | 协议3的上下文、公开controller、控制状态及新接口schema；禁止客户端发送BOT身份或内部任务 |
| apps/server/src/rooms/service.ts | 成员/房主/阶段/目标规则、bot成员生命周期、有限内部动作入口；不在策略中读取全房身份 |
| 新rooms/bot-policy.ts | 纯函数Observation→意图，确定性选择；不接收RoomRecord、assignments、trueGrimoire、DB、网络或时钟实例 |
| 新rooms/bot-scheduler.ts | 构造受限观察、规划/取消/执行任务、暂停/单步；执行前重新校验，不能直接改aliveSeats/votes/phase |
| 新rooms/timeline.ts | 单房游戏时间；真人在线、票据、TTL继续墙上时间 |
| game/live-runtime.ts | 继续单队列副本→DB事务→替换内存→广播；加入创建回执及bot批次，不在提交前广播或播放 |
| db/room-repository.ts | 加密快照3、创建回执表及迁移事务；不更改公共账号库 |
| app.ts | 真实身份解析、参数schema、协议和错误映射、500ms统一tick；不在入队前做最终房主判断 |
| web/api.ts、App.tsx | 创建/加入恢复、同成员命令队列、成对快照和迟到响应处理 |
| web/pages及RoomTools | 本节交互；控制面板只显示服务端capabilities，不按昵称猜权限 |
| 新web/use-game-clock.ts | 统一逻辑时间采样、冻结、演出进度；不把逻辑时间用于令牌过期 |

## 5. 数据模型与成员生命周期

### 5.1 快照3

RoomRecord.schemaVersion改为3，新增以下明确字段；全部进入已有AES-GCM快照，不在明文公开事件表存私密任务。

```
ParticipantRecord.controller: 'HUMAN' | 'BOT'       // PLAYER必填，DISPLAY固定HUMAN
ParticipantRecord.bot?: { policyVersion: 1 }       // 仅BOT
RoomRecord.lastHumanActivityAt: number             // 墙上毫秒
RoomRecord.botControl: {
  mode: 'RUNNING' | 'PAUSED'; pace: 'NORMAL' | 'SLOW'; attentionRequired:boolean;
  version: number; generation: UUID; nextSequence: number;
  seed: UUID; pending: BotTask[]; memory: Record<botId,BotMemory>;
}
RoomRecord.timeline: { mode:'WALL'|'MANUAL'; offsetMs:number; manualNowMs?:number; epoch:number }
RoomRecord.metadata.humanActivityCheckpointAt?: number // 真人心跳每60秒持久检查点
RoomRecord.metadata.pendingFirstJoin?: boolean       // 仅创建待入座空大厅
RoomRecord.metadata.creationKey?: string            // 新创建幂等索引，非公开
PublicProjection.publishedPhaseStartedAt: number     // 已公开阶段逻辑起点，公开game DTO同步
RoomRecord.game.hadBots: boolean
RoomRecord.game.rehearsalUsed: boolean
RoomResult.releasedWallAt: number                  // 真实结算审计时间
RoomResult.hadBots: boolean
RoomResult.rehearsalUsed: boolean
RoomResult.participants[].controller: 'HUMAN'|'BOT'
```

BotTask为{id,botId,sequence,controlGeneration,roomInstanceId,setupId,gameId?,contextId?,ballotId?,expectedBotCommandVersion,kind,args,dueGameAt,latestGameAt?}。kind限READY/TUTORIAL_COMPLETE/CONFIRM_ROLE/NIGHT_ACTION/NOMINATE/VOTE/DAY_READY/SLAYER/WHISPER_ACCEPT/WHISPER_REPLY。每个bot最多1个pending任务、每房最多11个，args序列化上限2KiB。任务ID不包含可对外推断的角色名，不下发客户端。

BotMemory为{gameId?,knownTeamSeats:number[],ackedHumanMessageIds:string[],ballot?:{ballotId:string,initialSubmitted:boolean,correctionCount:0|1,lastRaised?:boolean,lastMasterRaised?:boolean}}；knownTeamSeats最多12，消息去重最多80项，随游戏重置。ballot记录仅保留当前一轮：新ballotId才初始化，PAUSE、速度变化或generation变化不清；成功投票与initialSubmitted/correctionCount在同一事务提交，失败不增加。最多1次初投和1次必要修正由该记录与引擎锁票共同约束，下一局清空。角色判断只从本人的当前私密视图读取；不额外保存真实醉酒/中毒、其他人的能力或真实身份。

创建人机沿用mode=PLAYER；id为随机UUID；nickname从“人机·01”递增，发现重名继续加序号（序号可超过11，bot席位仍最多11），因此11个真人占用01—11时可命名12，头像从现行有效目录按seed挑选。无accountId、joinTicket、恢复码、账号覆盖资料。tokenHash保存域隔离HMAC派生凭据的hash：HMAC-SHA256(SESSION_SECRET,固定域名+roomInstanceId+botId)，编码base64url；明文仅调度时临时派生，不下发、不写日志、不存快照。外部HTTP/WS/账号恢复/换设备入口一律拒绝BOT，内部动作通过派生凭据复用业务校验。

游戏标记赋值：createGame时hadBots按当局活动BOT数固定，rehearsalUsed按timeline.mode=MANUAL初始化；本局任一次进入MANUAL即永久置true，恢复WALL不清除。captureResult将两者和各成员controller复制到结果，随后保持不变；reset删除game，下一局重新计算。教学中开启MANUAL但在真正开局前关闭不标记该局；MANUAL下开局则标记。

创建待入座态：create先保存LOBBY、pendingFirstJoin=true、0个PLAYER、无game/bot/organizerParticipantId；首名合法真人join后设为false并按现有规则成为房主，bot管理与start在此之前均不可用。该态允许stage.restore和重启，按大厅TTL回收；旧v2的0玩家LOBBY且有有效organizerTokenHash同样迁移为pendingFirstJoin，creationKey可缺省，不伪造旧创建回执。最后真人离房仍直接删房，不转回创建待入座态。

### 5.2 成员变化

- 添加/填满/清除人机：现任真人房主、LOBBY、至少自己一名真人。单次添加count为1—11且不超过当前空位，超出409 BOT_CAPACITY_CHANGED，不部分添加；fill=true按事务当时空位补齐，已满则成功no-op；clear=true只删除全部BOT。三种意图互斥。
- 成员修改是一次原子事务：增删成员→保持其余成员相对顺序并整理座号→invalidateSetup一次→所有真人ready=false→bot任务清空并换generation→control.version+1。RUN模式的人机通过正常READY命令重新准备；PAUSED模式等待单步或继续。客户端显示已提交数量。所有join/leave/remove/clear/取消教学/reset结束前统一调用exitRehearsalIfIneligible：若不再满足“单真人+至少1 bot”，同一事务按当前冻结点恢复WALL、epoch++、清任务并恢复RUNNING；整个成员事务只将control.version/generation更新一次，不重复递增。删除房间则直接丢弃时间状态。
- 真人加入满席大厅：优先恢复已有真人席位；新入座且存在BOT时，替换座号最大的人机，再将真人放到该座号，其他座号保持；原子撤销bot任务/凭据并轮换setup。不存在BOT则409 ROOM_FULL。任何PLAYER入座仍须有效票据，不能从URL指定替换某真人。
- 调整座序只在LOBBY，允许真人与BOT混排。无论移动谁均按同一setup/准备规则处理，角色身份尚未分配。TUTORIAL/RUNNING不换座、不增删BOT；教学先取消，运行先中止并回大厅。
- BOT永远不参加房主继任。主动离房及离线5分钟接任只选择未离房真人PLAYER；最后一名真人离开允许阶段时删除整房（含bot、DISPLAY、任务）。进行中主动离房仍须先中止，不因人机功能放开秘密席位转交。
- 统一activePlayer=mode=PLAYER且!left，humanPlayer再限定controller=HUMAN；容量、房主、唯一真人、全局128席统计均用该集合，不把终局已离房记录计入。人机connected展示为可用且带BOT标识，不进入真人离线心跳判断。真人PLAYER心跳和成功的真人命令在同一事务更新lastHumanActivityAt及真人lastSeenAt/connected；bot动作、服务器tick和DISPLAY心跳/命令均不延长此字段。含bot房间按该字段沿用大厅2小时/活动24小时闲置回收，避免纯机器长期维持房间。
- 全部真人离线30秒后调度effectiveMode为SUSPENDED，不执行自动bot任务；请求模式RUNNING/PAUSED仍持久保存。真人恢复后，仅原RUNNING恢复；原PAUSED保持。墙上投票计时照常，冻结演练仍冻结。

## 6. 正式人机策略与提交链路

### 6.1 观察与公平性

BotObservation只含本人公开/私密DTO允许的字段：已发布phase/day/seat状态/提名与公开票型、自己的可见角色和历史、合法目标、canVote/canNominate/dayReady等能力标志，以及本应收到的开局队友座号。

队友座号在生成原有开局情报的同一函数中产出结构化结果：7—12人按当前规则发给有资格的恶魔/爪牙；5—6人为空；只给收到情报的bot写memory。不能通过读取所有assignments再猜测哪些知识该知道。醉酒、登记变化或传位后，观察依照本人实际收到的投影更新，不提供真实状态。

本版不解析自由文本/真人语音、不把酒鬼本人识别为酒鬼；基础决策只使用可编码的可见角色、公开行动和队友情报。改变其他隐藏身份且保持Observation相同，策略输出必须完全相同。

### 6.2 确定性基础策略

候选首先取服务器合法集合。随机仅用于并列选择，使用seed+botId+setup/game/context/ballot+kind派生，不使用Math.random在每次轮询重新掷骰。若集合为空则无任务，不能提交空数组糊过强制行动。

公开怀疑分S(s)=2×该玩家本局提名本bot的次数+该玩家在提名本bot时公开赞成的次数+当前onBlock恰为该玩家时的1分。只使用已经公开的记录；未知身份不加权。已知邪恶队友在邪恶bot的攻击目标中优先排除，但合法候选只剩这些人时仍从合法集合选择。

| 状态/角色 | 可直接编码的决策 |
|---|---|
| 大厅/教学/身份确认 | 未准备→READY(true)；未完成教学→COMPLETE；未确认身份→CONFIRM。不得代真人确认 |
| 小恶魔 | 合法且存活的其他非已知队友优先，按公开发起提名次数最多排序、并列取确定性随机；无此目标再取其他合法目标，最后才自己；不主动策划自刀传位 |
| 投毒者 | 合法存活其他非已知队友优先，公开提名活跃者优先；无其他人再合法随机 |
| 僧侣 | 合法存活其他人中公开提名活跃者优先；其他情况合法随机 |
| 占卜师/守鸦人等选人角色 | 合法存活其他人按S降序，满足1或2个不同目标；不足时用其余合法目标补齐，允许的死者/自己仅作后备 |
| 管家选主人 | 合法存活其他人，按公开累计举手次数降序；并列确定性随机。根据本人自认身份行动 |
| 信息/被动角色 | 没有action就等待，系统自行发信息/结算，不造无用命令 |
| 白天提名 | 进入公开讨论至少10秒、本人有提名资格、尚无同日已提交提名任务时，从合法目标取最高S；邪恶bot优先排除已知队友；在执行前再次确认目标与资格 |
| 存活者表决 | 支持自己提名、当前提名自己的对手或S>=1的候选；其他情况由固定种子给出50%赞成。恶魔/爪牙对已知队友投反对；存活自认管家额外只在主人已公开举手/计赞成时赞成 |
| 死者鬼票 | 仅在有剩余鬼票且候选S>=2时赞成，否则不举手；实际消耗仍由计票引擎决定 |
| 结束白天 | 当前公开讨论/提名阶段持续至少18秒、无待处理表决、dayReady=false时提交同意；不反复切换已同意状态 |
| 猎魔人 | 仅自认猎魔人、能力可用、第2天起且合法目标最高S>=2时公开射击一次；其他bot不自动作出假宣称 |
| 耳语 | 仅白天接受真人发来的合法邀请；每条新真人消息最多回复一次“已收到你的消息。”，不自动说身份/线索、不与bot互相邀请；消息上限及阶段限制沿用现有社交校验 |

每轮投票至多一次初始手势、一次因管家主人状态变化而需要的修正；锁票后不再计划。每次执行都重新核对观察前提；前提变化取消该任务并重新规划，而不是修改已发送任务的payload。

NORMAL延迟：准备300ms、教学/身份700ms、夜间1200ms、举放手500ms、耳语800ms；白天提名10秒、日落同意18秒从当前公开阶段开始计。SLOW为上述延迟×3，但投票初始手势延迟最多1500ms；不得改变引擎20秒/1.5秒规则。演出锁期间不执行游戏命令，也不从未发布的内部阶段计时。公开起点唯一取持久的publicProjection.publishedPhaseStartedAt：initializePresentation设为建局gameNow；publishDue应用导致公开phase或day变化的patch时设为该node.at，同phase/day的纯票数、射击、消息更新不重置。该字段随投影与公开DTO保存，重启/重规划沿用，不用内部提前结束的phase或本次扫描时间重计10/18秒。旧v2无bot，其当前起点迁移时取当时gameNow作为兼容默认，不更改任何已有截止；下一局按正式生成规则。

### 6.3 自动调度与幂等

沿用onReady之后的500ms tick，统一在runtime.execute内顺序处理：真实心跳状态与到期公开时间→取消过期bot任务→为当前合法动作创建任务→执行到期任务→闲置回收。每批最多8个人机命令、每房最多1个；先处理接近自身锁票截止的任务，再按dueAt及房间轮转公平处理。现有真人命令与tick共用同一串行队列，不另开直接写内存的机器人线程。

每个bot命令都调用同一业务方法和scope校验，完整带roomInstance/setup/game/context或ballot、expectedBotCommandVersion。命令ID由roomInstance、generation、botId、sequence派生。新增内部applyBotTask负责与现有回执相同的指纹检查、completeCommand和256条回执维护；内部凭据不经过浏览器。

规划与执行分成明确事务：

1. 规划事务在runtime.execute的stage中生成意图，分配sequence、保存pending与dueGameAt，显式room.revision至少+1后提交；只规划、不提前增加bot.commandVersion或投票/应答计数。数据库失败pending/sequence全部回滚，下一次用相同原状态重算同一ID。
2. 到期执行事务再次读取已提交pending，完成业务校验与动作、更新对应BotMemory、删除任务、completeCommand、写小回执并递增revision，全部同一DB提交。失败回滚这些变化，保留原pending/ID/payload以便重试，不消耗票或能力。
3. 仅清理过期任务、改变调度状态而无业务动作时也必须显式revision+1，保证现有runtime按revision差异落库；无任何变化才不提交。单步可以在一次事务中规划并立即执行一个任务（因为显式忽略思考延迟），仍满足原子性。

重启恢复pending/sequence/回执，已提交不再执行；不能用只改metadata却不递增revision的方式保存任务。

任务在执行前校验bot仍在、controller仍BOT、generation与上下文、commandVersion、目标合法、公开演出锁、当前RUN模式或本次显式step授权。结构合法但game/context/ballot/generation/commandVersion已过期的任务允许随真人事务保存；restore只验证结构与bot归属，不因这些正常过期条件拒绝整房，也不在restore中执行。调度/step必须先丢弃过期任务，任务被清理也通过正常事务持久化。失配则删除旧任务、下一次重新规划；不能把旧目标移到新夜晚/新表决。暂时PRESENTATION_PENDING保留至公开解锁并重验；过期票不补投。永久策略异常停用本房自动bot（mode=PAUSED、attentionRequired=true、control.version++且revision++），显示通用“人机操作需要重试”，现任房主点“重试人机”映射为原control请求RUNNING并清attentionRequired、换generation；日志只记room/code/任务类型/错误码，不记角色、目标、凭据。

全服务同时最多128个BOT席位；超过时add/fill返回429 BOT_LIMIT_REACHED且不部分添加。该上限为当前全快照串行架构的明确资源边界，不增分布式调度服务；本机纯Node负载夹具验证上限附近的计票响应，未达指标先降低上限而不是静默超时。

## 7. HTTP/WS、权限和创建幂等

### 7.1 通用规则

升级ROOM_PROTOCOL_VERSION=3，HTTP房间API请求X-Ravens-Protocol:3，WS增加protocol=3。写协议2或缺失返回426 CLIENT_UPGRADE_REQUIRED；带旧协议的房间读也返回426；无协议只允许健康、登录及新增GET /api/rooms/:code/summary邀请摘要。该摘要返回{code,playerCount,activeHumanCount,botCount,canJoin,willReplaceBot}，仅基于已发布房间状态，无成员标识、角色或游戏内部字段，房间不存在404；任何其他房间读写无协议均426。WS在发送快照前检查协议，不支持者1008关闭并由客户端显示刷新。账号、同源登录SDK与头像目录契约保持。

普通房间命令继续带C={roomInstanceId,setupId,expectedCommandVersion}及X-Command-Id；GAME另带gameId/contextId，BALLOT另带gameId/ballotId。最终权限在runtime队列内校验。公开型命令保持返回当前RoomView及self；私密型命令保持当前PrivateView（内含同revision的room/self），不回放旧DTO。客户端按既有成对快照规则合并，未配对时不展示旧私密内容；结果小包也带当前self。相同ID/指纹重复返回已提交结果和当前视图；同ID异payload409 COMMAND_ID_REUSED。

### 7.2 新增接口

下表路径以/api/rooms/:code为前缀；全部要求现任真人房主，并遵循C/命令幂等。额外expectedControlVersion对应botControl.version，冲突返回409 BOT_CONTROL_CHANGED并刷新，不自动执行旧控制。

| 路径/方法 | 额外输入 | 条件与持久变化 | 成功/失败行为 |
|---|---|---|---|
| POST /bots | count或fill:true或clear:true三选一；expectedControlVersion | 仅LOBBY；第5节增删、换setup/generation、真人取消准备 | 返回当前视图及added/removed数量；容量/状态冲突409，限额429 |
| POST /bots/control | mode?:RUNNING/PAUSED, pace?:NORMAL/SLOW，至少一项；expectedControlVersion | ROOM scope；LOBBY/TUTORIAL/RUNNING/GAME_OVER/ABORTED允许；改值时version++、generation更换、旧任务清空；MANUAL期间不允许RUNNING | 返回当前视图；MODE_CONFLICT 409；相同值为no-op但仍去重 |
| POST /bots/step | expectedControlVersion，游戏存在则gameId/contextId | mode必须PAUSED；按当前公开状态选1个合法任务，忽略模拟思考延迟，不绕过游戏时限/演出锁 | APPLIED或WAITING；持久回执，不返回botId/角色/目标或私密等待原因；同ID重试不执行第二步 |
| POST /rehearsal/clock | mode:MANUAL/WALL，expectedControlVersion | 仅单真人房主且有bot；切时间模式、epoch/version/generation++、清任务；MANUAL同时mode=PAUSED | 返回当前视图；多人409；WALL恢复自动RUNNING |
| POST /rehearsal/advance | expectedControlVersion，gameId/contextId（投票另带ballotId） | 仅MANUAL+PAUSED；推进至第8节唯一下一时间边界，不执行bot命令 | ADVANCED或WAITING；无边界成功no-op；响应仅公开状态，不报未来事件类型 |

bots/step与rehearsal/advance在GAME_OVER身份公开完成后仅WAITING；不能用它们reset、越过终局公开门槛或选指定bot身份。TUTORIAL无gameId时仅step有效。RETURN CURRENT VIEW不改变普通玩家权限。

现有/start、ready、seats、tutorial/complete/cancel、role/confirm、action、nominate、vote、day/ready、day/ability、abort、reopen/reset、leave、host/claim与social路径保留原业务语义，仅扩展协议、controller与timeline。bot控制不调用旧resume延长等待。

专用CONTROL scope：/bots/step与/rehearsal/advance使用validateControlCommand，不复用GAME/BALLOT的assertPresentationComplete或内部context比较。顺序为当前真实成员/真人房主授权及roomInstance匹配→查询同ID回执并比较指纹（命中即拼接当前视图返回）→仅首次执行校验setup/expectedCommandVersion→expectedControlVersion→若有game则gameId与当前公开投影contextId匹配→公开VOTING时校验公开ballotId（其他阶段禁止陈旧ballotId）→控制模式/资格。演出中允许推进时钟；step遇到演出锁只返回WAITING。普通夜间/投票命令仍走原scope，不能利用CONTROL发游戏动作。

控制版本：add/remove及模式/速度/时钟变化按规则递增；每次APPLIED的人机一步、ADVANCED的计时一步也递增version但不换generation，防止同一旧控制意图用另一ID重发。WAITING不改control.version；外层仍记录回执并推进操作者commandVersion。自动bot动作不改变control.version。

控制成功响应统一为现有PrivateView（包含当前room/self及仅房主本人的私密内容）加controlResult={status:'APPLIED'|'UNCHANGED'|'WAITING'|'ADVANCED',added?:number,removed?:number}；不返回bot私密DTO。旧请求重放时回执只存controlResult小包，重新拼接当前PrivateView，严禁把整份视图写进回执。新客户端按正常成对快照接收，提示数量明确指该次操作，不将旧mode覆盖当前快照。

### 7.3 创建流程的响应丢失

现有POST /api/rooms没有幂等；本轮为“创建→本人入座”补齐，避免弱网重试制造孤房。

新增GET /api/room-create-ticket：响应{createTicket,expiresAt}，票据随机256位+HMAC，绑定当前可信账号sub或游客HttpOnly随机create-context Cookie，票据载荷为{version:1,nonce,actorKind:'ACCOUNT'|'GUEST',actorDigest,issuedAt,expiresAt}，签名域rvn:create-ticket:v1，首次使用有效10分钟；已有未过期create-context Cookie必须复用，领取新票不能轮换；成功创建/回执恢复时续期到不早于该回执expires_at。Cookie SameSite=Lax、Secure、Path=/、HttpOnly，有效24小时。账号切换后旧票据不能用于新账号。GET不创建房间。

POST /api/rooms新增createTicket、X-Command-Id（UUID）；浏览器提交前按account namespace将原参数/票据/ID写sessionStorage；不可写时保留内存并提示保持页面原处重试，刷新可能丢失未返回的游客创建意图，孤房按既定TTL回收；已有账号/房间恢复能力保持，不声称无存储且无Cookie时仍能恢复。返回201 {code,organizerToken,creationId}，设置原路径organizer Cookie；organizerToken使用SESSION_SECRET+creationKey+roomInstanceId域隔离派生，数据库只存hash，不存明文。

新增本业务表room_creation_requests：creation_key text主键（actorDigest+命令ID的HMAC）；actor_digest text；fingerprint text；payload jsonb（AES-GCM，含actorKind/code/roomInstanceId/createdAt）；expires_at timestamptz。不存Cookie、票据或明文账号标识，expires_at建立索引。内存索引加载未过期记录用于恢复，冷启动暂存已过期记录仅供有界清理，已过期不允许恢复；tick每次最多清理100条过期回执，在同一提交内删除数据库行和内存项。RoomRepository加入loadCreationRequests与commit同事务的creation变化；RoomService恢复索引，使用现有全局单写锁。每次LiveRoomRuntime.execute构造stage时须像claims/profiles一样复制当前creationRequests；mutation后比较新增/过期删除集合，与房间快照在同一repository.commit中提交。DB失败原service及索引均保留，提交成功才以stage替换；不能只在initialize加载索引。

actorDigest由可信账号sub或游客Cookie随机值经域隔离HMAC产生，不接受客户端自报账号。fingerprint固定为规范化[playerCount,trim后organizerName,默认化playMode,trim后有效voiceRoomUrl或null]的JSON哈希，不包含票据和字段顺序。首次POST先校验身份绑定、票据签名/有效期和规范化参数；无回执才创建并写快照+创建回执，原子成功后返回。重复同ID同指纹且actor匹配：即使首次票据10分钟已过，在24小时回执期内仍返回同房并重设同凭据；异参数409 CREATION_ID_REUSED，不创建。原房已删除/实例不同返回410 CREATED_ROOM_GONE，不能复活；回执24小时后删除，旧票据同时已失效，不可重建。GET票据和POST创建限制同context每分钟10次，超限429，保留已有回执查询能力。客户端同namespace领票单飞；首次多标签初始化导致Cookie变化时，尚未消费旧票返回409 CREATE_CONTEXT_CHANGED、不创建。只有签名票据与回执actorKind均为GUEST时，才允许用原不可公开的签名票据及原ID恢复已提交回执，不因后来Cookie变化丢失结果，且不自动绑定当前登录账号。ACCOUNT票据始终要求当前可信sub摘要匹配；退出、切号或缺失身份均403 CREATION_OWNER_CHANGED，不返回code/token，身份上游失败则503。首次消费必须kind与当前账号/游客上下文一致，绝不将账号票据降级为游客。

创建后App先保存code/pendingJoin再使用已有join-ticket入座；失败可继续原房，不把组织者token写localStorage。账号/房间切换generation使迟到创建结果不能覆盖当前页面，但其幂等结果仍可用原创建意图恢复。

### 7.4 公私DTO与错误

公开participants及game.seats增加controller，统计activeHumanCount/botCount。botControl公开只含requestedMode:'RUNNING'|'PAUSED'、effectiveMode:'RUNNING'|'PAUSED'|'SUSPENDED'、pace、version和attentionRequired通用布尔提示；不含任务队列、下一操作人、到期时间、目标、brain或内部错误。timeline公开只含mode、epoch，game.serverNow是游戏逻辑时间；room.serverNow仍为墙上时间。

本人私密DTO增加canManageBots/canStepBots/canFreezeRehearsal/canAdvanceRehearsal；权限来自现任真人房主、当前模式和公开阶段。管理能力不得根据内部未来胜负提前变化；演出锁期间冻结/推进时钟可用，但普通游戏动作仍锁定。

400参数；401账号要求；403房主/成员权限；404房间；409状态、版本、轮次；410旧创建房已消失；426升级；429容量/速率；503身份或持久化不可用。403 BOT_EXTERNAL_ACCESS拒绝外部bot席位恢复/读取；所有错误只给通用文案，不泄露角色或未公开结果。503保留原ID和输入，409刷新后要求重新决定。

## 8. 两类时间与单步的精确定义

### 8.1 墙上时间与游戏时间

wallNow继续用于心跳、30秒在线、5分钟接任、10分钟票据/恢复码、24小时创建回执、闲置回收及真实审计。lastActivityAt仍是墙上时间；含bot回收另用lastHumanActivityAt。真人心跳仍每次更新内存，metadata.humanActivityCheckpointAt每60秒或重新上线时使revision增长并持久化；正常真人命令提交也更新检查点，避免静默大厅跨重启误过期且不每次轮询写journal。

gameNow(room,wallNow)：WALL时=wallNow-offsetMs；MANUAL时=manualNowMs。初始offset=0；mode进入MANUAL仅允许LOBBY/TUTORIAL或公开RUNNING阶段，已完整公布的GAME_OVER/ABORTED不再开启，避免事后修改战报标签。开启MANUAL先取当时gameNow，再固定manualNowMs；关闭WALL设offsetMs=wallNow-manualNowMs后删除manualNowMs，使恢复点连续，允许有限负offset（测试推进超过真实时间）。每次切模式epoch++。

不允许临时改全局Date.now或共享#now来模拟单房时钟。event/deadline/assertPresentationComplete等目前只收game的辅助方法改为显式收room；restoreGame增加本房gameNow参数，确保同一tick内不同房间互不影响。所有游戏相关时间统一改用gameNow：createGame/restoreGame的阶段截止、confirmRole/submitAction/nominate/finishDefense/vote/readyToEndDay/claimSlayer中的时限、event/changed/publicGame/privateAction/公开能力与演出锁、initializeNight/finishNight/beginOtherNight、publishDue/syncImmediate/advanceBallot/captureResult。房间管理中涉及presentationUntil的检查也用gameNow。social消息createdAt/邀请码到期仍wallNow，社交“是否白天”依据已发布phase。

advanceTime先按wallNow处理真人在线，再逐房算gameNow，正常推进至该时间；MANUAL时只发布当前冻结时刻已经到期的节点，不能因为真实时间流逝继续计票或发超时。captureResult的releasedAt保留逻辑时间，另补releasedWallAt为真实审计时间；旧result迁移该字段为原releasedAt。

### 8.2 人机一步

要求mode=PAUSED。在同一事务内清理旧任务，从当前公开可执行意图中按deadline/座次顺序选一个；仅忽略思考延迟，保留真实时限、合法目标与演出锁校验。执行一个真实业务命令及其正常引擎后果，持久一次回执；该命令可能自然结算多个被动能力，但不得再顺带执行第二个人机命令。

无合法人机动作（例如等真人夜间选择或正在演出）返回WAITING且保持状态；文案统一“当前没有可执行的人机操作”，不显示是哪一位人机/角色在等待。正常多人局的墙上计时继续；单真人MANUAL必须由下一接口推进时间。

### 8.3 推进计时

仅MANUAL+PAUSED。有未来边界时，计算最小且严格大于manualNow的：pendingPublications.at、当前公开辩护/投票开始点、nextCountAt、投票结束点、presentationUntil、尚未提示超时的phaseDeadlineAt。候选按实际有效上下文过滤；不能把未来整局事件列表或候选类型返回客户端。

将manualNow设为该最小值，执行该时刻正常引擎到期处理。同一毫秒的全部公开发布按现有order原子应用，计票至多一个新座位（因为选择最早nextCountAt），不执行任何bot命令、不凭空完成真人行动。没有候选则WAITING。无论是否有人未完成强制行动，推进到阶段截止只产生现有等待超时提示，不自动选目标；重复推进不重复发同一个超时。

单步回执与推进时间在同一事务提交。重复ID不再执行，两个不同标签同时点击由expectedCommandVersion+expectedControlVersion拒绝后者。MANUAL期间可中止并reset；进入大厅后timeline重置WALL/offset0，旧game已删除所以时间原点变化不影响旧结果审计。

### 8.4 客户端时间

统一useGameClock采样game.serverNow和performance.now；WALL按本地已过时长估计，MANUAL保持样本值。按roomInstance/gameId/timeline.epoch/revision替换采样；不把慢到旧采样覆盖新值。RoomTools、PublicBallot、PlayerGame、Display、EventStage、Countdown及presentation helpers全部使用该适配器。

MANUAL时演出视觉停在服务端已到达进度，CSS/WA动画暂停、公开音效停止；advance后重建对应静态进度，不补播已经过去的枪击/钟声。恢复WALL从该进度连续播放，遵守原迟到音效窗口。换设备码/房主接任/网络更新时间继续显示墙上时间，不能被演练冻结。

## 9. 异常、并发和恢复

| 情况 | 明确结果 |
|---|---|
| fill与真人join并发 | 同队列先后执行；join在大厅按最高座号替换bot，fill只补事务时空位；最多12席，真人不被删除 |
| 两个标签同时管理 | 先提交者推进host commandVersion/control.version；后者409并刷新，不用新版本悄悄重放 |
| 暂停与已排队bot | FIFO中先于暂停已提交的动作保留；暂停响应成功后无后续自动bot提交；旧generation任务失效 |
| 夜晚/表决变化 | 旧task按game/context/ballot取消，不跨夜、不把票投向下一轮 |
| 鬼票/猎魔人DB失败 | 副本与回执一起回滚；重试只执行一次，公开事件提交前不广播 |
| 房主断线/换人 | bot不能接任；现有真人5分钟规则保留；旧房主管理命令403，不影响其普通席位 |
| 全真人暂离 | 30秒后自动bot悬置；不伪造人类心跳，不因bot动作无限续房 |
| 唯一真人主动离房 | 允许阶段删除全房及任务/公开事件；创建回执留24小时墓碑，不允许同创建请求复活 |
| 教学撤销/重开/下一把 | 旧任务、记忆、私聊应答去重清空，generation换新；所有真人重新准备；下一局非自动开始 |
| 持久化断连 | 沿用writer失效闭锁与503；不继续仅在内存跑bot；重启获锁、加载完成后才启tick |
| 服务重启 | 先迁移/校验所有快照并原子提交，再加载创建索引/资料；最后启动时钟。MANUAL原点和PAUSED保持，WALL到期按既定规则补处理，不补投过期票 |
| 手动单步结果丢失 | 原ID重试只返回该步回执与当前视图，不执行第二步；旧上下文拒绝，不按当前新阶段改造原请求 |

“暂停人机”不是全局调试锁，真人正常操作不会被阻止；进入/退出MANUAL或reset时清除客户端尚未发送的演练控制意图，已发送未知结果先判明，不能并发继续点多步。

## 10. 迁移、配置和发布

### 10.1 兼容迁移

保留RoomRecord v1→v2旧迁移。新增v2→v3纯函数，所有旧成员controller=HUMAN、无bot；botControl初始RUNNING/NORMAL/attentionRequired=false/version0/新seed与generation/空任务记忆；符合第5节的旧空大厅补pendingFirstJoin；timeline=WALL/offset0/epoch0；lastHumanActivityAt取原lastActivityAt的毫秒，缺失时取迁移墙上时间；旧game/result的hadBots/rehearsalUsed=false。已有绝对投票/演出时间不平移，不改真实身份和回执。

restore显式只接受1/2/3，未知版本拒绝；runtime初始化检测非3快照，先逐房预检并迁移到3，再一次DB事务提交且revision+1，事务成功前不监听/启tick。stage.restore对3仅校验，不重复迁移或生成UUID。新增创建回执表CREATE TABLE IF NOT EXISTS，在同业务库；现有AES-GCM/key与原表保留。

校验不变量：有bot的房间至少一真人PLAYER；有活动PLAYER时host是活动真人；无PLAYER仅允许第5节创建待入座LOBBY且无bot/game；BOT无accountId/joinTicket；MANUAL恰一真人且有bot、bot模式PAUSED、时间字段有限整数；pending<=bot数且botId归属于本房活动BOT、结构/种类/参数上限有效、seed/generation存在；过期game/context/ballot/generation/commandVersion是可丢弃任务，不作为启动失败条件。发现坏快照只报room与类别，不删房、不输出秘密。启动迁移不能把“修复”变成静默重发凭据。

### 10.2 配置

无需新外部服务、API Key或平台登记。沿用SESSION_SECRET/DATA_ENCRYPTION_KEY/DATABASE_URL，禁止发布时更换密钥。明确常量：500ms tick、11个bot/房、128个bot/进程、每tick8命令且每房1个、256回执、2KiB任务参数、创建票10分钟/回执24小时/每context每分钟10次、现行2小时/24小时TTL与30秒/5分钟在线/继任。延迟及NORMAL/SLOW表写在bot-policy常量，不用客户端任意毫秒输入。

### 10.3 发布与回退

用户另行授权实施后按阶段集成；部署仍需明确授权。本轮文档不触发生产操作。发布前重读当时ops最新AGENTS/workflow/contracts，固定游戏与控制工具版本，持有全局锁，从无进行中真人局的维护窗口开始，备份并隔离恢复验证目标库及根保护配置，只更新鸦钟夜话；不升级账号/门户或其他服务。

同一版本同时发布前后端、协议3和快照3，不先开放bot接口给旧UI。首次切换先只执行迁移/健康验收，再进行临时真人+bot验证房（遵守正式权限，正常中止/离房清理），核对HTTP/WS、资源哈希、其他容器/路由未变。生产临时房不用于验证数据库失败或破坏性故障。

schema3一经写入不得直接启旧schema2程序。尚未接受新业务写入时，可以恢复升级前备份再启旧固定版本；已接受写入则优先前向修复。需要恢复旧库会丢新进度，必须单独明确授权，不能以回退名义覆盖。创建表保留不会影响旧程序，但其存在不代表快照可向下兼容。

## 11. 实施阶段、验证和验收

### 11.1 可交付阶段

A. 数据与协议基础：公共类型/创建幂等/迁移/时间适配，机器人入口暂不出现；验收旧房间恢复、创建丢响应、旧协议升级提示及正常真实计时。

B. 大厅人机和基础策略：成员、补位、真人替换、调度与正式权限，覆盖完整AUTO局及重启；再接PAUSED/step与受限MANUAL/advance。合入前完成私密投影审查。

C. 页面交互：创建/加入/大厅→教学/身份/夜晚→白天/投票/社交→结算/下一把，统一固定操作区。首页和教程文案只复用，不再改方向。

D. 集成review：按本方案逐项核对，修复遗漏；最终构建、定向回归和隔离PG通过后才形成可部署提交。所有阶段属于同一范围，不发布功能半成品，不为单个文件另起任务。

### 11.2 自动验证矩阵（实施时执行，本轮未运行）

| 具体风险 | 最短有效验证与验收 |
|---|---|
| 创建响应丢失、刷新重复 | Fastify.inject+隔离PG：同票/同ID并发只1房；同ID异参数409；响应丢失/重启恢复原code；删除后410；过期不复活；创建后0人恢复、跨一次普通命令及重启仍保留创建回执；多标签领票不轮换有效Cookie；账号票退出/切号不走游客恢复且不返回凭据 |
| bot插入破坏席位/授权 | service/API：1真人+4/11bot，批量/满席/限额/非法count；join替最高bot，同票重试不再替换；游客/非房主/显示端管理403；bot不能外部恢复或接任；11个真人占用人机01—11的昵称后仍可加最后一席 |
| 策略越权与卡局 | 22种自认角色、5/6及7—12人、醉毒/传位/死者：所有输出目标合法；Observation相同时改隐藏身份不改变决策；完整5/6/12人混合局到结算，等待真人时不造操作 |
| 投票泄漏与串轮 | 复用原管家/鬼票/逐席用例，增bot版本；旧ballot/过期任务不投，失败不消耗；相同手势公开输出无角色专属差异；pause/换generation/重启后本轮初投与管家修正次数不重置 |
| 暂停/step竞态 | 模拟时钟+runtime队列：暂停后无自动动作；同ID单步只一次，不同标签409；成功重试先命中回执不因版本递增拒绝；纯任务规划/清理持久化；真人行动与暂停/撤销交错不串轮 |
| MANUAL计时错误 | 模拟墙上时间：冻结后等60秒，投票/演出不前进但真人可离线；advance每次至一边界/一席；恢复连续；第二真人入大厅退出；多人接口409；移除最后bot原子退出；演出内部context已变仍可按公开context推进；重启保持冻结 |
| 提前揭晓 | 录制HTTP/WS/私密/大屏完整序列， startsAt前无未来事件，结果点之前无死亡/胜负，endsAt前无全体身份；step/advance响应不泄漏内部下一任务 |
| 事务/迁移 | 隔离PG：v1/v2→3原子性、坏快照整批拒绝、创建表加密、提交失败脑状态/回执/时间/票不生效；重启重复任务只一次。禁止指向业务库 |
| 人机占用房间 | service：仅真人活动续TTL，全部离线悬置，最后真人离房删除，reset清任务记忆且保留席位；当局hadBots固定、rehearsalUsed不回退、下一局重算；公开阶段起点重启不重置 |
| 移动交互状态 | jsdom：创建/加入草稿与单飞，禁用原因，换座取消不点击，固定操作DOM层级，教学跳过，身份/夜间提交等待，鬼票确认、重连清旧目标，结算下一把及返回焦点 |
| 性能边界 | 无浏览器Node负载夹具：128bot上限附近混合房，持续10轮tick；无失控任务增长；本机单tick p95<=250ms且排队业务命令p95<=1秒；未达到先降低常量并更新文档，不承诺未经测量的容量 |

优先复用现有clockwise-voting、presentation、repairs、live-runtime、app-boundaries、PG迁移、mobile-interactions等用例；为新业务边界新增必要测试，不为文案/颜色机械断言。最终运行受影响的Web/Server类型检查、构建及目标测试，不因提交重复已经有效的检查。新bot引入协议、时间与持久化交叉影响，原相关游戏流程/隐私回归需要一次集成复核；不因此重跑无关账号加密算法或升级依赖。

### 11.3 用户手机验收

不由代理打开本地页面。上线后用户按以下流程验收，失败反馈定位到页面/操作，不能据自动测试宣称已通过。

1. 单手机创建→补满人机→开始/跳过教程→身份确认→夜间/白天/提名投票→死亡鬼票→结算→下一把；主操作不被滚动或键盘遮住。
2. 暂停人机后界面明确计时是否继续；冻结演练后可分别执行一人机操作、一计时节点，观察辩护、逐席票与演出中间状态；继续后不闪跳、不补投。
3. 第二手机在大厅加入可替换人机、双方重新准备；正式局不可跨设备接管bot身份。微信与手机浏览器分别检查返回、软键盘、头像、手势和弱网重试。
4. 房主离开/被接任、中止重开、结算/返回大厅、同房下一把都保留正确座位与权限；bot标识与“含人机/演练”战报标签清楚可见。

签收标准：以上业务不变量与自动矩阵通过，用户明确通过的真机项目记录为已验收；未验收项目逐项保留事实。任何偏差需写清实际行为、原因与影响，不能把未做浏览器验证写成已经完成。

## 12. 独立 review 记录

初审由两个只读subagent独立进行（bot_plan_review负责人机/时钟/事务，flow_plan_review负责UI/创建/成员/发布）。未改代码、未运行测试、未打开页面。下列13项已修订并纳入验收，均已通过复审：

| 编号 | 初审问题 | 修订位置与结果 |
|---|---|---|
| R1 P1 | 演练推进被普通演出锁/内部context阻止 | §7.2专用CONTROL只核对已发布上下文，推进可穿过时间锁，普通行动仍锁定 |
| R2 P1 | 删除最后bot残留非法MANUAL | §5.2成员事务统一退出不再合法的演练，控制版本只更新一次 |
| R3 P1 | 正常过期任务导致restore拒绝整房 | §6.3/10.1允许结构合法的过期任务保存，执行前丢弃，restore不执行 |
| R4 P1 | 创建到join之间空房无合法host | §5.1/10.1明确pendingFirstJoin，首位真人入座前禁bot/开局，旧空大厅可迁移 |
| R5 P2 | 初投/管家修正次数不能跨暂停重启保持 | §5.1增加当前ballot持久计数，pause/generation不清，提交原子更新 |
| R6 P2 | 10/18秒公开阶段起点不唯一 | §5.1/6.2增加publishedPhaseStartedAt并定义初始化、publication更新和旧局默认 |
| R7 P2 | 创建索引只启动加载，stage复制会丢失 | §7.3规定每个execute复制、diff、同事务提交及失败保留 |
| R8 P2 | 人机/演练战报标签赋值不明确 | §5.1固定当局标记、进入冻结单向置true、capture与下一局规则 |
| R9 P2 | 新领票轮换Cookie破坏待确认创建 | §7.3有效Cookie复用、24小时恢复期、首建多标签及已提交游客恢复规则 |
| R10 P2 | 人机昵称01—11可能全部被真人占用 | §5.1序号可继续递增，人数上限不变 |
| R11 P2 | 创建票据缺actorKind，账号可能错误落入游客恢复例外 | §7.3签名与加密回执均记录kind，ACCOUNT退出/切号403且不返回code/token |
| R12 P2 | 未来任务规划与执行被写成同一事务，纯任务变更未标脏 | §6.3拆规划/执行提交，新增/删除任务显式revision增长，失败各自回滚 |
| R13 P2 | 控制命令重试先检查新版本可能误报409 | §7.2现行授权后先查回执，只有首次执行才校验版本/上下文 |

最终结论（2026-11-10）：bot_plan_review确认人机策略、时间、事务、幂等、迁移无剩余P1/P2阻断；flow_plan_review确认创建/加入、全流程UI、成员生命周期、创建恢复与发布无剩余P1/P2阻断。两者明确达到可直接实施标准。最后仅补全releasedWallAt字段列举并澄清既有公开/私密命令响应形状，不改变已审查的业务规则。

本轮只进行源码/文档静态核对与方案review，未运行实施测试矩阵、未打开游戏页面、未使用浏览器、未修改业务代码、配置或数据库、未部署。方案状态不代表已授权实施。


## 13. 2026-11-11 实施逐项核对与发布结果

第1、10节“本轮只交付文档/另行授权”描述方案编写时的授权边界；用户随后明确授权本次实施、独立review修复及部署。实现分支codex/ravens-fullflow-bots已合入并推送main；生产已固定9e20e67，备份与公网证据见部署记录。

| 方案项 | 实际实现与核对证据 |
|---|---|
| §3 创建、加入 | Create/Join使用RoomPageShell，人数4列、简短玩法、附加语音链接、固定提交、字段错误定位；严格邀请码不删非法字符。创建票据与原命令保存在当前账号session命名空间，成功保存原房pendingJoin后继续入座；后续公私同步失败统一转原房恢复。fullflow DOM/API及创建PG回归通过。 |
| §3 大厅 | 头像/人机/房主与准备网格、空位补人机、首要禁用原因、默认跳过教学、直接座位移除确认、拖柄预览/FLIP邻项动画/取消/防误点；移动DOM覆盖12席和中断。 |
| §3 开局、身份、夜晚 | 三卡教学每卡可跳过；身份确认与等待操作固定，建议折叠；目标使用统一头像卡，确认选择独立固定区，跨上下文/重新连接清旧目标；记录新线索标记。 |
| §3 白天、表决 | 提名固定确认/取消、日落同意与撤回、公开投票条位于隐私罩外，常显门槛/计票席/已计票，鬼票确认与管家私密提醒保留；原投票/隐私/公开演出回归复用并补人机回归。 |
| §3 社交、结算、下一把 | 耳语使用RoomSheet，固定关闭、会话内部消息滚动/发送、内存草稿；结算与中止页主操作固定，公开结果后头像角色网格、复盘折叠、含人机/演练标签；reset清角色/任务/脑状态并保留席位。 |
| §4—6 人机 | 服务端HUMAN/BOT控制、现任真人房主权限、128进程上限/11每房、正式大厅补位与最高座bot替换、合法私密观察与确定性基础策略；无LLM、全房身份策略或真人代操作。5/6/12完整混合局及22角色合法目标通过。 |
| §6 任务与事务 | 持久pending/sequence/记忆；自动tick只执行入队前已提交任务，显式step可即时规划一个动作；过期绑定丢弃，社交前提重新校验；失败回滚，控制回执写当前房对象。撤回耳语/失败WAITING回执/管家投票修正跨pause与重启回归通过。 |
| §7 协议、创建 | HTTP协议3、WS protocol=3，旧客户端426；创建票据10分钟、原创建回执24小时与新表，跨普通写/重启保持且删除后不复活。ACCOUNT票退出/切号拒绝；BOT所有外部读取/恢复入口拒绝。 |
| §8 两类时间 | gameNow/setTimeline集中在bot-types.ts，与类型同文件减少拆分，不另建timeline.ts；墙上时间仍用于心跳/回收/票据。冻结自动暂停、step仅一个命令、advance仅最早真实边界，退出连续；客户端统一useGameClock，演出冻结/静音且恢复不补播。 |
| §9 异常并发 | 现有单队列副本→提交→广播保持；版本与上下文冲突拒绝、receipt先重放；第二真人加入/最后bot清除原子退出演练；无真人离房删全房。回执与时钟/任务提交失败均回滚。 |
| §10 兼容配置 | v1/v2→v3启动原子迁移；严格v3任务/记忆/UTF-8字节校验，合法陈旧任务允许恢复；旧投票截止/身份保留。无新环境变量/依赖/公共底座升级。schema3禁止直接启动schema2旧程序。 |
| §11 验证 | 人机业务43项、Web相关62项（含新增8项），真实隔离PG5项通过；负载128人机10tick：tick p95 20.4ms、排队命令p95 25.2ms；类型与构建通过。既有游戏/公开投影/生命周期/恢复定向回归补齐，相关游戏、规则、生命周期、恢复回归78项已通过。 |

两个独立只读review已修复并复审人机时钟、耳语任务、失败回执、BOT外部访问、快照结构、规划事务、记忆回收；前端review修复多人控制消失、创建后失败重复建房、大厅无WS能力、426刷新、顶层焦点/主弹窗互斥、移除确认清理、换座动画、持久冻结状态与中止固定操作。最终整合review已通过并复审闭环，审查范围内无剩余确定P1/P2；生产HTTPS/WS及人机单步/计时/同房重开已验证；真机验收单独记录。

本轮未打开本地游戏页面，未使用有头或无头浏览器。布局按CSS/DOM结构核对；320×568、375×667、390×844、430×932及844×390的实际渲染、微信/iOS/Android的触摸、软键盘、视觉/帧率仍由用户真机验收，不用自动测试代替。


2026-11-11 09:42发布核验：固定9e20e678631ae177971085d3ab16cb466a80c86e、ops控制a5145d4；全局锁内目标库备份恢复通过，仅更新游戏容器。公网资源哈希与本机已测产物一致，创建幂等/正式人机补位/暂停/单步/冻结与推进/同房重开/HTTP及WebSocket通过，临时房清理，30秒无错误，45个非目标容器与49份路由摘要不变。详细回执见[部署记录](../../unified-deployment.md)。本次全过程未打开本地游戏页面或使用浏览器，用户手机验收表仍保持待验收。
