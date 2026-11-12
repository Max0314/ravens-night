# 2026-11-12 全角色演出、纸张交互与微信适配完整实施方案

状态：两路方案review完成，用户随后授权实施、检验和部署；实现及独立代码复审完成，2026-11-12 12:38已固定72440b9发布（真机感官待验收）。以下§1–15保留方案阶段的设计与审查事实；本次实施由用户后续明确指令授权。已执行定向Node/DOM测试、媒体/帧/哈希检查和产物构建，未使用浏览器、未打开本地游戏或动效演示页。实施及部署状态见§16和既有阶段/部署记录。

## 1. 范围、基线与已确认决策

代码基线：`0fe49605c9f1d3bcf9c346438767254bfc6bd65a`，已上线声画实现为 `a73600f`。前序实施记录为 `2026-11-12-effects-invitations.md`，不重写其已发布事实。本次实际读取 Fribench ops GitHub main `964c0ba2357810506ba4d9e883d217f377ea0615` 的 AGENTS/workflow/contracts，时间为 2026-11-12 02:54 UTC。未来实施接入或发布前重新读取，不改中央账号、公共路由、公共依赖和数据库表。

| 编号 | 本轮必须交付 |
| --- | --- |
| R1 | 所有正常处决改回落刃断头台：死亡、执行后未死亡、无人处决三个分支；现有绞刑架代码/素材保留但完全停用 |
| R2 | 实录重钟：入夜三声、黎明两声；音色、间隔、尾音及氛围不同；不再把钟声或预备撞击复用于普通操作 |
| R3 | 枪击的非规则裂纹、飞溅玻璃、真实可见 UI 的局部折射；命中与未死亡都有玻璃，只有公开死亡分支有血与短叫 |
| R4 | 枪伤短叫、夜死长叫各不少于三个版本；下毒附带咳嗽；展翼有扑翼与空气受压声；全身管家完整鞠躬，保留已认可 My lord 声线 |
| R5 | 全部 22 个角色都有专属身份演出；每次合法收到新情报均有完整演出，包含自动情报和条件触发；不以短提示代替，也不伪造被动角色的新信息 |
| R6 | 继任者看身份更替；原恶魔看死亡/力量延续但不见继任者；其他爪牙不自动获知；白天继任的身份通知在当晚进行 |
| R7 | 真实纸张采样、跟手卷页、松手完成或回弹；手势和按钮同一控制器；保留上下滚动、分类、关闭与返回位置 |
| R8 | 按钮、菜单有克制的按压/展开反馈及语义音效；总静音优先，线上/线下仍只决定私密声音 |
| R9 | 微信所有页面、弹层、加载/异常、键盘及安全区域使用深色；页面自身不出现白边，不承诺网页可控制微信原生栏位 |
| R10 | 现有无联网动效演示页覆盖新增分支/角色/音轨，支持暂停、单步、拖进度及慢速；不连接真实房间 |

不改已认可首页版式、固定圆形圆桌、提名计票规则、机器人策略、加入/换房事务或语音系统。保留非阻塞提名卡、手册中举手/合法枪击入口、隐私边界、返回阅读位置及减少动态效果设置。此次加入的接口仅记录“演出已看/已跳过”，不改变游戏进度。

## 2. 现状与必须修正的触发链路

- `App.tsx` 当前在手动提交目标后创建 `PrivateReceipt`；自动收到的厨师、洗衣妇、图书管理员、共情者、间谍等情报不经过该链路。`EventStage` 私人演出只有约 2300/3000ms，遇公开事件会 compact，并隐藏大图。因此不能只补几段 CSS。
- `service.privateMessage` 已按座位持久化有序私人历史；情报已先经过醉毒/误导选择，再进入历史。间谍已有当夜实际获得的快照，洗衣妇等已有候选组。以这些**已展示结果**产生结构化演出，不从中文文本反解析，也不重新读取后台真值。
- 共情者的邻座目标目前延后至公开天亮才放出。新演出不得借头像、标签、资源名或事件数量提前放出这些目标。
- 占卜师当前在首夜及其后各夜行动，可选自己/死人；变量名 `living` 实际取所有 assignment，不是目标规则故障。缺少演出来自通用 DIVINE 回执无专属音画、自动信息未入队及阶段切换压缩。
- 当前昼夜钟为合成正弦；玻璃主要是等角射线；管家是身体裁片旋转；纸张为噪声和整面 CSS 旋转。均替换为下文有明确输入、时序和降级的实现。
- 现有全局 dark/theme-color/viewport-fit/safe-area 基础已存在，微信适配是补齐所有状态和门户根层，不能宣称此前完全未做。

## 3. 模块职责与改动边界

| 模块 | 具体职责与输出 |
| --- | --- |
| `packages/contracts/src/experience-timing.ts`、`experience.ts`、`room-views.ts`、`room-protocol.ts` | 演出 v4、协议 6、私人演出描述联合类型与 ACK 请求/响应；保留 v1–3 解释器 |
| `apps/server/src/rooms/service.ts`、`presentation.ts` | 在已有结果选择点生成描述；隐私白名单投影；继承通知门控；幂等 ACK；公开结果按时发布 |
| server app 路由、runtime/repository 恢复入口 | 同源认证、schema 校验；ACK 经既有串行事务落盘；启动迁移；不在 GET 中写入 |
| 新 `apps/web/src/presentations/private-scenes.ts` 与 controller | 按描述去重、排队、暂停恢复、已看回执和重播；只持有本席已授权数据 |
| `EventStage`、新 role scene registry、`styles/experience.css` | 真实游戏/演示共用时间轴；断头台、角色专属场景、局部折射与全身鞠躬；不修改圆桌几何 |
| `experience-audio.ts`、`book-audio.ts`、新增 UI audio adapter | 共用一个 AudioContext/总线、真实采样、语义 cue、尾音、抢占和声音偏好；取消重复合成器 |
| `GuideOverlay`、新 page-turn controller/renderer | 原内容布局不变；手势/按钮统一、纸张卷曲、纹理缓存、返回与焦点恢复 |
| `RoomTools`、公共按钮/菜单入口 | 一次交互一次反馈；成功等待结果；不对 disabled/hover 发声 |
| `index.html`、全局 touch/mobile CSS、viewport helper、所有 page/portal 根 | 深色根面、安全区、键盘/旋转/隐藏；仅内部容器滚动 |
| `EffectsPreview`、素材准备脚本与来源清单 | 全角色/分支合成夹具、可确定回放、资产重建、许可和体积审计 |

实施可并行分为后端协议/隐私、音画资产/场景、纸张/全局交互三个边界；协议先冻结，主代理负责 App/controller/音频总线集成，避免两个代理同时修改这些公共文件。独立 reviewer 不承担实现。

## 4. 数据、协议、权限与兼容

### 4.1 版本与持久化

HTTP/WS 协议由 5 升 6：更新协议常量、view literal、请求 header、WS 握手与夹具；旧协议使用既有 426/刷新提示流程。`PresentationVersion` 增加 4；**新局**使用 4，已存在 v1–3 对局和历史事件仍使用原时序，不把旧事件改长。`isNonBlockingExperience` 对 v3/4 的 NOMINATION/VOTE_RESULT 均为 true。

快照 schema 由 4 升 5，新增以下私有字段；不加数据库表、不换 repository。加载继续接受既有 undefined/1/2/3/4：仅旧≤3执行原有补全至4（原有presentationVersion=1/startInfo LEGACY兼容行为只留在此步），4→5只增加新字段，保留presentationVersion、startInfo、原事件和待发布任务；5只校验，不重迁移。校验后在启动恢复事务中提交schema5再提供服务，runtime启动迁移检测阈值同批更新，staging每次restore不能触发再次升级。未知schema/演出版本拒绝加载并报清晰日志，不静默丢弃。GET不迁移、不产生描述、不写Seen或释放通知；保留现有GET更新presence的语义，不顺带重构。

