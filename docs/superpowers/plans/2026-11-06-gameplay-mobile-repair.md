本文件保存2026-11-06用户批准的完整实施基准；下文“尚未实施”是方案交付时的历史状态。实际完成与验证记录见 docs/2026-09-27-redesign.md，不将计划要求自动视为已完成。

# 鸦钟夜话完整修复方案（用户已授权实施）

本方案依据本地游戏 d6bf34e，游戏源码与当时本地 github/main 一致。规范已按 GitHub 最新 ops main 5816c6851560b81847fa14b95b1ee747ee3aea32 读取 AGENTS/workflow/contracts。交付范围为鸦钟夜话的房间、游戏命令、视图、回执和玩家界面。实施时用游戏最新 GitHub main 新建隔离工作树，先核对代码基线变动；现有未跟踪 AGENTS 与美术文件，以及旧 ops 发布分支，分别保留待核对。本次交付方案，尚未实施。

产品口径
- 首批完成卡局恢复、命令串轮、管家身份泄露，三项共同验收后再处理 P2。
- 保留 5–12 人、22 角色、20 秒辩护和每席 1.5 秒计票。断线不自动选择夜间目标；投票到时按当前手势计票。
- 增加房主管理中止与房主离线接任。中止局无赢家，不追加身份揭晓；玩家经大厅重新准备开启新局。
- 管家采用官方玩家自律口径。公开计票与举手一致，对误投私下提醒。官方 https://wiki.bloodontheclocktower.com/Butler 明确指出扣除误投会泄露身份。故本方案替换当前自动扣管家票的产品约定，故意违规仍依赖玩家守规。
- 上次关于假魔典的判断需要收窄。传位后，死亡旧小恶魔和存活新小恶魔能同时在场。修复随机拼接产生的明显矛盾，不使用“全表恰好一恶魔”作为通用断言。官方醉毒允许给真信息，方案中的一致性约束属于本产品策略。
- 验收使用静态审查、Node/Vitest、Fastify.inject、模拟时钟和隔离 PostgreSQL。本地不开游戏页面，也不启动有头或无头浏览器。

1. 模块职责与数据
apps/server/src/rooms/service.ts 负责房间生命周期、权限、动作上下文和权威裁定；social.ts 负责耳语及换设备恢复。
apps/server/src/app.ts 负责请求 schema、鉴权、稳定错误码和 DTO；不在入队前完成最终权限判断。
game/live-runtime.ts 保留串行队列、副本计算、事务提交后替换内存和广播，负责幂等回执。
新增 rooms/presentation.ts 承载按时间公开的投影及发布队列，public/private/WebSocket 共用它。
game-engine 新增 spy-grimoire.ts，生成及校验整份结构化魔典；不另建房间引擎。
packages/contracts 增加真实 HTTP 命令/视图类型与 schema；web/api 使用这些类型，删除本次涉及字段的重复定义，保留未涉及的旧引擎表示。
App.tsx 负责统一接受快照；PlayerGame/SocialRoom/Display/SeatRing 负责对应交互。

快照 schemaVersion=2。新增字段都进入原有加密房间快照，不新增 SQL 表。
- roomInstanceId 为独立随机 UUID，用于浏览器区分邀请码复用。它与参与身份分配的私有 room.id 不同。
- setupId 为当前大厅/教学周期的 UUID。成员加入、离开、移除、座序改变、撤销教学、重置与新一局准备时重新生成，并清空全部 ready；开始教学保持。DISPLAY 加入不影响玩家阵容与 setupId。
- room.state 与 game.phase 增加 ABORTED；game.termination={kind:ABORTED,actorParticipantId,at}，不设置 winner。
- participant.commandVersion 默认 0，每个成功的成员写操作增加 1，重置和下一局保持单调递增，不能清零；participant.lastSeenAt 为现有心跳。
- game.contextId 为 UUID。在进入首夜、另一个夜晚、白天、提名表决、投票结算返回提名、公开射击结算、中止时更换。同一夜里不同玩家提交、同一轮举放手、日落确认不更换。客户端只保留一个与当前视图对应的 contextId。
- nomination.ballotId 为每次有效提名生成的 UUID，整个辩护和计票阶段固定；撤销或结算后作废。
- game.publicProjection 保存已发布的公开 phase/day/seats/counts/nomination/onBlock/winner/终局可揭晓标记；game.pendingPublications 保存有序的 {id,eventId,at,patch,eventPatch}。内部完整 events 留在加密快照。
- commandReceipts v2 为 fingerprint、contextId、actorCommandVersion、kind、可选小结果，不存完整 RoomView/PrivateView。
- joinTicketHashes 在活动成员记录上保存；离房/移除后在房间 metadata 保存对应作废哈希至票据到期。
- 每个客户端视图含 roomInstanceId、setupId、revision、serverNow、protocolVersion=2。所有已鉴权读写响应，无论 PLAYER、DISPLAY，或响应为 public/private/recovery 小结果，均附 self={participantId,mode,commandVersion}；未鉴权公共响应无 self。私密视图另含当前 contextId、ballotId（若适用）、dayReady、管理能力布尔值。秘密身份仍只进入本人视图。
- 离房成功是上述响应的终止例外：返回{left:true,roomDestroyed,organizerChanged,self:null}，不再索取已撤销成员的私密视图。响应丢失后，同一离房请求若返回403 SEAT_REMOVED或404且此前确为主动离房待确认，客户端视为离房完成并清理本机；不得为重试恢复已撤销凭据。
- publicView 的 participant 必须改为显式白名单，只输出 id、nickname、mode、seat、connected、公开准备状态及头像；不再排除几个秘密字段后展开剩余字段，防止 commandVersion、票据哈希等泄露夜间行为。

2. 写命令契约、异常和并发
本方案接口短路径均位于 /api/rooms/:code 下；复用现有start/reset/seats/ready/tutorial/complete等路由，仅扩展body与鉴权，不创建功能重复接口。
除加入/账号恢复/一次性恢复码消费外，房间成员写命令统一带 roomInstanceId、setupId、expectedCommandVersion、X-Command-Id。游戏命令另带 gameId、contextId；vote/finishDefense/cancelNomination 改为 gameId+ballotId，不校验易被同轮射击暂停轮换的 contextId。命令 ID 为随机 UUID，同一操作在网络重试时保持不变。生成恢复码属于普通成员命令并推进 commandVersion，消费恢复码继续自身一次性协议。读取、心跳与账号系统接口保持现有鉴权契约，心跳不推进成员命令版本。
运行顺序为进入 runtime 队列，在 stage 里验证房间实例和现行成员授权，查同 ID 回执；若已成功且 fingerprint 相同，返回当前视图或原最小结果。否则校验 commandVersion、setup/game/context/ballot 和业务条件，执行一次，增加 commandVersion/revision，写回执并原子提交。事务失败返回 503，状态、鬼票、能力和回执均不生效。
相同 ID 不同 payload 返回 409 COMMAND_ID_REUSED。历史回执最多256条，淘汰后的旧请求因 expectedCommandVersion 过旧返回409 COMMAND_VERSION_STALE，不能再执行。恢复码路径继续用自身10分钟的消费回执。
临时失败重发同 ID；409 先刷新，仅提示玩家重新作决定，不能把过期投票自动转发到新轮次。
400 参数错误，401 未登录，403 无权限，404 房间不存在，409 状态/上下文冲突，426 CLIENT_UPGRADE_REQUIRED，429 加入票据容量或限流，503 保存不可用。响应包含 errorCode、用户文案、可选 refreshRequired，不回传隐藏角色或等待行动者。
API 正常写响应返回提交后的当前完整视图和 self；恢复等小结果同样附当前 self，last command 的 receipt 不用于回放旧快照。客户端对同一成员业务命令单飞排队，后一动作拿前一响应版本发送，不在发送前锁定旧版本。相同成员多标签/设备并发写时第一笔成功，后笔409；另一成员正常并发不因全房 revision 变化被拒绝。
队列项在玩家点击时固化commandId、roomInstanceId/setupId/gameId/contextId或ballotId、目标和意图；发送时只能补最新expectedCommandVersion，不能替换为新轮上下文。快照显示对应周期已变时丢弃未发送旧项并提示重新操作。前笔结果不明时保持原ID和完整原payload重试，判明前不释放后续项；连续举放手只合并同一roomInstanceId/gameId/ballotId中尚未发送的意图。

3. P1 卡局恢复
在线标准为 now-lastSeenAt<30000ms，开局事务现场校验，在场PLAYER数必须等于房间既定playerCount（5–12），全员ready且在线才允许start。失联玩家自动标离线，ready不自动替其取消，但阻止开局，展示离线名单。
POST /tutorial/cancel，房主、TUTORIAL、setupId 匹配才成功。回到LOBBY，清空 assignments/game/所有 tutorialComplete 和 ready，轮换 setupId；旧 tutorial/complete 返回409。
POST /participants/:participantId/remove，现任房主，目标为另一名未离房玩家，body 含 confirm:true。LOBBY 可移除在线或离线玩家；TUTORIAL 还必须 cancelTutorial:true，先原子撤销教学再移除。其他进行中阶段返回409，须先中止。移除座位，关闭其耳语、作废恢复码/加入票据、失效 token，重新编号；清空所有 ready，轮换 setupId。活动账号房间列表自然排除该成员，历史账号认领记录保留。
POST /abort，只有现任房主可调用，body另含confirm:true；只接受RUNNING与匹配game/context。客户端两步确认“结束本局，本局不判胜负”。事务将房间与game置ABORTED，停止待处理夜序/提名计票，删除未公开发布队列，清除待播胜负/身份事件，只保留已公开历史及本人已获私密信息。ABORTED页面展示原因、退出与房主返回大厅按钮。
POST /host/claim，已有未离房PLAYER可调用（包括死亡玩家），本人当前在线、原房主心跳缺失>=300000ms、expectedOrganizerId仍匹配。成功原子改 organizerParticipantId/name/accountId/tokenHash 为接任者，旧管理凭据失效，旧房主普通玩家凭据保留。恢复心跳或另一人抢先接任返回409。DISPLAY与仅持邀请码者无权接任。
所有管理命令按当前 organizerParticipantId 对应成员鉴权，废止“只匹配历史 organizerTokenHash 就授权”。账号所有者校验在同一stage进行。
reset 支持 GAME_OVER/ABORTED 返回大厅；正常 GAME_OVER 只有终局 endsAt 发布且身份已揭晓才可执行，提前请求返回409 FINALE_PENDING，ABORTED无需等待。LOBBY重复调用按回执处理；RUNNING由abort进入终止再reset。参与者可从GAME_OVER/ABORTED正常离房，终局位置保留到reset。清除旧局准备和能力，不重置现存成员 commandVersion。
显式离房沿用现有DELETE /leave并扩展ABORTED。房主在允许离房阶段主动退出时，同一事务把管理权交给座号最小的未离房PLAYER，更新全部管理字段；无剩余玩家则删除房间，DISPLAY不能维持无人玩家房间。LOBBY离房重新编号、清空ready并轮换setup；终局离房保留该局结果中的原座号，reset再整理。所有离房都撤销旧token、恢复码和已用加入票据。进行中返回首页只是隐藏页面，不视为离房。
ROLE_REVEAL/夜晚超时仍等待本人操作；“继续”改为“延长等待”，只清等待提示并给本阶段新截止时间。重复延期不能冒充完成操作。统一管理条显示在LOBBY、TUTORIAL、身份确认、等待页、正常游戏、主页恢复卡和ABORTED页。
大厅与教学显示公开准备/完成总数；夜间仅统一等待文案，公开离线信息与角色行动等待信息不关联。
用户丢失游客设备而无可用恢复码时，现任/接任房主可以中止、回大厅移除失联座位、重新招人开新局；运行中不移交他人的秘密身份。恢复码生成入口在大厅、教学、身份确认及运行页可见，过期后出现“重新生成”，新码作废旧码，已有账号继续沿用账号恢复。