```ts
type SceneKind = 'IDENTITY' | 'ACTION_SUBMITTED' | 'INFORMATION'
  | 'EVIL_START' | 'ROLE_CHANGE' | 'OLD_DEMON_CONTINUATION';
type ShownResult =
  | { type:'IDENTITY'; roleId:string; summary:string }
  | { type:'TARGET_SUBMITTED'; action:'POISON'|'PROTECT'|'MASTER'|'KILL'|'DIVINE'|'INSPECT'; seats:number[] }
  | { type:'CANDIDATES'; roleId:string; seats:[number,number] }
  | { type:'NO_OUTSIDER' }
  | { type:'COUNT'; value:0|1|2|3|4|5|6|7|8|9|10|11|12 }
  | { type:'DIVINATION'; value:'YES'|'NO'; seats:[number,number] }
  | { type:'SHOWN_ROLE'; roleId:string; seat:number }
  | { type:'GRIMOIRE'; historySeq:number }
  | { type:'EVIL_START'; infoId:string }
  | { type:'NEW_ROLE'; roleId:'imp' }
  | { type:'CONTINUATION' };
interface PrivateSceneDescriptor {
  version:1; id:string; kind:SceneKind;
  themeRoleId:string; shown:ShownResult;
}
// 加在内部/契约 PrivateHistoryEntry：
// presentation?: PrivateSceneDescriptor
// 内部另外有 release?: 以下之一，绝不原样输出给客户端
type SceneRelease = {type:'EVENT_RESULT';eventId:string}
  | {type:'NIGHT_NOTIFICATION';changeId:string}
  | {type:'PUBLIC_DAY';day:number} | {type:'FINAL_REVEAL'};
// GameRuntime 新字段：
// presentationSeen: Record<participantId,Record<historySeq,'COMPLETE'|'SKIP'>>
// roleNotifications: Array<{changeId,seat,previousAssignment,
//   roleHistorySeq,notifyOn:'NIGHT',released:boolean}>
```

`COUNT` 上界12保留当前醉毒厨师合法结果域0..playerCount（可能大于真实相邻对数），厨师emitter按当局人数校验，共情者只允许0/1/2；不修改既有说书算法以迁就UI。以后扩人数必须同步此契约。所有roleId通过当前目录枚举，kind/theme/shown组合须与§6的emitter白名单匹配；主题必须是**本人当时认为的角色**，不是实际角色。ID固定为`${gameId}:private:${seat}:${historySeq}`；不能包含其他座位、真实醉毒状态或继任者信息。不同夜同值情报使用不同historySeq，必须各播一次。

`privateMessage` 增加一个typed presentation参数，在历史seq确定后填id；只从该次已选中的shown result构建。IDENTITY、INFORMATION、ROLE_CHANGE通常各一段；提交目标和随后收到情报可以有两段，不能把“已提交”画成“已证实”。`EVIL_START`挂在已存在的首夜阵营信息历史条目上，快照引用同一次`startInfo.infoId`；伪装列表那条历史不再重复产生第二段。普通规则NOTICE不产生演出。

投影分两层：**entry.release**决定整条history/text/presentation是否已授权；**字段门控**沿用targetSeatsRevealDay，仅删除未授权targetSeats，不删除已可见的COUNT/text。共情者夜里立即得到COUNT与完整演出，description不含邻座目标，头像标注等到公开天亮字段释放；补充头像标注不产生第二段信息演出。不得将PUBLIC_DAY门控套到其整条历史。所有新payload同样遵守字段白名单，不能从被删字段再派生头像。

PrivateView 增量：`presentations?: {version:1; pending: Array<{historySeq:number;scene:PrivateSceneDescriptor}>; hasMore:boolean}`。只投影**当前本人已可见、未 ACK**的描述，按 historySeq 取前 32 条；hasMore 仅计算已可见记录，不统计尚未授权的事件。历史中已可见条目保留 `presentation`，供“记录→重播”使用。`GRIMOIRE` 引用同条/既有 history 的当夜快照；投影后只含那晚实际看到的内容，不查实时 assignment。`EVIL_START` 引用已授权 startInfo，不产生新的队友/伪装。

### 4.2 演出已看接口

`POST /api/rooms/:code/presentations/ack`：

```json
{"roomInstanceId":"...","gameId":"...","entries":[{"historySeq":12,"disposition":"COMPLETE"}]}
```

entries 数量 1–16，seq 为正整数且本批不得重复；disposition 仅 COMPLETE/SKIP。沿用目标房间路径 HttpOnly PLAYER cookie、可信登录账号绑定、同源 Origin 校验与成员限流。DISPLAY、房主代其他席、机器人控制接口均无代 ACK 权限。确认当前 roomInstanceId/gameId 及本人有效 participant，再对每个 seq 查本人当前可见的 presentation。任一无效整批拒绝，不部分提交；不存在/不属于本人/未释放统一 `403 PRESENTATION_NOT_AVAILABLE`，不枚举其他人的记录。房间不存在 404；实例或游戏过期 `409 PRESENTATION_CONTEXT_CHANGED`；参数非法 400；认证失效 401/403。

经既有`runtime.execute`克隆staging→更新`presentationSeen[participant.id]`→若至少一条首次新增，显式`room.revision += 1`→repository.commit→swap/publish。不能调用会顺带publishDue/syncImmediate的通用changed()；ACK本身不推进发布任务。runtime依据revision识别写入，必须增加该版本才能真正落盘。响应`{roomInstanceId,gameId,acked:[{historySeq,disposition}],revision}`。首次disposition落盘后保持，重复原值或不同值都返回已保存值，完全重复批次不增revision、不重复写盘，不改变规则、阶段、截止时间、bot控制版本、contextId或actor commandVersion。该路由在app的通用gameplay command拦截之前独立匹配，**不要求expectedCommandVersion/ballotId，客户端不进入玩法命令发送队列**，服务端事务串行化仍保留。ACK只能在可见记录范围增长，不能设置任意future cursor。

客户端完成/主动跳过后先在内存去重，再异步 ACK；失败保留当前 game 的内存 outbox，延迟 1s/3s/10s 重试，恢复联网时再发。401/403/404 或上下文变化清除对应 outbox，不能把旧 ACK 发给下一局。不把私人 payload 写 localStorage、URL、日志或 analytics。刷新前 ACK 未到服务端时可能重播一次；允许，不能为“绝对一次”引入浏览器租约或影响游戏。多设备同席同时播放中的演出可各播；完成 ACK 同步后尚未开始的实例去队，正在播放者自然结束，不突然闪断。

### 4.3 继承与发布门控

继承资格、换角色和胜利判断仍由规则引擎在死亡时立即结算。新增 roleNotifications 只控制本人何时获知，不能延后实际角色生效。

| 观众/情况 | 可见信息、触发和持久化 |
| --- | --- |
| 白天继任者 | 立即在后台成为imp，白天私人role/history继续投影previousAssignment；创建通知项，待beginOtherNight生成下一NIGHT_FALLS后绑定其eventId；tick/publishDue处理该event:end的同一事务先释放NEW_ROLE/身份，再开放夜间行动和继续settleNight；只通知一次 |
| 夜晚继任者 | kill事务确定successor后立即创建并释放NEW_ROLE与本人身份，不等GET；普通小恶魔自杀转移的新恶魔当夜不新增第二次击杀，沿用现有夜序资格判断 |
| 原恶魔白天死亡且确有继任 | 在本人的公开死亡结果点之后放出 CONTINUATION 完整演出；只含本人死亡及力量延续，不带新恶魔座位/名字/头像/角色前身 |
| 原恶魔夜晚死亡且确有继任 | 待公开 DAWN 确认本人死亡后才放出相同 CONTINUATION；夜间提交自杀只返回 KILL 已提交，不提前证实自杀成功或继承发生 |
| 其他爪牙 | 不产生继承通知/演出，不刷新首夜队友列表；不能从 WS 包、notice 或演出计数获知。间谍后续正常拿到的新快照可以按原规则看到变化 |
| 未成功继承 | 不产生 CONTINUATION；只播放已公开的死亡/胜利，醉毒猩红女郎不收到“能力失败”通知 |