4. P1 投票与其他动作串轮
POST /vote 附加 raised:boolean，必须 gameId/ballotId 命中且本人仍有票、未到自身锁票时点。超过任何一项返回409，不消耗鬼票、不改手势、不向下一轮写入。相同提名因射击暂停后继续仍保持 ballotId；实际中止、撤销、终局或新提名后旧 ballotId 失效。
同一轮投票去重在轮次校验前完成，因此已成功的旧轮请求重试只返回当前视图；首次迟到的旧轮请求严格拒绝。
在合法同轮投票事务里先依据权威时钟冻结此前到时座位，再应用当前手势。计票推进与投票同队列；任一判断会进入下一阶段时本次手势不能再写入。
轮次在服务端生成、持久化和恢复；不得用当日编号/被提名座位代替UUID。夜间action、猎魔人射击、提名、日落确认同样校验对应contextId，防止同角色跨夜、同房间重开后迟到动作生效。
客户端busy不等于已成功；以服务端反馈显示“已举手”“已放下”“本席已锁票”。重连先拉当前轮和时钟，作废旧确认弹层和目标选择，再接受输入。

5. P1 管家
将 raisedVoteIsValid 改为只检验本轮有资格且最终提交raised，所有角色采用同一计票条件；鬼票仅在死者票真正计入时消耗，旧 countedVotes 已锁结果不重算。
管家私密视图给出已选主人及主人公开举手/已计赞成状态。存活的自认管家总是看到相同规则提醒，即使中毒也不变化；死管家只见鬼票说明。
主人没举手时，管家仍有与其他人相同的投票按钮，旁边提示“按你的角色规则，此时应放下手”。如果计票时违规，票照计，在其本人history追加一次说明（按ballotId去重）。不自动降手、不对外标违规、不因醉毒切换允许投票。
公共 raisedSeats/countVotes/票数来自同一份原始已提交与冻结数据，取消只有管家才有的“举手却未计票”。更新RULES、角色卡、指南及受影响的原有测试断言。
验收不仅检查锁票后的字段，也录制完整的服务端公开响应序列，比较有/无管家、健康/中毒情况下相同手势输入，除本来公开的普通动作外不得出现角色专属差异。

6. P2 游客重复占座
正常加入前，事务验证同房间同模式有效Cookie或账号既有座位。有则返回原participantId和当前视图，保持昵称与座位；昵称修改不借join实现。另一模式（PLAYER/DISPLAY）仍独立。
为覆盖首次响应丢失的无Cookie情况，增加GET /join-ticket?mode=PLAYER|DISPLAY。返回服务器HMAC签名的随机256位票据，载荷含roomInstanceId/setupId/mode/issuedAt/expiresAt（10分钟）。浏览器在第一次POST join前将票据保存在当前account context的sessionStorage；显式加入操作和其网络重试复用。
POST join新增joinTicket。服务端先处理已有Cookie/账号恢复，账号绑定Cookie必须核对当前登录账号归属；否则验证签名、到期和实例，再按票据哈希查成员。已用票据先恢复原成员，再考虑 setup，允许首次入座已轮换 setup 后的原请求重试；仅未用票据要求当前 setup 一致，失配409 SETUP_CHANGED。首次使用才占名额并把hash存入该成员；游客凭据由SESSION_SECRET+roomInstanceId+ticket hash确定性派生，快照仅存哈希。账号座位沿用accountToken。
离开/被移除/换设备轮换token后旧票据不能重放恢复。对已用票据先校验该成员的当前tokenHash与派生值、账号归属，失配409。已作废票据哈希保存至expiresAt。每房间最多256个未到期记录，达到容量拒绝新加入票据的使用，不淘汰可重放记录。票据有效期结束拒绝缺Cookie的重放，展示账号恢复或原设备恢复入口。
同一票据并发POST只创建一个成员。首次创建房间后，前端先保存code与pending join票据，再执行加入和后续GET，刷新可继续未完成的加入。只有明确收到未消费的 SETUP_CHANGED 才重新领票；网络结果不明时始终复用旧票据，不自动领新票占第二个座位。

7. P2 按时公开事件与终局
引擎可提前算完，网络只返回publicProjection与当前已发布event DTO。事件准备包仅含id/seq/kind/startsAt/durationMs、中性 message 及此刻已允许公开的actor/target；完整结果文案、outcome/deaths/winner/身份不预发。
startsAt之前整条未来事件都不进入任何网络响应，尤其不预告已排队的GAME_OVER类型；到startsAt后才发布准备DTO。pendingPublications、真实未来phase、未来结束时间和内部winner不进入公开视图或公开能力判断。演出锁先于内部阶段错误判定，锁内请求统一返回409 PRESENTATION_PENDING及当前公开视图，不能用“游戏已结束”错误提前暴露内部终局。
该约束覆盖整个私密DTO的可推断控制字段：canAbort/canReopen/canRestart及其他游戏动作能力在演出锁内统一false；恢复码、只读查看和安全离房入口按既定公开阶段提供。ballotId/contextId只返回已公开阶段对应的投影值，不能返回内部提前切换后的值。presentationUntil仅返回当前已公告演出的结束点，phaseDeadlineAt仅来自当前公开阶段；未来事件排队长度、真实终局阶段及未来deadline留在服务端。命令校验先命中演出锁，因而不会通过内部context/phase错误泄露结果。
固定时间口径如下
- NOMINATION与NIGHT_FALLS于startsAt公开阶段与已知目标。
- SHOT、EXECUTION于startsAt+2800ms公开是否死亡、死亡座位与公开存活人数。
- DAWN于startsAt+2100ms公开死亡、白天phase和day。
- VOTE_RESULT于startsAt公开本轮最终票数、平票和处决候选。
- GAME_OVER于startsAt+2100ms公开胜方，endsAt公开全员身份、酒鬼真实角色及storytellerDecisions。
- NOTICE用自身startsAt，身份NOTICE不得早于终局endsAt。
先完成的结果不能被后一个事件的最终aliveSeats快照提前带出。patch按引擎动作时的中间结果构造，每个公开死亡只携带本次变化，依(at,eventSeq,START/RESULT/END)排序应用。
在线、准备、已提交举放手、逐席冻结countedVotes/鬼票消耗、日落同意数属于即时公开数据，每次对应命令或时钟stage同步更新投影并提交，不等待动画节点；已安排但尚未公开的死亡、生存总数、胜负与身份只能由发布节点更新。
500ms时钟任务将所有已到期发布点作为一次stage提交，更新publicProjection/DTO及revision后广播。不得早于 at 发布；正常发布上界为 at+500ms+事务及网络耗时，不声称 at 当刻所有浏览器已经收到。重启按持久化时间继续，过去已发布点不重复。命令可用性同时考虑真实phase和演出锁，未公开切换的下一阶段一律不可操作。
publicView、privateView.game、顶层state、Display、WebSocket、HTTP重试回包共同使用投影；私密终局role、history中全员身份、decisions同时受终局发布标记控制。本人在夜间按能力应获的私密线索照夜序提供。
room_public_events仅写已公开DTO；同一event在准备与结果发布时用同键upsert更新。内部完整历史只保留于加密快照/journal。中止清理队列且禁止旧GAME_OVER结果再被释放。
投影无变化的轮询不增加revision；发布点到时必须增加，即使引擎没有新动作。轮询与WebSocket均按revision拒绝旧结果。新UI对准备包显示中性文案，跳过演出只收起本机动画，结果等服务器发布。

8. P2 整份假魔典
先生成统一结构 {entries:[seat,roleId,perceivedRoleId,alive], reminders:[kind,ownerSeat?,targetSeats]}，健康和醉毒都通过同一个渲染器，提醒字段种类一致。提醒显式映射现有 poisonSourceSeat/poisonedSeat、protectedSeat、redHerringSeat、usedAbilitySeats、virginSpentSeats、butlerMasterSeat、informationPairs。POISON 的 owner 为 poisonSourceSeat；MONK/RED_HERRING/BUTLER 的 owner 从实际 assignment 找对应角色；USED/VIRGIN 的 owner 与 target 为同座；PAIR 的 owner 为 observer 且 target 保持目标/干扰次序。来源不存在时省略可选 owner，不捏造来源；不创造当前数据没有的传位历史，不从玩家展示文本反解析。
健康间谍使用实际完整快照。中毒间谍从完整真实候选与完整扰动候选选择，沿用现有确定性seed/历史权重，选择结果每夜持久化一次。
扰动候选从真实结构复制，冻结间谍本人、所有当前邪恶角色与所有当前小恶魔座位。仅在其他相同生死状态的善良玩家中交换两个完整角色身份包；角色身份包含自认角色及其角色来源提醒。角色拥有的提醒owner和target按同一交换映射重写；公开生死保持原座位。冻结的小恶魔包含死亡旧小恶魔，不需额外重建继任链。
生成后验证人数/座位、真实角色多重集合、酒鬼自认未与在场镇民重复、角色拥有的提醒与角色相容、引用存在、既知自身信息和公开生死一致。复制同一真实角色多重集合允许历史多个小恶魔。
假候选不能出现真实“间谍自身中毒”提醒。若存在该提醒，把同一投毒来源的目标改为另一个合法座位（排除自身和投毒者，保留同种醉毒标记结构）；候选校验失败即丢弃。无合法交换候选时使用完整真候选；真信息是合法选择。
未来历史可能让玩家推断醉毒，不能保证所有谎言永不被识破；验收保证结构、已确定自身情报和公开事实一致，不随机拼装各行、不把真实提醒拼在假角色旁。