注意：官方只通知新恶魔，不通知其他人；**原恶魔的力量延续是用户确认的自定义反馈，包含“发生延续”这一额外信息**，不是官方流程。其信息范围止于此，其他爪牙无同等待遇。[官方能力信息边界](https://wiki.bloodontheclocktower.com/Abilities)、[猩红女郎即时生效、当晚通知](https://wiki.bloodontheclocktower.com/Scarlet_Woman)、[小恶魔转移与当夜行动](https://wiki.bloodontheclocktower.com/Imp)。

roleNotifications中的白天项增加`notifyEventId?:string`；同一changeId释放后只保留released=true，不再次生成history/scene。ABORTED取消未释放通知并清自动待播，不启动夜序；GAME_OVER等revealComplete后直接解密并允许本人从记录重播，不再等下个夜晚。暂停导致event:end未到时通知继续等待；恢复后同一publication事务释放。GET只投影已经释放的数据。

原恶魔的CONTINUATION在kill确定确有继任时生成一条带描述的私人NOTICE。若白天死亡，调用方随后生成SHOT/EXECUTION事件时，将此条release绑定为该event的EVENT_RESULT（沿用当前deferredRoleChanges绑定事件的位置，不能提前可见）；若夜死，release为PUBLIC_DAY(day+1)，并额外验证publicProjection.aliveSeats已不含本人，随DAWN结果释放。未达到门控前整条text/description/未看计数均不可见；不得把继任者changeId或seat放进对原恶魔的payload。终局revealComplete可释放当前局记录供重播，ABORTED不放出尚未公布的延续通知。

所有私人出口使用同一个`visibleAssignment`/`projectPrivateHistory`：role、roleId/type/alignment、summary/tip、能力入口、private targets、presentation、messages、history均按通知门控。白天不得通过menu、回执、能力目标或DOM/data属性偷看继任身份。前端读取role registry资源的key同样只用投影主题；不能先按实际角色预载特有资产向客户端泄密。

### 4.4 旧局迁移及回退

旧 schema 历史不从 text 反推结构，也不补演已结束的整段历史。迁移时已确认身份/已读首夜信息视为过去，仅今后生成的信息有 descriptor；尚未确认的身份、仍在 WAIT_ACK 的首夜阵营可以按**当前合法 privateView**生成一次稳定描述。尚未公开的旧 deferredRoleChanges 转成待通知项；已经公开的身份不撤回，记录为兼容局。现有 v1–3 公开时长不变，新生成的私人信息仍可使用 scene version1。

旧版 server 不能读取 schema5/v4；发布必须 server/web 原子配套，不能把旧 server 指回新数据继续写。失败优先前向修复；若必须回退，只恢复发布前一致快照并明确丢失测试进度，不能自动恢复正在玩的真人局。发布前按现有维护窗口/部署规范处理，不沿用上次针对测试局的一次性忽略授权。

## 5. 私人完整演出：时钟、队列与操作优先级

1. App 接收一次通过协议和 generation 校验的 PrivateView 后，按 `(roomInstanceId,gameId,participantId,scene.id)` 合并 pending，HTTP/WS 同源描述不重复。删掉旧 `setReceipt` 成功回调的独立演出路径；成功请求必须等服务器描述出现。请求失败只显示错误，不能先播成功动画。
2. 当前 scene 使用本地单调演出时钟，冻结开始时的授权 payload。暂停、隐藏、读取、后续 privateView 更新不会改变头像/结果/分支。网络状态不决定艺术时间；服务端规则时钟继续走，动画 ACK 不阻塞游戏。
3. 优先级：身份/首夜**规则确认与本人待操作入口**始终可达；城镇正常观看公开SHOT/EXECUTION/NIGHT_FALLS/DAWN/GAME_OVER时暂停私人scene，结束后继续未播完段落，不能compact、截成短通知或当成完成。正在阅读/输入的NIGHT_FALLS/DAWN沿用reading-latch，只更新轻量昼夜条/颜色与待办，不抢占阅读、不稍后补播过时公共重击；已开始的私人信息演出视作阅读受保护内容，昼夜仅轻提示，不夺走它。SHOT/EXECUTION/GAME_OVER保留现有读取策略与结果卡；若用户主动打开其完整公开演出才暂停私人scene。NOMINATION/VOTE_RESULT始终是轻量卡，不抢占私人演出、不冻结其他合法操作。
4. 阅读手册、角色详情、记录或输入状态时，新私人信息只显示“新情报 n 条/查看”固定小入口；不自动关闭当前阅读。点击查看后进入完整演出，结束回原层和 scrollTop。平时城镇没有阅读/输入时自动播放。全部待播保存，不能因下个白天到了丢掉前一夜信息。
5. 投票/本人行动到来时，顶部稳定待办条提供“处理当前操作”，点击暂停 scene 并返回城镇；演出不占圆桌布局。投票卡的举手、看城镇继续可用，合法枪击仍经服务器校验。完成操作后提供“继续情报”入口，从原时间继续。自动推进不触发新的玩法命令。
6. scene 有固定关闭/跳过按钮；跳过该段写 SKIP，后续继续，不能默认一键丢弃所有未看。完整播放后写 COMPLETE。重播从记录发起，全段播放但不重复规则操作/ACK。身份与首夜“我已知晓”保留原有明确按钮；看完/跳过动画不代替规则确认。
7. 页隐藏立即停止私密声、暂停艺术时间，敏感画面加不含角色的暗色遮罩；回来先同步当前房间再恢复。重连若同一游戏/本人则恢复内存位置；刷新丢失位置时未 ACK scene 从头完整播。离房、被踢、切账号/房间/下一局清队、撤销解码回调、销毁私人位图和声音。
8. 多段积压每段仍完整，用户可逐段跳过；不把重复“值相同”的不同夜情报合并。结算先完成，旧信息在**当前game仍保留、尚未重开**时可从记录重播，不强制看完才能结算。沿用现有reset删除game、lastResult只保留公开结算；重开/下一局清除旧私人队列与重播内容，按钮旁提示“开始下一局后，本局私人演出将清除”。本轮不新增跨局私人档案，旧场景不得自动串入下一局。
9. 测试暂停/单步冻结的是游戏时钟，私人艺术时钟独立；私人 scene 可照常看完或单独暂停。演示页则所有音画都由其本地 playback 时钟控制，单步不自动发声。

## 6. 全角色完整演出矩阵

共用完整段结构：铺垫 0–650ms → 道具/角色动作 650–1900ms → 信息揭晓（见各行）→ 稳定阅读至结尾。信息揭晓后保持清晰文字/头像，不再在标题后飞入大量说明；结尾回城镇仅显示简短新情报入口，原线索仍在头像旁与记录中。普通信息场景 3800ms、复杂 4200ms、身份更替 4600ms；角色外观在本人不知道真实角色时始终用 perceivedRoleId。

每个角色均有 **I：默认3600ms专属身份介绍**（0–600头像拱门，600–1600下表道具动作，1600展示已知身份/能力，末尾稳定阅读）；下表明确4000ms的主题覆盖默认。I只在初次身份待确认或玩家主动重播时播放，不每夜重复。不产生新信息的被动角色没有伪造的夜间通知。真实酒鬼的I使用其以为的镇民主题；实际身份只能在正式解密后使用酒鬼主题。

| 角色 | 新信息/动作触发及完整场景 | 结果点、图像与声音 | 禁止泄露/无触发情况 |
| --- | --- | --- | --- |
| 洗衣妇 washerwoman | I 洗盆/晾布；首夜自动 CANDIDATES 4200ms | 1900 布揭开角色印章和两个候选头像，同组连线；布料、流水、落印 | 只说二人之一，不标真目标/干扰；醉毒采用已展示候选 |
| 图书管理员 librarian | I 书架/索引；首夜 CANDIDATES 或 NO_OUTSIDER 4200 | 1900 书页停在角色与双头像；无外来者时空索引章；纸/抽书 | 不把“无人”画成随机二人；不揭其他外来者 |
| 调查员 investigator | I 证物袋/封印；首夜 CANDIDATES 4200 | 1900 两张头像证物卡揭角色；纸封、金属夹、低脉冲 | 不直接圈出真爪牙，不用真实阵营着色 |
| 厨师 chef | I 菜板；首夜 COUNT 3800 | 650/1000/1350 三次清脆剁菜，1900 显示相邻邪恶对数；画抽象食材不画玩家 | 不标真实邪恶邻座；剁击不能复用提名预备声 |
| 共情者 empath | I 心跳双环；每夜 COUNT 3800 | 1900 两侧抽象心跳汇成 0/1/2；轻心跳/弦音 | 夜间不显示被延迟的邻座头像；天亮后头像线索依现有授权更新，无额外重新获取真值 |
| 占卜师 fortune_teller | I 水晶球；每夜确认两目标 3000ms ACTION，收到 DIVINATION 4200ms INFORMATION | 提交段仅水晶聚光和两头像；结果段 2200 才出现“是/否”；玻璃摩擦、呼吸状共鸣 | 包含首夜、自选、死人；不展示红鲱鱼/哪人是恶魔；同次两段可连续播放但不合成已确认身份 |
| 送葬者 undertaker | I 棺盖/铭牌；非首夜，白天确实有人因处决死亡时 SHOWN_ROLE 4200 | 1900 棺铭揭已展示角色、已公开死者头像；木盖/金属名牌 | 无处决死亡时不制造角色结果；非处决白天死亡不触发 |
| 僧侣 monk | I 钢盾；非首夜确认合法目标 3600 ACTION | 700 展盾、1250 扣合、1900“保护选择已提交”；钢/厚皮革 | 目标不见保护/音效；不确认免死，不公开保护成功原因 |
| 守鸦人 ravenkeeper | I 乌鸦/羽毛；夜死后已有合法选人操作；提交 3000 ACTION、SHOWN_ROLE 4200 INFORMATION | 600 振翅、1900 羽毛落成目标角色；短鸦声/羽毛/纸牌 | 可以选死人；仅能力实际产生的 shown role；不告诉杀手是谁 |
| 处女 virgin | I 白花/封印；首次被提名的公共事件沿用提名，能力导致的处决用 R1；正式揭晓后 I 可重播 | I 花瓣、蜡封；公开处决不带“处女触发”私密旁白 | 不向本人或全桌添加命中镇民/真实身份确认；未触发不解释醉毒等原因 |
| 猎魔人 slayer | I 火枪；任意合法公开枪击用 R3，共同公开 3000ms | 250 枪机、850 枪响/玻璃；公开死亡到达才短叫/血迹 | 所有人包括伪装猎魔者使用同一公共外观；未死不出现士兵盾/保护原因 |
| 士兵 soldier | I 披甲站稳/钢片 3600；正式解密后可重播本人完整主题 | I 1700 护甲闭合；干净金属低击 | 每夜无信息就不播放“挡刀成功”；不告知被袭或中毒 |
| 镇长 mayor | I 权杖/城镇徽章；公开镇长胜利仅用已公布 winReason 的胜利段 | I 杖落地/铜章；胜利使用晨光议会徽章，不能一律画恶魔被杀 | 不通知被攻击/转移了伤害/转移到谁 |
| 管家 butler | I 西装整装；每夜确认主人 ACTION，时长由§9.1动作/语音manifest计算且不少于4000ms | 400开始全身鞠躬，1400进入低姿态、1450起My lord，说完整句再起身；主人头像/“选择已提交” | 只给本人；不向主人发通知；不额外阻止官方手动遵守的投票 |
| 酒鬼 drunk | 未解密 I/行动/信息全部复制 perceived 镇民主题；正式 revealComplete 后专属 4000 | 2000 翻转酒杯与“原来身份”牌；杯与液体轻响 | 解密前无酒杯、醉态、drunk 文件名 DOM、特殊音色/随机分布；不宣告哪晚信息为假 |
| 隐士 recluse | I 孤灯/双面影子；正式解密后可完整重播 3600 | 灯芯、披风、影子合拢；道具动作只讲自身能力 | 不通知哪次被登记为邪恶/角色，不更新他人情报 |
| 圣徒 saint | I 烛台/光环；因处决导致邪恶获胜时仅在胜利理由公布后用圣徒分支 5200 | 900 公布理由，1800 烛火逐灭/邪恶胜利；声轨不提前暴露 | 非因处决死亡不产生圣徒结算；公开角色仍等 revealComplete |
| 投毒者 poisoner | I 药瓶；每夜确认目标 4000 ACTION | 750 瓶碎、1100–2600 腐蚀绿泡/沸腾；1700 一次咳嗽；1900“下毒选择已提交” | 咳嗽仅投毒者本机象征反馈，目标无咳嗽/中毒标签；不读取实际毒状态 |
| 间谍 spy | I 魔典；每夜实际 GRIMOIRE 快照到达 4600 INFORMATION | 800 锁扣、1600 展页、2200 展示该夜快照；桌上角色/标记均来自原快照 | 不实时刷新，不标“真实正确”；醉毒仍用实际获得的那份；白天/死后保留旧快照 |
| 猩红女郎 scarlet_woman | I 猩红披风；实际继承且到通知点 NEW_ROLE 4600 | 900 暗火、1600 翼影生长、2200 本人角色切换 imp；心跳、展翼、低和弦 | 不因未满足五人/醉毒而播放失败提示；原恶魔/其他爪牙按§4.3 |
| 男爵 baron | I 契约/车队 4000；首夜另收通用 EVIL_START（如符合人数） | I 1700 契约出现“设置时额外两名外来者”与两个匿名剪影；马车/卷轴 | 不显示实际外来者头像/角色，不每夜招人；失去能力不撤销既有设置 |
| 小恶魔 imp | I 双翼；非首夜 KILL 4200 ACTION；首夜 EVIL_START；继任者 NEW_ROLE；已死原恶魔 CONTINUATION 4200 | KILL 600/850/1100 扑翼，1450/1750 双斜抓，1900“击杀选择已提交”；CONTINUATION 自己残翼/余烬流向幕外 | 夜间没有证实击杀的骨裂/惨叫；不向目标展示袭击；续力无目标，其他爪牙不获通知 |

通用 EVIL_START 为 4600ms 完整密信演出：1400 揭首夜已知队友头像/分类，2400 仅恶魔展示三个安全伪装；5–6 人不生成队友/伪装，仍展示既有小局规则提示；七人以上规则 ACK 与艺术 ACK 分离。各爪牙初始 I 保留自己的主题，不用通用密信替代。

官方约束：[占卜师每夜与合法目标](https://wiki.bloodontheclocktower.com/Fortune_Teller)、[送葬者只看因处决死亡](https://wiki.bloodontheclocktower.com/Undertaker)、[守鸦人夜死行动](https://wiki.bloodontheclocktower.com/Ravenkeeper)、[男爵只在设置生效](https://wiki.bloodontheclocktower.com/Baron)。本轮不重写说书/醉毒算法；结构化内容必须与现有该条历史显示结果一致。

## 7. 公共演出、断头台与昼夜时间轴

v4 公共时长与结果点（ms，相对 startsAt；交付 lead 250ms）：

| kind | 总时长/结果点 | cue 与发布规则 |
| --- | --- | --- |
| SHOT | 3000 / 850 | 250 枪机，850 枪响/玻璃，结果合法到达后才死亡分支；1650 残渣，不用钟声/通用 impact |
| EXECUTION | 3200 / 1200 | 180 绳轮张力，650 解锁，900 加速落刃，1200 刃撞木台；此点才允许死亡血迹/短叫 |
| NIGHT_FALLS | 6200 / 0 | 350/1900/3450 三次重钟；画面600ms压暗、稳定夜色、末尾让出界面；钟尾最长至相对9000ms |
| DAWN | 6600 / 1800 | 350/2950 两次较慢明亮重钟；1800公布死者/无人死亡；钟尾最长至10500ms，长叫在死亡已公布后 |
| NOMINATION | 800 / 0 | 120 短纸封/木槌单击，非模态；不钟、不枪机声 |
| VOTE_RESULT | 1200 / 0 | 120 落印声，非模态；不复用提名声 |
| GAME_OVER | 5200 / 900 | 保留善恶主演出；winner 到达后分支；end 才 revealComplete，不提前露真实身份 |
| NOTICE | 0 / 0 | 无默认声音 |

公开开始时只发 safeStart，死亡/winner/执行结果仍按既有 publication 在结果点释放。v4 非阻塞事件同 v3：同提交发布实际计票/提名状态，后续 scheduled event 更新只写该事件，不回滚 phase/context/ballot。真实结果包晚到时不补播过去 500ms 以上的枪响/惨叫；直接显示已确认结果的稳定状态，避免错拍。全体按 serverNow/startsAt 同步；本地跳过只隐藏当前演出，不提前确认服务器结果、不推进规则时钟。

### 7.1 断头台三个明确分支

- **目标因处决死亡**：先完整头像及姓名进入刃下，刃高速落下，命中点 60–90ms 局部停帧、木台冲击 8px/90ms、血迹沿目标头像和木台方向迸出，短促受击声；碎屑与残血快速衰减，结束显示公开死亡徽记。上限 20 木屑/24 血滴，不血雾遮挡结果。
- **有处决但未新增死亡**：同一落刃/木台震动，公开 NO_DEATH 后显示“已执行，未新增死亡”，无喷血、死亡惨叫、骷髅或护盾解释。包括处决已经死亡者，不演第二次死亡；沿用服务器 outcome/seats 判定，不能用前端 alive 猜原因。
- **无人被处决**：目标从开始就为空；空台、布条/草屑被风吹过，落刃砰然撞空台、尘屑、空荡回声，字幕“今天无人被处决”。不创建 undefined 占位头像，不血/惨叫，也不伪造死亡回执。平票/未达门槛仅引用已有公开理由，不改投票规则。

`GallowsScene`及素材保留在仓库，但不注册正常游戏/演示目录、不提供任何启用开关。包括升级前已开局的v1–3事件，协议6客户端也用GuillotineScene，艺术cue按该版本resultOffset适配（落刃起点=resultOffset−300ms、撞击=resultOffset，后段在原duration内收尾），不修改其服务器时长/结果点；旧版本解释器只保留时序兼容，不继续启用绞刑架。v4用本节新时间轴。

### 7.2 天亮死亡与胜利

天亮只公布死者，不公布杀手/被保护/士兵挡刀/镇长转移。长叫、头像血色擦痕为统一“夜间死亡”风格，不能只给真正小恶魔击杀的死者不同声轨。多人死亡按座位稳定顺序同时标头像，一条合成长叫，不串播多段尖叫；无人死亡只有晨风/两钟，不显示护盾。夜间私人 KILL 的爪痕只表达选择，不产生真实死亡血/叫。

善良胜利保留残翼恶魔败退与晨光，理由不是恶魔死亡时只用暗翼消散/城镇重获光明，不写“恶魔已死”；邪恶保留火城/巨翼/灰烬。延续阵营音色并重混，不另改获胜规则。圣徒、镇长等原因到已公开 winReason 后才展示对应符号；任何玩家真实角色都等 revealComplete 才进结算魔典。

## 8. 玻璃碎裂、飞渣和真实 UI 折射

输入只用公开 shot eventId、actor/target 的已公开头像和进度；裂纹随机种子固定 hash(event.id)，演示固定 seed，暂停重播不换图案。

1. 目标方向的弹孔中心有 ±24px 确定偏移。生成 9–13 条非等角主裂纹（角间隔随机、最小 12°），每条 2–4 个偏折点、1–3 条分叉；2 条不闭合弧裂与 10–16 个不规则碎片区域。线宽/长度/深度不同，不用整齐放射轮盘。
2. 850ms 同步弹孔白边短闪、裂纹在 50–100ms 内分支扩展，28–36 枚裁切玻璃片按抛物线外飞并旋转、带透明反光。1200ms 后开始落下、2100ms 后消失；只有一次低亮闪，不频闪。玻璃两分支一致，命中后另加公开允许的血。
3. **真实折射主路径**：对当前可见并明确标记`[data-glass-refract]`的内容区应用SVG `feDisplacementMap in="SourceGraphic" in2="shardMap" xChannelSelector="R" yChannelSelector="G" scale="18"`，filter指定`color-interpolation-filters="sRGB"`、`filterUnits/primitiveUnits="userSpaceOnUse"`。feImage贴图与区内内容同尺寸同坐标、preserveAspectRatio=none；外部填中性R/G=128，alpha=255，filter边界四边扩12px，避免默认A通道/linearRGB导致全区漂移。每个玻璃区域编码不同RG位移，scale≤18（偏移约±9px），850–1050ms强、随后120ms归零。输入确为该区实际SourceGraphic，不只画裂纹或移动无关背景。最多2区、单区CSS≤480×640；以Σceil((w+24)×DPR)×ceil((h+24)×DPR)计算物理离屏面积，合计≤2MP，超出则在开始前选降级路径。
4. 白名单为城镇可见头像/中心信息展示、演出目标、手册当前页的可见插图/正文表面；输入框、按钮/投票卡、固定菜单/关闭/确认、页面根元素不加 filter。filter 会建立合成/定位上下文，特效 portal 与浮动操作必须在其外；不对整个 #root 加滤镜。手册/弹层出现枪击时折射其当前可见内容，不闪回城镇。
5. 不截图私人页面、不复制隐藏 DOM、不发送像素到服务器。W3C 明确 filter 处理元素的实际渲染结果；具体 WebKit/微信支持需真机核验，`CSS.supports` 不能代替画面验收。[Filter Effects](https://www.w3.org/TR/filter-effects-1/#feDisplacementMapElement)。
6. 无SVG filter支持、区域超预算在场景开始前选降级；渲染错误立即清除失效filter并留裂纹；连续20帧平均间隔>25ms则标记本局后续效果禁refraction，本次仍完成当前renderer，不中途切图闪动。降级保留不规则裂纹/18枚飞渣与反光，是能力降级而非“已实现真折射”。`prefers-reduced-motion`则静态弹孔/3枚低速碎片，无震动/折射；所有路径不改变命中结果。效果结束清filter/defs/canvas，不残留模糊/点击偏移。

## 9. 管家全身动作与音频资产

### 9.1 管家动作契约

应用 generate-sprite-animation 技能的方法：先确定关节轨迹，再出材质，不用生成模型随意补肢体。保持现有西装人物风格，制作全身 sprite，不能用遮腿和胸部旋转假装鞠躬。

- 源画布 960×1440，脚底基线 y=1415，pivot=(480,1415)，正面微侧身、面向主人卡片；脚跟/脚尖锚点全程位移≤2源像素。头/躯干/上臂/前臂/大腿/小腿长度误差≤2%，不得变比例、镜像换手或断关节。
- 56个源帧、动作采样24fps、统一256×384 cell，8列×7行，2048×2688 WebP sheet；约22MiB解码内存，一次仅解码一个全身sheet。身体从scene400ms开始，无额外缩放/裁边；最低姿态按语音长度保持，不能把整段强制压成2333ms。
- 帧0–7用333ms站定/重心微前移；8–23用667ms髋前屈25°、脊背再屈8°、头颈随动低头，膝轻屈，近手放胸前、远手收后；24–35是500ms微呼吸hold循环（首尾连续，幅度≤1源像素）；36–51用667ms平顺起身、头稍晚抬；52–55用167ms回稳。脚始终在地面，髋/头连续，手臂绕真实关节弯曲，衣摆滞后2帧。
- 先从现有认可的voice源文件标定spoken的trimStart/trimEnd，保留声线和语速，令D=trim后有声时长。manifest写入D、holdMs=`max(500,D+100)`、voiceAt=1450、holdStart=1400、riseAt=`1400+holdMs`、sceneDuration=`max(4000,400+333+667+holdMs+667+167+900)`；同一个manifest同时驱动sprite和音频，台词在低姿态说完后再起身。不得为适配500ms硬加速台词。暂停续播按offset，不能重复叠声。主人头像在视线上方，标签“已选择主人”，无主人接收回执；不重新模仿演员。
- 输出pose JSON（关节/骨长/绘制顺序/基线）、骨架预览、正常底/洋红青色关节审计GIF、源图、runtime sheet、含上述phase时长的frame manifest及重建命令。先验弯腰、停顿、起身和骨长，再贴材质；拒收腿消失、上下身断开、非hold阶段重复占帧、脚滑与只转头。hold允许有意循环，不重复生成多张站定帧充数。实施只检查导出帧/资产，不打开本地游戏页。

### 9.2 素材与音轨清单

新增资源统一置于 `public/art/effects/v2` 与 `public/audio/effects/v2`，v1 不覆盖。art/audio manifest包含 id、相对文件、sha256、尺寸/时长、trim点、cue、decodedBytes、license、sourceURL、attribution、rebuild命令；生成图补 prompt 与原图文件，表演录音补授权。无明确许可素材不进入运行包；优先自录/CC0实录，不能从影视剧剪声音。My lord 使用现有已认可声线，不声称是原剧演员。

| 组 | 必须制作/替换的素材 |
| --- | --- |
| 钟 | night-bell strike/tail、dawn-bell strike/tail；真实大型金属钟基底，低频主体90–160Hz、可闻泛音与长混响；不能仅 sine/triangle 叠谐波 |
| 断头台 | 绳轮张力、解锁、刃风、刃撞木台、血冲击、空台风；与保留的绞刑架声音分开 |
| 枪击/玻璃 | 枪机短click、清脆shot、glass-hit、glass-shards、3个 hurt-shot 120–450ms；NO_DEATH也有枪/玻璃，无hurt |
| 夜死 | 3个 hurt-night 900–1700ms、低强度血/骨裂；只用于已公开死亡，不区分真正死因，不在私人选目标时播 |
| 毒 | 瓶碎、液体沸腾loop≤1200ms、3个轻咳变体300–600ms；只在投毒者提交反馈，非目标 |
| 恶魔 | 3层羽翼flap/空气whoosh/翼根低冲击，双抓tear左/右；不再以爆炸代替扇翼；血骨声只在合法公开死亡 |
| 角色道具 | 布/流水、书/抽页、证物/夹扣、3菜板剁击、心跳、晶球、棺盖、钢盾、鸦翼、蜡封、护甲、权杖、酒杯、孤灯、烛火、披风、车队/契约、魔典锁扣等，按§6 cue绑定 |
| 继承/胜利 | 继任暗火与身份翻转、原恶魔余焰延续；善胜翼碎/晨光、恶胜火焰/翼罩；复用已认可素材可行但分别混音 |
| 纸张/UI | 4个真实纸张turn 300–600ms，2个lift轻响；press/select/open/close/success/error各独立短采样，不用大冲击/指控声 |

采样交付 PCM master（44.1/48kHz）和手机可解码的 MP3运行版（mono props、stereo空间层）；非语言道具目标 -20～-16 LUFS、短瞬态峰值≤-4dBFS，最终总线限幅≤-1dBFS，不把近耳按钮做成枪响。语音避免过低低通导致沉闷，保留1–4kHz清晰度。枪伤/夜死/咳嗽各变体响度接近；变体按公开eventId或本席scene.id确定索引，不能按真实角色/健康状态挑选。

运行预算：除保留v1外，新增v2首批压缩资源≤8MiB；首页必需音频≤200KiB，其余按阶段/本人主题懒加载，首个必须scene最多并行4项；解码音频LRU≤24MiB，纹理≤32MiB，逐出非活跃资源。管家/魔典大纹理与纸张快照不并行保留：从手册进入完整私人scene前释放页纹理、保留DOM和scrollTop，返回时重新准备；进入新大场景先释放旧纹理。不要求预载22角色素材才能开局。加载/解码失败继续完整时间轴和文字，用静态角色/道具渐变替代缺项，不阻塞确认或游戏，日志仅记资源id/错误不记私密payload。该降级不冒充完整素材验收通过。

## 10. 声音调度、尾音和按钮菜单反馈

### 10.1 共用音频总线

沿用现有audio engine的解锁single-flight、异步epoch、source清理与cue ledger，整合book/UI至同一个AudioContext：各source→public/private/ui/book buses→master→destination。音频owner置于App存续期provider，EventStage卸载只释放视觉，不dispose仍有自然尾音lease的engine；离房/切局按下述取消规则回收。许可判定：master on且用户手势解锁；私人additionally ONLINE；纸additionally book偏好开启。关闭master必须关纸音，book开关不能反向开启master；IN_PERSON只禁止私人声音，正常翻页/UI可按master播放，不暗示私人角色。无记录仍沿用master默认off、参与方式默认IN_PERSON；不静默替用户开声音。

夜三钟和晨两钟按§7同组排程，尾音归属eventId；画面自然关闭不stop其已开始尾音，最长限制9s/10.5s。下一公开重击/人声出现时，旧钟尾40ms降到-14dB、300ms平滑恢复；新昼夜事件取消旧组尚未响的击钟并180ms淡出旧尾，禁止两个昼夜钟阵列叠播。最多1组钟、1个主语音、2个材质层、1个UI声音同时发声，超额先停最旧低优先级材质。

总静音/隐藏/离房/显式跳过当前演出：50ms以内fade并停该相关source与future cue，钟尾也停。IN_PERSON切换立即停私人source但保留公开钟/UI。恢复/解锁后不补播过时的公开重击；私人场景暂停时保存local offset，继续时对长stem从offset续播，已过cue不重来，不从头重复My lord。仅播放合法剩余段，无合法offset则静音该cue、保留字幕。不能因react rerender新增AudioContext或重复三钟。

### 10.2 按钮和菜单统一映射

| 交互 | 动效 | 音效与触发 |
| --- | --- | --- |
| 普通可用按钮 | pointerdown scale .97/60ms；up回1/100ms，键盘同反馈 | 真正onClick被接受时一声轻press≤55ms；pointerdown不单独播，防touch/click双响 |
| 选中页签/头像/开关 | 底线/选中圈120–160ms平移，保留布局 | 值确实变化才select≤70ms；开关静音时不强行播确认声 |
| 菜单/弹窗 | 透明度+向上6px/160ms；固定关闭/标题不位移 | open/close各≤100ms；只由用户操作触发，恢复状态不响 |
| 提交成功/失败 | 按钮busy与单行结果；不跳动圆桌 | 服务器成功后success≤130ms；失败error≤150ms；已播公共/私人场景的成功不再叠提示音 |
| 禁用/重复/hover | disabled保持；busy挡重复提交 | 无声，不播放success；错误仅对应一次实际失败 |

公共按钮组件与少量非button手势入口共用 `useInteractionFeedback`；事件处理层选择语义，禁止全局捕获所有click（会误响空白、拖拽与手册内部）。pointercancel/拖拽超阈值取消press；原子命令请求保留原防重与server校验。手册翻页只纸声，不另叠press；长按拖拽起始可一声细tick，不用预备/提名声。`prefers-reduced-motion` 用亮度/描边80ms，无scale/位移，音效仍由开关决定。

## 11. 真实纸张翻页：手势、渲染与返回

### 11.1 单一控制器

GuideOverlay 教程步、角色分类的左右手势与按钮调用同一 `begin/track/release/cancel`。正文/列表仍可纵向内部滚动；标题、分类页签、固定关闭和详情返回不参与卷曲。单指从内容区起；移动小于10px不锁方向；`abs(dx)>1.3*abs(dy)`锁横向并setPointerCapture，否则判纵向不阻止滚动。本轮不覆盖头像轮播/大厅拖拽。详情正文默认只纵滚，不用横滑跳到其他角色；“返回角色表”明确回原分类和scrollTop。

导航图固定如下，不让不同入口残留旧turn动画：pageKey为`tutorial:{step}`、`roles:{category}:grid`、`roles:{category}:detail:{roleId}`或`mine`；另保存每key的scrollTop、详情advice展开状态与打开详情时的originRoleId/originGridScroll。教程上一页/左边界在step0阻尼，最后一页下一页/左滑进入已记忆分类的grid（首次TOWNSFOLK），而非直接进入曾打开的详情。分类按TOWNSFOLK→OUTSIDER→MINION→DEMON，手势首尾阻尼不循环；点击分类直接卷至所点分类，方向取索引差，键盘原有左右循环/Home/End保持，均使用同一controller。

点角色以forward打开详情，详情上一位/下一位仅在当前分类内移动、不循环，使用同一curl/纸声但不增加详情横滑；固定返回、Escape/系统back、详情空白点按均以back返回origin分类和原scrollTop，恢复originRoleId焦点，不能关闭整本。模式页签按mine（如有）/tutorial/roles顺序决定方向，恢复该mode最后pageKey/阅读位置；唯独“教程最后→角色表”按前句进入grid。mine涉及本人信息，只用DOM折页、不制作纹理副本。手册总关闭立即cancel/释放全部状态并关闭整本，使用close微动效而非等待卷页；固定标题/返回/关闭永远在curl层外。

横向锁定时固定direction（左拖next记sign=-1、右拖prev记sign=+1）与目标pageKey，进度`p=clamp(sign*dx/contentWidth,0,1)`；反向拖回起点进度归0，不能abs(dx)越过起点又翻同一页，中途不换prev/next纹理。越界只最大p=.06阻尼，松手回弹无声。释放时p≥.28或`sign*vx≥.45px/ms`且`sign*dx≥24px`完成，否则回弹。完成剩余时长160–280ms（与剩余距离成比例），回弹180ms；按钮从p0动画到1用360ms。pointercancel/第二指/blur/容器resize取消并回原页；不发生半页提交。一次只允许一对页，期间新的按钮请求最多保留最后一个方向，完成后按最新合法页执行，不能丢位置或连播多声。

页内容的逻辑状态只在commit一次，保留 outgoing 的scrollTop，目标分类回到其已存位置；取消不改变任何分类/教程索引。curl中 outgoing/incoming DOM为inert、aria-hidden的视觉副本，唯一个活的语义页在完成后切换；按钮/关闭/投票notice始终在副本外，焦点不跑入背页。页面工具栏点击关闭立即cancel/释放并按既有back-layer还原焦点；不能被卷页图层遮住。

### 11.2 渲染路径与缓存

采用 **Canvas2D条带卷曲 + 手册可见页纹理**。后续实施仅在 web 新增精确依赖 `html2canvas@1.4.1`（MIT、lazy import，锁文件固定版本）；无外部CDN、代理、三方截图接口或3D框架。库根据DOM重绘而非真实浏览器截图，CSS支持有限，因此只捕获手册受控的同源正文/角色网格表面，不声称可截任意UI。[官方原理/同源限制](https://html2canvas.hertzen.com/documentation)、[限制与画布尺寸](https://html2canvas.hertzen.com/faq)、[1.4.1版本](https://github.com/niklasvh/html2canvas/releases/tag/v1.4.1)。

- 捕获仅可见内容viewport，不截整条长列表；受控截图副本去掉blur/filter/backdrop等不支持样式，保留排版/头像/拱门边界，背景用同源纸纹。为current/neighbor渲染独立的纯展示页到offscreen固定宽高容器（非display:none），移除id/事件/可聚焦属性，aria-hidden/inert；无房间状态订阅，不克隆整个App。字体ready、图片decode后捕获，options `allowTaint:false,useCORS:false,scale≤1.5`，每张≤1024×1536且≤1.6MP，最多2张；不发图片代理请求。
- 捕获调度最多1个in-flight，等待槽只保留最新pageKey；200ms预算到而未settle时本次翻页立即固定fallback，**不能以Promise.race当成已取消捕获，再启动第二任务**。旧任务settle前不再启动；每次开关/resize/滚动更新generation，完成时key/generation不符则清canvas并移除offscreen容器、丢结果，再处理最新请求。失败/跨域同样降级；关闭/切号即失效所有generation，已运行任务只能尽快自然settle并清理，不能晚到挂回已关闭手册。
- 缓存仅current+一个neighbor，neighbor方向取最近成功导航/已锁定手势的方向，首次默认next；此方向是导航图下一合法页，不存在则只current。反向首次未命中时固定DOM fallback，不临时请求第三张/等待捕获。缓存key为pageKey、scrollTop、详情advice展开状态、viewport、font/asset版本；关闭详情重建原grid当前可见部分。滚动结束100ms更新current；resize/字体/内容变化失效旧纹理。纹理只存在内存，离开手册/切号销毁；mine/record/私聊/真实魔典/输入框一律不捕获，不写日志/磁盘。
- 正常卷曲把outgoing纹理切24个竖条。令页宽W、弧长a=.16W、半径r=a/π、折线f=W-(W+a)*p；源坐标u<f的区域保持x=u，f≤u≤f+a时θ=π(u-f)/a、x=f+r*sinθ、z=r*(1-cosθ)，u>f+a背页x=2f+a-u、z=2r。背面用暖纸纹/弱反透色，按cosθ压缩/翻转条带，景深投影系数`2W/(2W+z)`，条间重叠1px防缝。p0为完整旧页、p1旧页全移出左边，反方向镜像坐标；incoming先在底层完整绘制。卷边有高光、投影随曲率增强，不旋转整个矩形代替弯曲；只在有效rAF绘制，p跟手不加额外lag。
- 首次纹理未准备/捕获错误/设备慢时立即使用两个受控DOM页的perspective折页+纸背/阴影降级；语义状态、手势、声音完全相同。不等异步texture中途切renderer，避免闪帧。20帧平均>25ms只标记该手册**后续翻页**使用DOM，当前拖动和收尾继续锁定renderer直到commit/cancel，不能冲击中途切换；reduced-motion只做120ms交叉淡入，不卷曲。
- 实现优先保证正文不闪/不错字，captured与DOM页内容严格对应同一page key；commit前预备真实目标DOM，末帧纹理与真实页在同一rAF交换，不能先setState再旧纹理覆盖。无额外document滚动，无临时增加页面高度。

### 11.3 真纸声

用自录/CC0纸张素材，4个厚薄相近、干净近距离版本，去掉手碰桌/麦克风风声。横向锁定时可播一次很轻lift；p跨.35且本次已决定完成后播放turn，若手势尚可回弹则延迟到release确认完成；cancel不播完整turn。按钮在p=.35同点播；快速翻页50ms淡出前一纸声，最多一张主turn音源，不拉伸到失真；变体按本机翻页序号轮换，音量低于游戏动作。手册/book开关、master、隐藏、关闭都能即时停，IN_PERSON不额外禁止公共纸声。声音解码未就绪不迟到补一声，翻页照常完成。

## 12. 微信全部页面适配与移动端约束

全局 `html,body,#root` 和首次HTML内联critical背景统一 `#0b0c09`，保留`color-scheme:dark`、theme-color、manifest与apple状态栏声明。React/JS/CSS未加载、错误边界、404/失效邀请也有深色背景；不能等App渲染后才覆盖白色。`body`固定、overflow hidden，应用高度取既有visualViewport helper；普通内容不能推动document。

| 页面/状态 | 具体处理和保持项 |
| --- | --- |
| 首页/创建/加入/失效邀请 | safe-top/bottom背景延伸，表单仅panel滚动；失效提示后菜单/新建仍可达；资料输入focus不引入白色外层 |
| 大厅/教程/确认身份 | 根面100%可用高度，按钮在safe-bottom内；确认身份整页不滚，说明进入已有内部弹层 |
| 城镇/夜晚/投票/私人演出 | 圆桌始终正圆，提示与待办在覆盖/独立槽，不能flex拉成长方形；夜色只换色不改几何；操作不被安全区/特效挡 |
| 手册/角色详情/记录/私聊/更多菜单 | portal根面及backdrop深色，固定标题/返回/关闭，只有body滚动；列表横纵分流，键盘不把背景拖出白边 |
| 结算/下一把/断线恢复/加载异常 | 沿用同深底；房间切换和协议刷新过程不出现白色loading屏 |
| 动效演示页 | 与真实场景同viewport根和安全区；控制台内部滚动，不使页面整体滚动 |

安全区颜色放在body/root本身，面板padding用`max(12px,env(safe-area-inset-* ))`；只在外壳一次计入，不让嵌套modal再加两倍。头/底操作固定在应用容器而非visualViewport外。键盘展开时暂停大演出/卷页、取消canvas旧尺寸；viewport helper统一更新高度/top，输入只滚至内部panel可见；失焦后恢复原panel位置和圆桌尺寸，document scrollTop仍0。横屏按宽高重算展示尺寸并取消半途手势，不拉伸头像/圆桌。

继续沿用非输入文字不可选择、长按不弹选择/拖图、禁双击缩放；input/textarea/contenteditable保留光标选择/复制，不能全局preventDefault所有touch导致无法输入/纵滚。overscroll规则与自定义触摸处理只作用于确定的滚动边界；可用按钮触摸面积至少44×44px，语义focus与键盘返回不删。viewport内联高度/主题不得含房间身份信息。

微信网页能控制的是网页背景、safe-area、主题色建议，不能通过小程序API改普通H5原生标题栏/底工具栏；真实原生栏有白色时如客户端忽略theme-color，记录机型/微信版本并说明限制，不声称所有版本已改色。[WebKit安全区](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)、[theme-color标准](https://html.spec.whatwg.org/multipage/semantics.html#meta-theme-color)。不接微信JSSDK、不新增签名服务。

## 13. 演示、验证与验收

本节是**未来实施的验证要求**，本方案阶段不运行。禁止在本地打开游戏/预览页，也不运行有头/无头浏览器；不把DOM单测和音频指标当作真机听感验收。

### 13.1 演示入口

保留既有 EffectsPreview 路由和入口，不新增联网测试房。共用scene registry/cue表，不能维护另一套简化动画。补充：断头台三分支、枪击两分支/不同玻璃seed、夜/晨精确钟数、三类人声变体、22个I、所有§6信息/操作场景、继任者/原恶魔、善恶/圣徒/镇长胜利、纸张完成/取消、菜单反馈、reduced/fallback。演示使用虚构头像/昵称和固定shown数据，不装载cookie房间/privateView；网络层拒绝房间写请求。

控制支持开始/重播、暂停、1x/.5x/.25x、每步1/24s、拖进度、单独试听stem、各总线开关、性能降级。暂停/seek/单步先stop声音并设置epoch，不在拖进度时扫播所有cue；从seek点继续只播未来cue，可选一次性“试听本cue”；重播重置scene ledger但不写ACK。时间缩放使用AudioBufferSource playbackRate并限演示，正式游戏不改变人声速度。控制面板声音状态明确，不因预览自动开启master。

### 13.2 风险对应的最短验证

| 风险/用例 | 实施期验证与通过标准 |
| --- | --- |
| P1 私密结果泄露 | 扩展现有 service/start-info/迁移定向用例：醉毒角色shown与原历史一致；真实drunk无特殊主题；spy固定快照；empath目标延迟；7+阵营/5–6无阵营；DISPLAY/其他席不见scene、ACK；检查序列化JSON无隐藏字段 |
| P1 继承通知错时 | 猩红五人/四人、醉毒/死亡、白天/夜晚、自杀转移、无继承、当局结束各例；断言实际角色即时变化，白天继任者到夜才知，原恶魔只在自身死亡已公开后知延续，其他爪牙无消息/scene，首夜team不刷新；普通转移当夜不再击杀 |
| P1 ACK 并发/幂等 | API定向用例：HTTP+WS重复、同批重复seq、混入非法seq整批失败、两个设备ACK、落盘失败回滚、重试/换局/移除/不同账号、旧协议426；首次ACK增revision并落盘、重复不写；不消耗commandVersion、不改变ballot，GET不生成/迁移描述、不写Seen或释放通知（既有presence除外） |
| P1 公共结果早泄/串轮 | 复用/扩展 presentation/effects-v3 测试覆盖v4：结果点前无death/winner；非阻塞旧事件不能回滚新phase/票；v1–3时序保持；空处决无undefined，已死者处决不二次死 |
| P2 私人完整度与可操作 | controller/EventStage DOM+fake clock：自动信息入队、同值不同夜各播、阶段变化不compact、阅读延后、枪击抢占/恢复、投票入口/跳过/规则ACK独立、刷新/切局不串、私密隐藏遮罩、错误不先播成功 |
| P2 音频重复/误响 | 复用 audio fakeContext：三钟/两钟精确cue、自然结束留尾/skip止尾、抢占duck、解码晚到不响、ONLINE/IN_PERSON/master/book优先级、暂停offset不重复My lord、touch+click一响、disabled无声；离页sources归零 |
| P2 翻页错页/返回 | GuideOverlay/controller定向用例：横纵锁、临界p/v、取消/多指/反向/越界、快速连续、texture晚到不换画面、关闭/返回保scrollTop、固定focus/close、book遵循master；canvas纯几何函数校验首末页无缝 |
| P2 资产坏帧/性能 | 脚本检查manifest/许可/sha、尺寸/解码/时长/峰值/预算；管家56帧骨架/基线审计、正常与关节GIF人工查；导出各关键时点静态帧查头像/文字，不打开页面 |
| P2 微信布局 | DOM/样式核对所有route/portal的深色根、safe-area与唯一scroll owner；viewport helper定向用例覆盖键盘开关/旋转，圆桌aspect-ratio始终1、document不滚。构建用于发现新增契约与懒加载依赖错误，不重复运行已有效覆盖的其他全量历史测试 |

实施完成后仅运行涉及文件的必要契约类型/定向Vitest和正式产物构建；不跑本地Playwright/e2e。若定向失败显示影响范围扩大，再说明并扩测试，不为形式重复跑全套。`html2canvas` dependency和新协议要求一次实际构建确认chunk/版本，随后未变不重复。

### 13.3 感官与真机验收标准

用户在部署后的演示页/真机验收，工程侧提供可下载单轨试听和导出动图便于挑选，不在本地开页面替用户看。判据：

- 断头台可清楚看到蓄势、刃加速、撞击、短停与余震；无人分支同样利落，空台/风/字幕明确，不血/undefined；新旧时序版本的正常游戏及演示均不启用绞刑架。
- 夜确实三声、晨确实两声，不靠单个合成“叮”；手机外放可辨钟体和尾音，夜压迫、晨悠长；不被overlay卸载截断，不盖人声。
- 枪击纹路不同角/长短/分叉，碎片离开屏幕平面；正常能力机型可见**当前UI文字/图像实际局部位移折射**；不只是裂纹图。降级机型记录fallback，按钮/投票仍准确。
- 枪伤三个短叫清楚、夜死三个长叫不闷、咳嗽在投毒者，展翼像扑翼而不是爆炸；两种枪击均有玻璃，无死亡不惨叫/血。声音无削波/双响。
- 管家全身连续弯腰、停留、说话、起身，腿脚始终可见且站定，不上身单片旋转。所有22个身份/实际信息场景在演示可点到，自动情报/继承不遗漏，信息正确且不会被阶段切换压缩。
- 手指慢拖时卷边跟手、看得到背纸与下一页；放手完成/回弹顺畅无闪字，纵向滚角色列表不误翻；取消无完整翻页声；读完详情能固定返回原分类原位置。
- 微信iOS与Android各一台、同系统普通浏览器各一轮：§12所有页面/弹层/键盘/横竖屏无网页白边、无document滚动、圆桌正圆、关闭/举手/确认可触达。原生栏是否采纳theme-color另记录，不能用网页验收覆盖客户端限制。

## 14. 分阶段实施、发布与交付

1. **契约与隐私链路**：冻结protocol6/schema5、shown联合类型、ACK和继承投影；后端定向测试通过后再接前端。保持旧版本解释器，不先开放新cue让旧client误读。
2. **共用播放链路与素材**：替换App临时receipt、完成队列/时钟/音频总线；按§7公共场景及§6全角色登记，资产有来源与预算；管家先骨架再材质。演示页共用实现。
3. **纸张与公共交互/微信**：独立page controller，纹理捕获限手册、恢复原滚动/焦点；按钮反馈接现有业务入口；所有根层/portal统一深色，不改圆桌比例。
4. **逐项review及修复**：用R1–R10与§13逐项核对，独立代码review分别检查规则/数据隐私与音画/移动交互；发现范围内P1/P2修复再复审。不得把缺素材的fallback列作正常完整效果。
5. **未来发布**：仅在用户明确实施并授权发布的后续任务中执行；按既有git工作流提交/推送/合并、固定SHA构建，重新读取ops规范，遵守`docs/unified-deployment.md`的备份/切换/维护窗口。健康验证用HTTP/WS/资源请求和无浏览器协议检查，不打开本地页面。完成后记录实际SHA/运行版本/必要验证与真机未验部分，不把方案当成已上线。

文档同步：实施时更新既有阶段记录 `docs/2026-09-27-redesign.md`、API/内容准源中实际改变的协议与通知流程、`docs/unified-deployment.md`发布记录；素材SOURCES/manifest同批维护。本方案阶段只新增本篇，不把既有完成状态改成新功能已完成，不建平行规范。

## 15. 独立 review 与修订记录

2026-11-12，两个独立subagent分别审查规则/后端隐私/协议与音画/纸张/微信可实施性。首轮共12项（3项P1、9项P2），复审补充1项P2，均已修订；随后仅对新增修订作最终复核，两路均确认无范围内P1/P2及未决技术路线。

| reviewer | 发现与修订 | 最终结论 |
| --- | --- | --- |
| role_cinematics_rules_review | COUNT保留0..12既有合法域；ACK显式revision落盘且不触发changed副作用；拆分旧schema迁移避免v3/startInfo降级；继承绑定确切事务/发布点；区分整条与字段门控；重播限当前game存续；GET保留presence例外 | 首轮7项闭环，原恶魔发布绑定与旧版本断头台补充复核通过；可直接实施 |
| role_cinematics_media_review | 管家hold按既有spoken时长计算；捕获单in-flight及晚到清理；折射通道/色域/坐标/物理预算；翻页固定方向与signed进度；明确导航图与双纹理缓存；复审补清当前拖动不切renderer | 首轮5项及复审1项闭环；完全停用绞刑架、旧时序保留复核通过；可直接实施 |

主代理另外核对R1–R10、22角色矩阵、隐私/静音、错误与迁移、验收/未来发布边界均有对应章节。文档同步检查完成：本轮只形成待实施方案，既有阶段/部署记录描述的已上线实现未改变，因此不改其完成状态、不新增另一套阶段文档。reviewer与主代理均未实施、运行测试/构建/浏览器或打开本地游戏/预览页。

## 16. 实施核对（2026-11-12，已发布）

R1–R10均已按本方案落代码，具体改动/有效验证与审查闭环见[阶段记录](../../2026-09-27-redesign.md#2026-11-12-完整角色演出纸张与移动端适配已发布真机待验收)。协议6、schema5、新局公开时序4；旧局时序不重写。新增精确html2canvas@1.4.1及4个传递依赖，其余依赖版本未变。

独立代码review分别核对后端权限/迁移、主播放与音频队列、书页/角色道具/微信/素材，发现的范围内P2均已修复并复审：包括真实WAIT_ACK迁移夹具、返回城镇未暂停、重复音频设置事件、future cue取消、结果血层、被弹层遮挡仍计已看、私密UI声音、纸页固定工具槽/过期速度/current预热/绘制采样及键盘旋转。脚本/媒体输出、无联网演示覆盖与验收边界已同步；不将DOM/媒体检查称为微信真机感官验收。


发布完成：固定72440b914b7ee73ac87bb51a3e3c522882cd316f、镜像49b6ddc65bc7，87项运行资源与健康/协议/WS/日志检查通过；完整回执与限定清理记录见[统一部署记录](../../unified-deployment.md#2026-11-12-完整角色演出纸张与移动端适配已发布真机待验收)。未打开本地游戏或演示页，未声称真机声画/触摸已验收。

## 17. 后续精细素材修订（2026-11-12）

用户进一步确认道具/场景优先、必要全身人物及非断肢血迹后，已完成美术v3与声音修订候选。原R4的IK/FK管家替换为完整生成姿态与光流插帧，旧素材保留；R5基础SVG道具换精细栅格与独立活动层；盾声恢复v1，翼声/左右撕裂分轨。真实私密演出的准备、暂停、记录重播与设置变化已对齐，同步公开结果边界不变。具体素材清单、独立review修复、验证与发布状态以阶段记录最新“精细道具与动作素材修订”段及统一部署记录为准；不把旧版人工感官评价沿用到新素材。