9. P2 回执、持久化与恢复
普通返回当前视图的成功命令只存成功标志、fingerprint、context与执行前commandVersion；recovery生成保留恢复码+expiresAt小结果，recover消费保留id/mode/seat及重发凭据所需小结果，继续生产快照加密。账号claim的一次性记录继续使用原表和事务。
旧回执迁移时，完整room/private视图转换成功标志；通过结果形状识别的recoveryCode/expiresAt及recover token结果保留。无法安全分类的旧小结果先原样保留，超过16KiB的未知形状阻止迁移并报告房间code与类型、不输出秘密内容。
保持256条回执上限、100条每耳语消息上限、80条耳语上限及500版journal现有保留策略。先消除回执复制，暂保留当前串行和全快照复制架构。
量化验收使用固定6人、100条500字符耳语夹具，commandReceipts序列化<=64KiB、完整房间快照<=256KiB；回执中不得嵌套messages/history/game.events/participants。同时验证最后256条重试无重复副作用，以及被淘汰回执因commandVersion而拒绝。

10. 实际交互修复
- 快照回退。GET room在pulse事务完成后读取runtime.service当前视图。App/Display用同一acceptSnapshot reducer，按(roomInstanceId,revision)更新room与privateView整体，旧请求不能只覆盖其中一半；相同revision只接受更大的serverNow。同一account context/room导航增加requestGeneration，切账号/换房后迟到结果丢弃。
- 耳语草稿。draft提升至常驻PlayerGame会话状态，key为roomInstanceId/gameId/participantId/whisperId；仅内存保存。主动切页、提名进入、公开演出不会卸载草稿。发送时记 draftVersion，成功只清除同版本草稿，不能擦除等待响应时新输入的内容；主动丢弃、离房/换账号/重置时清除。对方结束耳语时保留草稿为只读，可复制或丢弃，不能发给其他对象。
- 提名提醒。保留当前ACTION/TOWN/RECORD选项，屏幕顶部固定公开表决条，显示目标、辩护/计票进度、本人已提交手势与可投状态；点条可进入完整投票。保留全局演出。
- 后台恢复。隐私幕只遮身份、私密线索、夜间选人、耳语和角色帮助；公开表决条始终可操作，含鬼票二次确认。聚焦/可见恢复立即刷新，刷新完成前禁用投票并显示“正在同步”，刷新后使用当前ballotId。隐藏私密DOM inert/hidden且关闭角色帮助，焦点不会落入被遮内容；始终显示公开手势不会暴露角色。
- 日落确认。POST day/ready新增ready:boolean，私密view.dayReady与公共readyCount同源。本人已同意显示“撤回同意”，0到1或1到0计数正确。新提名、猎魔人射击或投票结果变更清空全体确认并轮换contextId；重复确认不加数。最后一份同意与撤回按队列先后处理，已进夜晚的撤回409并刷新，不能撤销已发生处决。
- 提名取消按钮严格按服务端canCancelNomination显示，计票开始后立即不可用，文案说明撤销仍消耗双方当日次数。
- 中止、等待、接任、恢复码和断线提示贯通全部阶段；在线状态区分网络断开/账号验证暂不可用/保存失败，403授权失效退出原席位，503保留座位并允许同ID重试。

11. 旧数据、客户端与发布兼容
启动迁移在对外监听前、获得既有writer锁后进行。schemaVersion缺失为v1。先在内存预检全部目标房间与公开事件，全部可转换后，用单一事务保存v2快照与需修正的公开事件。为每个旧房间生成roomInstanceId/setupId/contextId/ballotId及成员commandVersion=0，并持久化revision+1；重复启动读v2不再生成。预检或事务失败不部分迁移，保持旧库可由旧服务继续使用。
已有投票保留defenseUntil、voterOrder、nextCountAt、已冻结countedVotes、ghostVoteSeats和其结束时间；已扣管家票与已用鬼票不追溯改写，本轮剩余未锁票用新公开一致口径。向所有玩家给统一“服务已更新，请刷新”提示，不指出任何角色。
初始化publicProjection要以已有events顺序回放所有已到期节点。raw game当前最终态不能作为旧事件前的基底。基础生死为原始全员存活，再按公开死亡事件回放；处于尚未公开黎明的夜晚，以现有 nightStartAliveSeats 恢复夜前公开生死，包含夜内击杀后守鸦人等待。phase/day按身份确认、NIGHT_FALLS/DAWN/提名/结果/终局重建。实时 nomination 以当前状态覆盖历史提名，raisedSeats由voteSubmissions派生，保留已计countedVotes、countedSeats、voterOrder、nextCountAt、defenseUntil和新ballotId；当前nomination缺失且公开历史存在撤销则保持空，不复活旧提名。ghostVoteSeats、readySeats（日落确认）、onBlock、nominatedBySeats/nominatedSeats和公开准备/在线状态从相应当前已生效字段补入；不得用它们覆盖尚未发布的生死、胜负。旧事件有startsAt和durationMs则用新里程碑；旧legacy事件无时间则视为升级前已公开。重建不出的非标准快照拒绝本次升级，报告房间code和缺失类别，继续旧版本服务；不猜测角色和票数。
旧回执按第9节压缩，旧journal只按原保留窗口自然淘汰，不批量删历史。历史数据库公开事件属于服务端资料，升级事务将“当前尚未发布”的行改为准备DTO，之后随发布upsert；既已对外泄露的信息无法撤回。
新版前后端同一游戏镜像发布。请求加入X-Ravens-Protocol:2；缺少或不支持的写请求426并附刷新提示，旧客户端仍可读取其原有字段，新字段增量返回。老版遇到426可显示错误文案，用户刷新后使用现有Cookie恢复。
本方案选新协议发布后的首个部署窗口为进行中局自然结束的维护窗口，以降低v1活动局迁移风险；恢复代码仍必须覆盖v1正在投票/夜间的备份数据，不能只测试空库。
无需新环境变量，保留生产SESSION_SECRET/DATABASE_URL/DATA_ENCRYPTION_KEY等。30秒在线阈值、5分钟接任、10分钟恢复/加入票据、500ms时钟、256条回执用命名常量共用，响应携带绝对deadline，前端不另算阈值。
执行发布须用户另行授权，在ops读取当时最新规范并持有 /run/lock/fribench-deploy.lock，固定游戏提交/镜像，备份目标快照/回执版本后只更新本服务。
回退规则：迁移事务失败不启动v2；v2未接收新业务写入时可恢复部署前快照再启动旧版。v2已接收写入后禁止旧二进制直接读v2快照，优先前向修复；若必须回退，须接受备份后局面回退并明确授权，不能静默丢局。

12. 实施顺序、验证与完成判据
第一阶段，P1。统一协议上下文/成员命令版本、生命周期接任中止、大厅移除与恢复入口、管家公开一致。同步交付全部阶段管理入口、旧轮投票刷新/错误提示、管家私密提醒等最小必要UI，不将P1的可用性拖到第三阶段。建立针对已复现反例的回归测试，更新对应规则文档，通过后形成可集成提交。
第二阶段，P2。重复入座、防信息提前公开、回执压缩、假魔典、旧数据迁移，补API/数据库集成测试。
第三阶段，移动界面与完整体验。完成第10、13节的统一快照reducer、草稿、公开投票条、日落撤回、信息精简、角色网格、头像、拖排、快速开始和结算重开。P1管理能力已在第一阶段可用，第三阶段统一其视觉与触摸交互。

最低验收矩阵（均不开浏览器）
A. 5/6/7/12人正常准备、教学、首夜、白天、表决、夜间、终局与重开，既有规则用例复用；200场六人模拟覆盖原规则。
B. 30秒离线临界开局拒绝；教学撤销和迟到完成；原房主离线5分钟临界、两人同时接任、原房主先恢复、旧管理凭据无效、玩家权限仍有效；中止不公布新身份且不再出旧事件。
C. 同轮重试/跨轮首次迟到/跨局/跨夜/换设备旧token/已耗尽鬼票/本人截止时间；无任何错误副作用。
D. 管家完整公开响应序列与同手势普通玩家一致；主人先后计票、放手、管家中毒/死亡；私人提醒不泄露醉毒。
E. 同Cookie异昵称、同票据并发、首次响应丢失、票据过期/撤销/跨房、账号与大屏隔离，始终不重复占座。
F. 每类事件里程碑前1ms调用发布函数不得泄露，当刻/后1ms手动tick发布正确；真实500ms调度不得早发且下一tick可见。重启赶进度/重试/WS/GET一致；中止后无延迟发布。
F2. 同一猎魔人射击声明、实际终局/未终局两组，结果发布前按各角色本人、房主和DISPLAY分别比较公开可推断的状态、能力、context/ballot和时间字段，除各自原已知秘密外完全一致；未来事件类型和终局排队长度也不泄露。
G. 两次小恶魔传位、酒鬼、隐士/间谍登记、醉毒全真/扰动、无合法扰动备选；所有假提醒符合选中结构，重试不变魔典。
H. 100条耳语体积上限、256回执内重试、淘汰后重试、持久化失败/连接锁丢失；明确commit失败内存回滚。
I. v1/v2备份迁移幂等、正在投票恢复不重扣鬼票、旧恢复码可用、旧客户端426、schema未知拒绝启动。
J. Vitest jsdom/happy-dom组件交互（沿用已安装环境）：旧轮询晚到、换房/账号晚包、草稿跨标签/提名保留、后台隐私和公开表决、日落确认撤回、恢复码过期再生成、所有阶段管理入口可达。无需浏览器布局验收。
验证命令用现有pnpm test定向文件；web build 已含 tsc，不重复跑同一web类型检查，其他受影响包各跑其必要类型检查；构建确认schema和导出接通。涉及快照原子性必须在专用TEST_DATABASE_URL隔离库运行PG集成用例，缺库则该项验收未完成，不能用mock代替通过。浏览器/真机体验列为待用户另行安排，不作为本地代码修复完成的声称证据。此前70项通过仅是旧版本基线，不充当新实现验收。
文档同步更新现有rooms/RULES.md、docs/2026-09-27-redesign.md、docs/unified-deployment.md中实际受影响条目，记录真实验证和迁移/回退口径。计划本身先交付于聊天，实施后按项目已有docs/superpowers/plans命名约定登记。
实施属于大修，获实施指令后创建Goal，包含以上范围、完成矩阵与禁止本地页面验证；本次方案不启动实现Goal。

13. 移动端界面与全局操作规范

13.1 信息层级与文本
保留现有哥特风格、角色美术和主要色彩。移动端统一为顶部阶段与“更多”、中部当前任务、底部当前主要操作及“行动/城镇/记录”三个入口。每屏只保留一个主要操作；投票期间公开表决条跨标签固定。房间码、邀请、音频房间链接、恢复码、管理操作收进同一“更多”，私密内容遮罩保留清楚入口，避免四角浮动按钮遮挡。
默认界面同一事实只出现一次：阶段名称放顶部；操作卡只写“现在做什么”；已提交状态与按钮合一；公共事件只显示最新一条，历史放记录；角色规则、机制解释和新手提示放详情。标题原则上不超过14个汉字，默认说明不超过40个汉字，完整规则不截断。关键等待状态必须指出“等待其他玩家/正在同步/请求待确认”，不以重复长段落填空。离线名单、错误及不可逆操作后果保留，不能为了减字隐藏。

13.2 角色图鉴
22个角色使用二维网格，320–359px为3列、360–599px为4列、600–899px为5列、900px以上6列。卡片显示既有角色小头像、中文角色名与阵营类型点，不展开长段说明；顶端一个类型筛选。角色美术使用已有small.webp与大图版本，固定宽高避免跳动。
点击卡片打开唯一角色详情层：手机为全高面板，桌面为侧边面板；展示大图、名称、能力、操作时机、示例与注意事项，支持当前筛选内上一位/下一位，关闭后保留筛选和滚动位置。不叠加第二层详情。键盘可焦点进入、Escape关闭，浏览器返回先关闭详情。公开角色图鉴与本人秘密身份卡明确分开，图鉴不标出本局在场角色。

13.3 玩家头像与大厅
玩家公开头像与秘密角色美术完全独立。复用现有统一身份接口的picture，服务器只接受 https://auth.fribench.cn/assets/avatars/vN/id.webp 的合法版本与ID且无query/hash/userinfo；沿用平台头像验证口径，不把整个game-kit引入该项目。游客、旧数据、无合法picture或图片失败时，以participantId稳定散列得到中性颜色与昵称首字占位；不额外增加上传或头像商城。
新增participant.avatarSnapshot，入座时保存已验证头像URL或中性占位标识，在同一局固定，不因头像加载失败改变座位尺寸。大厅主动恢复账号时可更新为其最新可信头像，开局后留至下一局更新。public participant显式白名单加入avatar；结算按本局快照保存头像。
手机大厅复用3/4列紧凑座位卡，12人至多4行；显示座号、头像、昵称、房主标识和准备/离线状态。桌面保留环桌或宽屏布局。长昵称单行省略，点卡片可看全名和对应管理操作；准备人数只在一个地方显示。邀请默认收起，点击展开房间码、复制链接和二维码。

13.4 调整座序
扩展现有POST /seats，房主、LOBBY、通用setupId匹配，body={participantIds:[完整在场PLAYER序列]}加通用命令字段。数组必须无重无漏，不含DISPLAY；成功按数组重排seat，清空所有ready并轮换setupId，返回权威新布局。相同已提交命令重试只返回当前布局。撤掉仅凭DISPLAY身份即可改座序的旧权限，公共大屏展示顺序但不作为管理员。
仅座位卡上的拖动手柄启用Pointer Events，手柄touch-action:none，卡片其余部分仍能正常滚动。移动8px后开始拖动，使用pointer capture；拖动中只变本机预览，pointerup发送一次完整序列，pointercancel、来电或离开页面则取消预览，不写服务器。
提交期间锁住本机拖排和开始按钮；成员加入/离开/被移除或其他设备先改顺序导致setup冲突时，409恢复服务器顺序并提示“人数或座序已变化，请重新调整”。提供点击两席交换或“前移/后移”的等价无拖动操作，兼容触摸辅助技术。顺序调整成功后明确提示需重新准备。

13.5 一键开始、跳过教学和等待
大厅只保留一个开始主按钮。POST /start新增tutorialMode:SKIP|OPTIONAL、markHostReady:boolean。执行时重新检查人数、当前setup、全员在线与其他玩家ready；markHostReady仅可把房主本人置ready。房主是唯一未准备者时按钮为“准备并开始”，其他人没准备/离线时禁用并显示人数和名单，不能代其他人准备。默认SKIP直达ROLE_REVEAL；OPTIONAL进入三张以内的新手教学卡。
教学每名玩家都可“完成/跳过”，都只更新自己tutorialComplete；全员完成或跳过才进入身份确认。房主可撤销教学回大厅，无“一人强制全员跳过”。跳过教学不跳过身份确认，每人仍必须亲自查看并确认身份。等待页只显示完成总数、一个帮助入口和管理/恢复入口；夜间不公开等待哪个秘密角色。
一键开始成功即进入本人下一阶段；超时显示“结果待确认”并用同一commandId重试，不能新建另一局。开始与拖排/踢人串行裁定：先成功的改变状态或setup，后者409，不能两者都成功。

13.6 踢出、重开、下一把和结果留存
踢出确认层写明对象与结果；TUTORIAL确认同时撤销教学。进行中“踢出”不可直接转移身份，提供“中止并返回大厅”后再移除。被移除客户端收到403 SEAT_REMOVED后立即清除本人私密视图/草稿/恢复码，回加入页；旧token和旧恢复码无效。移除不是永久封禁，持邀请码仍可重新申请一个新座位。
新增POST /reopen实现一个事务里的“结束当前流程并回大厅”：房主、confirm:true、匹配game/context（如存在）；TUTORIAL执行撤销，RUNNING执行abort规则后reset，ABORTED直接reset，GAME_OVER先检查finale已发布，否则409。保留同一房间码、人数设置、现存成员、座序、头像；清除游戏及全员准备，生成setupId，保留成员commandVersion并对本次发起者递增；gameId只在下一次真正开局时生成。界面按阶段只提供一个“返回大厅/重开本局/下一把”，不并列重复按钮。RUNNING确认明确“本局不判胜负，所有人返回大厅”。
正常终局只在服务端endsAt已发布后允许“下一把”；所有客户端收到新setup后回大厅。新增room.lastResult，仅保留最近一次正常结束的公开战报：gameId、releasedAt、winner、reason、days、participants[{id,nickname,avatar,finalRole,perceivedRole?}]。在终局endsAt事务内生成一次，reset保留，下一次正常终局替换；中止不生成假胜负，也不覆盖上一场正常战报。访问需当前有效成员或该场仍有有效凭据的参赛者，邀请码匿名者无权读取。公共房间GET不自动带战报；GET /result鉴权后返回。本人换账号、被移除、原凭据撤销后失去访问权。

13.7 结算演出
沿用5秒GAME_OVER时间轴：开始只展示中性终章过渡；+2100ms服务器公开胜方后显示胜负主题与简短结果；endsAt收到公开身份后显示头像与身份网格、胜负原因和“下一把/返回首页”。胜负色、徽章与简单transform/opacity动效足够，不引入粒子库或阻塞主线程的长动画。
“跳过动画”只跳过本机视觉，不能读取未来结果、提前下一把。prefers-reduced-motion时省略运动但保留结果；动画加载或执行失败直接显示当前已公开阶段。后台恢复或中途重连按serverNow显示已到达的阶段，不从头强播旧动画。声音由用户手势启用，静音/自动播放被拒不影响任何流程。

13.8 微信与手机浏览器
适配宽度320、360、390、430、768、1024px及横竖屏。正文至少14px，输入框16px，触摸目标至少44px，主要按钮至少48px；行动区不横向滚动，手机投票玩家用紧凑网格。以360×640为主，阶段、当前任务和主要操作无需上下寻找；小屏/放大字体允许单层页面滚动，不用裁切强塞。规则全文、历史记录和角色网格允许必要滚动，不用嵌套滚动区域。
基于能力检测适配微信内置浏览器、iOS Safari、Android Chrome，不靠UA分叉业务。高度用100dvh并提供100vh回退，加safe-area-inset；键盘打开时用VisualViewport可用高度调整输入区，不支持时允许正常文档流滚动。弹层只保留一个主滚动容器；禁止用body固定高度把输入框锁在键盘后。
拖动用Pointer Events并保留点击替代；剪贴板/系统分享失败时保留可选择的房间码、完整链接和二维码；外部语音房间用普通链接并提供复制，返回后重新同步游戏。核心操作不依赖全屏、自动音频、振动、微信SDK或弹出窗口。微信登录沿用现有同源会话流程，不新增第三方存储依赖。
返回键优先关闭当前详情/弹层，然后返回上一应用视图；从对局回首页保留座位并显示继续入口，只有显式“离开房间”且在允许离开阶段才清除席位。删除为困住用户而反复pushState的返回拦截；不可离房阶段说明当前仍占席并给出恢复入口，不强制跳转循环。
HTTP业务请求10秒无结果展示“结果待确认”，保留commandId与原payload；AbortController只取消本地等待，不能当作服务端撤销。鉴权上游5秒超时按503临时不可用处理，不误判成踢出。WebSocket暂时中断退避重连并拉快照，1008只用于确认凭据被撤销/无权，不用于上游暂时故障。重复举放手合并尚未发送的本地意图，已发送动作保持原ID；界面区分“正在提交”与服务端确认手势。
列表头像使用既有小图、固定比例与延迟加载；只有拖动卡和动画节点更新transform/opacity，时间显示局部刷新，不每100ms重绘整个App。真实微信/手机的帧率与键盘行为需真机验收，静态和DOM测试不冒充该结论；本地不开页面。

13.9 新增验收和文档
DOM/服务测试覆盖12人长昵称、头像缺失/加载失败、角色筛选/详情关闭恢复、拖排成功/取消/阵容变化冲突/点击替代、开始与拖排竞争、仅房主代自己准备、逐人跳过教学、离线等待、踢人清秘密、重开旧请求失效、正常终局提前下一把被拒、战报权限和保留、跳过动画不提前揭晓、后台恢复不重播、草稿新版本不被旧发送结果清空。
命令队列专测：旧轮未发送的举手跨轮后被丢弃，同轮合并保留最终意图，已发结果不明时不放行下一命令，成功后只更新后一项expectedCommandVersion而保留其点击时上下文。
移动验收清单固定为微信内置浏览器、iOS Safari、Android Chrome的窄屏、键盘、返回键、横屏、弱网和切后台；将未执行的真机项目逐项标注，不把无本地页面验证改成偷偷启动headless。现有开发/阶段文档同步第13节实际完成部分及真实验收范围，未实现项不提前写成已完成。

阶段提交只代表可集成；首次上线必须同时具备该版本所需的协议、快照迁移和旧客户端426处理，不允许把缺少迁移的P1中间提交直接发布。

参考资料
- 管家官方规则：https://wiki.bloodontheclocktower.com/Butler
- 醉毒信息可真可假的官方规则：https://wiki.bloodontheclocktower.com/States
- 间谍官方说明：https://wiki.bloodontheclocktower.com/Spy
- 指针交互：https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- 移动可视区域：https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- 浏览器自动播放约束：https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay


交付记录：2026-11-06。方案经独立子代理首轮审查、修订及最终复审通过。本次只读审查与编写方案，未修改游戏代码、配置、服务或数据，未运行测试，未打开本地游戏页面，也未使用有头或无头浏览器。既有测试结果仅作为审查基线；本方案列出的新增验收均须在实施后执行。
