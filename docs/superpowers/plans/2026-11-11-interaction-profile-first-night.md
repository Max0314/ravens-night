# 鸦钟夜话：排序、房间资料与首夜交互实施方案

日期：2026-11-11。状态：完整方案已独立review通过；2026-11-11用户明确授权实施与部署，六项实现、定向验证和三路独立代码复审已完成，无未关闭P1/P2。2026-11-11 12:38（北京时间）已部署1487d0028ac7648d77a8330076dcec485fe19786，非浏览器发布核对通过，手机真机体验待用户验收。

后续手机验收修订：用户于同日继续授权头像操作与局内信息改进。本文中的拖柄/前后移、局中资料延后应用规则已由[后续交互记录](../../2026-09-27-redesign.md#2026-11-11-头像操作长按排序与局内信息候选未发布)替代；本轮人机默认不主动提名，测试菜单可开启。以下保留上一轮方案与已发布事实。

## 1. 基线、确认范围与交付边界

源码基线：`e25e97421282f8354cf6518fb06f7a010694472f`，业务代码包含 b5ccbbf 的人机账号鉴权修复。已实际读取 Fribench ops GitHub main `964c0ba2357810506ba4d9e883d217f377ea0615` 的 AGENTS、workflow、contracts，读取时间为 2026-11-11 03:09 UTC。实施前重新核对源码和公共规范差异。

本方案替代 `2026-11-10-full-flow-bots.md` 中“三种房间模式”“仅线上/混合提交语音链接”及“身份确认后直接初始化首夜”的对应设计；其他已实现规则继续有效。

| 用户确认 | 本次结果 |
| --- | --- |
| 所有拖拽排序采用示例交互 | 大厅及现存 SeatOrderEditor 复用一套排序控制器；浮层跟手、占位、相邻项独立弹性让位，支持触摸和键盘 |
| 大厅是更暗，非更亮 | 创建、加入、大厅使用与首页同风格、不同构图的更暗黑金场景；文字和操作面板保持可读 |
| 创建也能选择昵称头像 | 首页、创建、加入共用资料编辑器；创建成功后本人使用提交时选定的资料入座 |
| 新游客随机、账号沿用已有资料 | 仅没有有效游客资料的新游客随机一次；登录账号不随机、不覆盖中央账号资料 |
| 统一创建房间 | 取消线下/线上/混合选项；保留可选外部语音链接、邀请和公共大屏入口 |
| 动画太快 | 延长公开演出，明确区分演出、人机思考、辩护/投票、暂停人机和冻结计时 |
| 7 人以上首夜信息独立确认 | 夜幕演出后、任何首夜能力前，邪恶玩家私密查看并点击“已知晓”；5–6 人不新增阵营信息 |

不新增内置语音、AI 对话、其他剧本、玩具匠或角色，不改变计票规则、房主权限、人机仅补位的边界。已认可首页拱门轮播、教程正文、角色表和翻书交互不重做；首页轮播是轮播，不套用座位排序。

本地不打开任何游戏页面，包括预览、浏览器自动化和无头浏览器。方案阶段只阅读源码、规则资料并编写文档，不运行游戏、测试、构建或迁移。后续实施的非浏览器验证与部署后用户真机验收见第 11 节，二者分别记录。

## 2. 现状与问题依据

1. 大厅现在通过命中卡片重排 DOM，加 FLIP 位移动画；拖动项没有真正脱离布局成为跟手浮层。`Display.tsx` 的导出组件 SeatOrderEditor 仍用原生 HTML drag/drop，触摸行为不一致。公共大屏本身保持只读，统一组件不赋予大屏写权限。
2. Create/Join 只预填账号昵称，游客没有独立持久资料，加入接口没有头像字段；头像合法集合已由 `/api/account/avatars` 提供，包含 35 个当前 v3 头像，服务端保留 v1/v2 历史头像白名单。
3. 创建表单和服务端把语音链接绑定到 playMode；创建恢复凭据包含原始参数指纹。仅删前端选项会继续丢失链接，也可能破坏待恢复创建的幂等性。
4. 当前 NIGHT_FALLS 为 2 秒，SHOT/EXECUTION 为 4.5 秒，DAWN/GAME_OVER 为 5 秒，另有 1.5 秒统一同步提前量。NORMAL 人机准备 300ms、身份确认 700ms、夜间行动 1200ms。人机会减少阶段等待，但不会压缩既定演出时长；改变人机延迟不能替代修改演出时序。
5. 当前开局已生成恶魔/爪牙私密信息及恶魔三个伪装；身份全部确认后立即初始化首夜能力，没有“已知晓”屏障。现有生成时机还会使玩家在确认身份前通过记录看到这些信息。

规则依据：标准首夜恶魔与爪牙获得各自允许的起始信息；5–6 人默认 Teensyville，邪恶玩家互不认识，恶魔没有三个未在场善良角色作为伪装。本方案沿用当前暗流涌动范围，不加入玩具匠例外。参见[官方 Teensyville 说明](https://bloodontheclocktower.com/blogs/news/behind-the-curtain-6-the-teensyville-fair)及[官方 Wiki 术语表中的 Demon info / Minion info](https://wiki.bloodontheclocktower.com/Glossary)。独立“已知晓”是本产品为保证阅读而增加的确认交互，并非声称实体规则要求点击按钮。

## 3. 模块职责与改动落点

| 模块 | 职责与范围 |
| --- | --- |
| `packages/contracts` | 发布协议 4；新增私密起始信息 DTO、确认命令、游客资料命令和新创建请求定义；共享不可变演出版本表 |
| web `use-seat-sort` / `SeatOrderGrid`（新增） | 统一排序几何、浮层、占位、弹性位移、取消与键盘行为；不处理房主鉴权或自行写服务端 |
| web `guest-profile` / `PlayerProfileEditor`（新增） | 游客本地资料、随机初始资料、账号/游客分流；复用已有头像网格、固定标题与保存区 |
| Home / AccountPanel / Create / Join / Lobby | 接入共享资料、统一创建、暗背景和排序；App/api 保存不可变创建/加入意图并处理恢复 |
| `rooms/service.ts` / 新增 `first-night-info.ts` | 游客座位资料更新、首夜屏障生成/释放/确认/继续、房间状态校验；不把内部身份判断下放前端 |
| `rooms/bot-*` / 调度器 | 增加合法私密信息确认任务，延长阅读/行动延迟，继续复用暂停/单步/逻辑时钟 |
| `rooms/presentation.ts` / EventStage / experience-audio / CSS | 使用统一版本时序，持久化发布点与客户端动画、音效对齐 |
| restore / repository / integration fixtures | 快照 4、3→4 迁移与严格校验，保留原收据、资料、机器人任务及手动时钟 |

复用 LiveRoomRuntime 的 staged mutation→持久化→提交→广播路径；不新增服务、数据库表、拖拽库或动效库。不修改 Fribench 公共资料接口、域名、公共部署架构及依赖版本。

## 4. 排序交互和提交契约

### 4.1 组件输入、输出与几何

共享控制器输入为 `items: {id}[]`、`disabled`、`setupId`、`layoutEpoch`、滚动容器和 `onCommit(ids)`；后者返回关联本次 commandId 的 Promise/提交句柄，区分 pending/success/failure 及权威快照。输出排序预览、拖动项浮层坐标、占位索引、每项 transform、可访问提示及事件处理器。业务以 participantId 为稳定 key，不以座号/index 为 key。

只有 LOBBY 的当前真人房主启用拖柄。卡片正文点击仍打开详情；拖柄可触摸区至少 44×44px，拖柄 `touch-action:none`，卡片其余区域保留内部纵向滚动。指针主键按下记录抓取偏移、原数组和 setupId；移动距离达到 8px 后才开始排序，不要求长按。未达到阈值松手不重排。鼠标右键、第二根手指、非主指针不开始或接管排序。

激活时测量容器内网格逻辑槽位，固定卡片宽高。稳定网格节点持有 pointer capture，不在开始拖动时更换其父节点。源卡片 wrapper 始终挂载并作为同尺寸占位；其中原卡片视觉内容绝对定位退出普通布局并隐藏，原拖柄保留挂载、可聚焦且不设置aria-hidden（仅视觉裁切）。portal 只渲染卡片视觉副本，`position:fixed; pointer-events:none; aria-hidden=true`，不复制可聚焦按钮。浮层左上角等于当前指针减去最初抓取偏移，不跟随动画滞后。真实焦点始终留在稳定原拖柄；不能用跨父节点移动源DOM的方式创建浮层。

每个 requestAnimationFrame 用最新指针计算插入点，不依赖 pointerenter 或 elementFromPoint。槽位按行从左到右、从上到下排列：指针先归入距离最近的行（相邻行中心中线为界），再按该行各槽位中心的中线归入最近列；最后一行超出列数时取该行末槽。只使用**不含动画 transform 的逻辑槽位坐标**。指针锚点取浮层中心，跨槽中线另留 6px 滞回区，避免静止时左右反复换位。

插入索引决定唯一预览数组和唯一占位。兄弟项各自追随目标槽位，使用同一 rAF 中的阻尼弹簧积分：mass=1、stiffness=420、damping=36；每帧 dt 上限 32ms，距离小于 0.5px 且速度小于 5px/s 后精确落位停止。目标改变时从当前呈现位置/速度继续，不先清 transform、不取消再重启动画。指针停住后目标索引不变、空位不漂移，各项完成当前过渡后稳定。

### 4.2 滚动、落位与中断

只滚动中部名单容器；指针距其上下边缘 40px 内，按接近边缘比例以 0–360px/s 自动滚动。每帧把容器 scrollTop 差计入槽位坐标；浮层仍以 viewport 坐标跟手。不要滚动 body。12 席可在短屏内部滚动，顶部与开始按钮保持可见。

松手后停止自动滚动，浮层从当前位置用上述弹簧吸附到目标占位。预览立即进入提交锁定，吸附最长 240ms，随后移除浮层并让原卡片接替，接替前后坐标相同；减少动态效果时直接接替。与原顺序相同则不调用接口。顺序变化只提交一次现有 reorder 命令，全量 participantIds 仅含未离房 PLAYER，按预览顺序，无遗漏/重复/大屏。

提交使用冻结的 roomInstanceId/setupId 和原操作 commandId，expectedCommandVersion 由现有队列在派发时补齐；响应丢失用相同原请求重试，不能生成第二次排序。成功以服务端座序更新缓存，不先闪回旧序；提交期间禁止第二次拖拽、前移/后移。400 显示原因并还原，409 刷新权威快照后还原/提示“座位已变化，请重新调整”，503 保留意图和重试入口，403 退出管理状态。

pointercancel、意外lostpointercapture、Escape、blur、visibility hidden、容器 resize/布局列数变化、玩家增删、setupId/房主/房间/账号改变时取消尚未提交的拖动，回到最新服务端顺序，不提交。先标记drop已派发再主动releasePointerCapture，不能让该正常lostpointercapture清掉已提交预览。中断必须释放 capture、rAF、浮层和监听，抑制拖动后 300ms 内的卡片 click。

提交后按现有revision规则接纳快照：旧revision不覆盖预览；新setup且同roomInstance/参与者集合、权威排列等于submittedIds，视为该预览已由服务端确认（即使WS先于HTTP到达），保留同一浮层完成吸附与原位接替，不重挂载/闪回。新排列不同、成员集合/权限变化才撤销预览并采用权威结果。本次HTTP若在权威排列已等于submittedIds后返回过期冲突，也不能把画面回滚。角色准备快照变化但setup/座序未变时不打断拖动。

### 4.3 键盘、权限与准备状态

拖柄 Space/Enter 抓取，方向键按网格相邻位置移动（左右 ±1，上下 ±列数，越界不变），Space/Enter 落位提交，Escape 取消；Tab 在抓取时取消并按正常顺序离开。aria-live 提示“已抓取××，第 N 位 / 移到第 N 位 / 已取消”，不朗读身份。详情中的前移/后移调用相同提交函数。

服务端继续要求当前真人房主、LOBBY、正确上下文及完整 PLAYER 排列；不扩大 DISPLAY 权限。只有实际顺序发生变化才 invalidateSetup，原子清空准备并使旧人机任务作废；无变化/重试不再次清空。SeatOrderEditor/Display 的旧原生拖拽代码移除，组件只接收上层授权后的回调，公共大屏不挂载编辑入口。

## 5. 更暗黑金背景与移动布局

未来实施生成一张无人物、无文字、无头像框的背景：深夜钟楼内庭与远处石阶，黑色石材、少量暗金灯光、薄雾；建筑分布在两侧，上中部留安静暗区；保持首页美术风格，但不复制首页画面或重新放人物。输出一张 1440×2560 竖图，导出 `public/art/rooms/courtyard-night.webp`（≤450KB），必要时另导出同源桌面裁切 `courtyard-night-wide.webp`（≤550KB），不能拉伸图像。资源生成与试用留待实施授权后进行。

Create、Join、Lobby 的 RoomPageShell 使用该背景，`background-size:cover`，中心为 50% 40%。叠加黑色遮罩 `rgba(3,4,6,.74)` 与底部黑渐变；面板 `rgba(13,12,10,.90)`，主文字 `#f1e8d4`、次文字 `#b9ad95`、暗金 `#bf9a58`。原装饰暖亮区域不穿透输入框/头像名字区域；不添加循环粒子或大面积光晕。失败/低速时退回相同暗渐变，布局不等待图片加载。

背景固定在页面壳内，不创建额外滚动层，不用移动端有问题的 background-attachment:fixed；正文、边界、选中和禁用状态与装饰分别设置。主/次文字对面板对比度分别至少 4.5:1；拖柄和控件边界至少 3:1。背景更暗不通过降低文字整体 opacity 实现。

保留固定顶栏、内部可滚内容、固定底部操作区和 visualViewport/safe-area；最小 320px 宽。资料编辑行放在人数之前：左侧头像，右侧昵称与编辑入口；头像选择弹窗固定标题/关闭与保存，中部四列网格内部滚动，不让保存按钮随列表滚走。微信/iOS 无悬停前提，触摸区至少 44px，主要按钮 48px；键盘只缩小内部内容区，不遮住提交和关闭。

## 6. 游客资料、随机初始化和账号边界

### 6.1 数据与默认值

新增游客浏览器记录 `ravens_guest_profile_v1`：`{version:1, nickname:string, avatar:string, updatedAt:number}`；avatar保存精确可信URL，包含v1/v2/v3版本及id，不能只存会跨版本复用的id。昵称 trim 后 1–24 字符且无控制字符。将已有不含权限逻辑的头像目录移至contracts供web/server共用：包含全部历史允许URL及当前可选择/随机的v3子集；trustedAvatar继续服务端执行精确匹配。存储整条 JSON，一次替换，禁止分开写姓名/头像。它不是身份凭据，不包含 token、sub、房间码或恢复码；不发送至 Fribench 账号服务。

静态 `guest-names.ts` 提供去重、无控制字符、长度合规的名单，首批至少 80 个，覆盖国内外作家、演员/导演、影视动画/游戏人物及 AI 名称；包括用户举例的史泰龙、奥特曼、皮卡丘、犬夜叉。名单随版本打包，不调用模型/外部随机昵称接口，不附加人物简介或暗示真人账号。随机值可能与同房玩家重名：保留当前新入座不重名规则，`rooms.join`在任何换人机/入座变化前返回409 NICKNAME_TAKEN，票据未消费；表单保留原房和资料，提示修改昵称或“换一组”，显式保存后再建未消费加入意图。不能在后台重抽已保存昵称或因重名新建另一个房间；席位授权始终用participantId/凭据，不用昵称。

资料加载顺序：先确认当前账号状态；SIGNED_IN 使用现有本游戏资料覆盖或账号默认，完全不读取游客作为默认；明确 GUEST 后读取游客记录。有效则原样采用；不存在/非法则从名单与当前v3目录各均匀随机一个，仅在初始化时生成并保存。用 crypto.getRandomValues 的拒绝采样选下标，随机失败退回 Math.random（这里只生成外观偏好）。目录失败时读取打包的同版本v3清单；前端清单由同一目录源导出，不另维护 URL 白名单。

历史已持久游客昵称如果存在于当前旧会话，首次迁移优先沿用该昵称，头像从当前该游客座位的合法头像取得，否则随机；此时不覆盖用户已取的名字。恢复旧座位不因本地随机资料改变旧座位资料。不在完整历史白名单内的avatar仅修复头像，非法昵称仅修复昵称，保留其余合法字段；v1/v2 已有合法头像仍可使用，不强制换成 v3。存储被禁用时保持本标签页内存值，本次导航和刷新前不反复生成，并显示一次“当前浏览器未保存资料，下次打开可能重新生成”。

同一标签页初始化 single-flight；多标签页通过 storage 事件重新读取整条记录，最终以 localStorage 当前记录为准，不拼接不同版本字段。未编辑表单直接同步；有未保存草稿时保留草稿并提示“其他页面已修改资料”，允许放弃草稿读取或明确保存覆盖。两个首次打开的标签页可能短暂各自生成，后一次完整写入成为共享值；这不产生账号或座位变化。账号状态未确定/接口故障时不随机化，显示资料加载失败和重试；getAccount 的旧响应用 account generation 丢弃。

### 6.2 编辑与入座

首页游客入口展示头像；点击居中资料弹窗，含昵称、头像、“换一组”、保存和 Fribench 登录。创建/加入使用同一个编辑组件，不复制头像网格。随机换一组仅改草稿，保存或提交房间表单时才持久化；取消恢复进入弹窗时值。未保存资料点击创建/加入时先校验并写本地完整记录，再冻结此次入座资料；按钮给出保存失败提示但允许以内存资料继续。

登录账号沿用现有 profile/default 和 expectedRevision；修改只调用已有 `/api/account/profile`，不修改 auth 中央昵称/头像。未编辑时不发送资料保存。编辑后创建/加入先保存本游戏资料，保存成功才进入创建/加入提交；409 PROFILE_STALE 保留草稿、读取新资料，用户选择使用新值或再次保存，不能静默覆盖；401 返回账号状态处理。资料已保存但创建失败时保留资料，提示创建失败，不回滚已保存资料。账号切换不复制游客到账号，不清除原游客本地记录。

游客新 PLAYER 入座请求增加可选 `avatar:string`，直接提交选中的目录精确URL，不做URL重写；服务端仅接受 trustedAvatar，无任意远程图片。新入座时同时写 participant.nickname/avatarSnapshot。账号新入座只取账号本游戏profile/default，忽略客户端avatar，不能借入座改写资料。省略 avatar 的旧请求维持原无头像行为；DISPLAY 忽略昵称头像，固定公共大屏，不创建游客资料。已存在 Cookie、同账号席位、已消费 joinTicket、恢复码四条恢复路径始终优先，不用请求昵称头像修改已有席位；头像/昵称修改须显式资料命令。

为保证账号资料在创建→入座之间不被另一页面悄悄替换，新账号PLAYER请求另带 `expectedProfileRevision`（非负整数），nickname及avatar携带刚读取/保存成功的完整显示值（avatar允许null，仅账号适用）。在所有原席位/已消费票据恢复分支之后，任何新入座、替换人机或消费票据之前，于同一staged mutation比较当前profileView.revision、nickname、avatar与冻结值；任一不符409 PROFILE_STALE，并返回`joinTicketConsumed:false`及仅该账号当前profile。`ApiError`对该错误增加仅含此已校验标志/profile的typed details，不丢弃原有errorCode；也可在缺details时重新GET account取得最新值，但不得假定网络错误代表票据未消费。客户端保留原roomCode/pendingJoin，显示当前资料，用户明确“使用更新后的资料继续”后用新值和revision重建**未消费**加入意图再请求，或先按既有expectedRevision编辑保存再继续。不得自动改值重试、重新创建房间。缺expectedProfileRevision的旧意图保留旧“读取最新服务端资料”语义，不把恢复旧版本写成已冻结；游客带该字段或账号字段类型不符返回400。

游客已在房间时，在首页资料弹窗或大厅本人详情点击“保存”会先更新本地偏好，再对当前 StoredSession 指向的唯一游客 PLAYER 发资料命令；不扫描或自动更新其他房间。LOBBY 立即更新本人昵称、头像和房主 organizerName，准备状态不清空；TUTORIAL/RUNNING 写 pendingProfile，返回 LOBBY 时应用，游戏中当前显示和结算快照保持本局资料。GAME_OVER/ABORTED 也只写 pendingProfile，避免改写结算。下一把使用该待应用资料；仅存在本地偏好但未发送资料命令时，已有座位下一把仍保留原资料。

游客资料命令为 `POST /api/rooms/:code/profile`，JSON 为 `C + {nickname,avatar}`（avatar 必填目录 URL），正常房间命令收据/队列，ROOM scope。只允许当前未离房 HUMAN PLAYER 且没有 accountId；本人 token + 当前可信账号上下文验证，不能带 participantId/sub 修改其他人。账号席位调用返回403 PROFILE_OWNER_CHANGED，前端重载账号状态；DISPLAY/BOT 403。成功返回当前 PrivateView 和 `profileApplication:'CURRENT'|'NEXT_LOBBY'`，供界面显示“已保存”或“下次回大厅生效”。收据只存profileApplication小结果，HTTP返回时重新生成最新PrivateView，不把整份私密视图写收据。相同值不重复 changed；503 保留本地新偏好和同命令重试，提示“资料已保存在本机，房间更新待重试”；403/404 结束房间同步但不删除本地偏好。修改游客资料不赋予登录、认领或恢复席位能力。

### 6.3 意图冻结与错误恢复

创建意图扩为本地 version=2，包含原 request、avatar、账号资料revision（账号时）、账号 namespace、commandId/createTicket、阶段；加入意图包含 nickname/avatar/expectedProfileRevision（账号时）/mode/roomInstanceId/joinTicket。首次派发前写入 sessionStorage，后续超时/刷新重用同一个不可变对象。游客资料后来被其他页修改不能改写未完成请求。提交中锁定表单；结果不确定时只提供“重试当前操作”，不能用改参数的新 commandId 猜测重建。服务端明确PROFILE_STALE或NICKNAME_TAKEN且票据未消费时，分别走第6.2/6.1节的显式资料确认/改名分支，不把已知拒绝当网络结果不确定。

创建响应成功，先把 roomCode 与本次冻结资料写 pendingJoin，再清除创建意图；加入成功先保存席位会话再清除 pendingJoin。任一步存储失败，当前页保留内存凭据并提示不要关页，不宣称可刷新恢复。创建成功加入失败从原 roomCode 继续，不能新建；joinTicket 已消费重试返回原席位，不再替换第二个人机、不修改已入座资料。SETUP_CHANGED 且明确未消费才按已有规则换新票重试一次。

恢复旧 version=1 创建/加入意图时不补随机值、不改旧请求指纹；原来没有 avatar 的入座完成后可显式编辑。登录、退出、切房使旧网络响应 generation 失效，旧意图按原 namespace 保留但不能在新账号下派发；切回原身份后再恢复。用户明确放弃并确认结果已知后才允许新建另一份意图。

## 7. 统一创建与可选外部语音

新表单只保留本人资料、5–12 人数和折叠的“语音链接（可选）”；不显示模式名或对比文案。默认 8 人；所有场景共用邀请、准备、教学、夜晚和计票。大厅更多里有“公共大屏”和语音入口；不内置通话，也不自动加入/播放外部语音。群聊语音没有可用 URL 时可留空，不阻止开局。

新创建请求为 `POST /api/rooms`，`{creationVersion:2, playerCount, organizerName, voiceRoomUrl?, createTicket}` 与 X-Command-Id；不发送 playMode，服务端内部新房仍存 `playMode:'IN_PERSON'` 兼容字段。语音不再按 mode 丢弃。URL trim 后空串视为缺省；非空最多 2048 字符，必须经 URL 解析为 http:/https:、没有 username/password；拒绝 javascript:/data: 和相对 URL。仅保存/由用户打开，服务端不抓取。链接显示域名并用独立打开入口、noopener/noreferrer；在微信无法外跳时提供显式复制按钮，不假定弹窗已打开成功。

新 fingerprint 固定为 JSON 数组 `[2,playerCount,trimName,normalizedVoiceOrNull]` 的 SHA256；avatar 冻结在客户端本次后续入座意图中，不是创建房间事实。账号昵称以资料保存成功后的值冻结；服务端不信客户端账号标识。

兼容：缺少 creationVersion 视为 v1，保留原 fingerprint `[count,name,mode,legacyVoiceOrNull]` 以及 IN_PERSON 忽略 voice 的旧语义；旧收据无需改算。v1 待恢复创建按原报文重放；v2 禁止带 playMode，400 INVALID_REQUEST。已创建 REMOTE/HYBRID 的房间保留原字段/链接和业务数据，UI 统一显示房间，不自动重建或变模式。现有 VoiceRoom/InviteTools 不再用 mode 判断链接是否可见，只看 voiceRoomUrl。不要在 RoomPlayMode 枚举里新增第四种值。

## 8. 演出与人机节奏

### 8.1 不可变时序版本

共享 `experience-timing.ts` 提供版本 1（当前）和版本 2（新）定义，GameRuntime 新增 `presentationVersion:1|2`，新一局固定为 2，旧局迁移为 1 直至下一把。每个 ExperienceEvent 新增 `timingVersion`；旧事件缺字段按 1。定义一旦发布不可改写，后续调整新增版本。服务器保存 startsAt/durationMs 及 pendingPublications 的绝对时间，客户端不自行补时；所有时间使用现有 gameNow。

| 事件 | v1 时长 | v2 时长 | v2 结果公开偏移（相对 startsAt） |
| --- | ---: | ---: | ---: |
| NOTICE | 0ms | 0ms | 0ms |
| NIGHT_FALLS | 2000ms | 5000ms | 0ms，仅切夜晚，不提前释放能力 |
| NOMINATION | 1000ms | 1800ms | 0ms，展示公开提名 |
| VOTE_RESULT | 2500ms | 3500ms | 0ms，展示已完成计票结果 |
| SHOT | 4500ms | 6000ms | 3600ms，死亡/射击结果 |
| EXECUTION | 4500ms | 6000ms | 3600ms，死亡/处决结果 |
| DAWN | 5000ms | 6500ms | 2800ms，公开死亡与白天状态 |
| GAME_OVER | 5000ms | 7000ms | 2800ms 公布胜方，7000ms 公开完整身份结算 |

1.5 秒事件同步提前量不变，startsAt=max(gameNow+1500, presentationUntil)。事件开始前只显示“即将开始”，不快速跳整数倒数；开始后以平滑进度呈现，不再每秒切巨大数字。进入演出不重新挂载底下的游戏页面。

结果与能力发布仍以服务端发布屏障为准。SHOT/EXECUTION 的动画作用点与 resultOffset=3600ms 对齐；DAWN/胜方标题在2800ms出现。CSS 从定义注入 duration/result-ratio，重写旧固定4500ms与60%/62%等触发点，使动作、闪光、死亡牌翻面共用对应比例；外层淡入220ms、淡出240ms，不叠加额外阻塞时间。v1 节点继续原比例/原音效。`safeStart`、公私事件DTO、publicProjection和pendingPublications.eventPatch均保留timingVersion，不能在中性开始事件丢字段、到结果点才从v1跳成v2。测试中既有presentation=false的零时长事件，其结果偏移强制0、无演出/音效，但首夜信息确认业务屏障仍有效。

v2 音效点：NIGHT_FALLS 钟声500ms；NOMINATION/VOTE_RESULT/GAME_OVER 纸页350ms；SHOT 上膛1800ms、枪响3600ms、钟声5400ms；EXECUTION 钟声500ms、机关3600ms、钟声4800ms；DAWN 钟声600/2200ms。已有用户音效开关与浏览器手势解锁保持；私密信息/首夜确认不发声。不播放已过去的 cue，隐藏、切事件、静音、冻结时取消未播放 cue，恢复按当前时间只调度未来 cue。

EventStage 不再以每次 now 更新/是否冻结改变 key；稳定 event.id，仅事件切换换节点。用 elapsed 设统一负 delay/currentTime，冻结/解冻切 animation-play-state；切 timeline.epoch 调整动画锚点，不销毁后闪一下。prefers-reduced-motion 用静态主题画面和结果淡入，但同样等待服务器发布；不能通过关闭动画提前行动。断线恢复中途事件定位当前进度，已结束事件不重播。

### 8.2 等待、计时与人机

辩护仍为完整20秒，逐席仍1.5秒，不因人机数量、演出、慢速开关改变。提名后的 voteStartsAt 必须为 max(gameNow,presentationUntil)+20000；每席锁票/鬼票消耗仍按原 ballotId 和绝对时间。计时展示 ceil(max(0,deadline-gameNow)/1000)，不会显示负数或把墙上时间用于 MANUAL 房间。

新局 NORMAL 人机 READY=500ms、TUTORIAL_COMPLETE/CONFIRM_ROLE=1500ms、ACK_START_INFO=1800ms、NIGHT_ACTION/SLAYER=2500ms、WHISPER=1200ms；SLOW 上述值×3。投票保持 NORMAL500ms/SLOW1500ms，受本席截止限制；白天提名最早10秒、结束白天最早18秒的已有门槛不变。动作延迟从“该任务首次合法可执行”开始，不能在演出中先耗完思考时间。所有截止限制、稳定seed、一次待办、控制generation校验保持。

旧局默认沿用原 delay 表直到下一把，由 presentationVersion 选择旧/新策略；升级不重排已有任务 dueGameAt。新 ACK_START_INFO 只存在新局。单步仍仅执行一个合法人机命令，遇到新确认会先确认，不连续处理首夜能力。暂停人机只停人机，真实计时/演出不停；单真人冻结同时暂停自动人机，演出进度也停。UI 沿用清楚的两种状态提示，不加第三套“快进”开关。

## 9. 首夜私密信息屏障

### 9.1 内部状态与私密契约

GameRuntime 新增 `startInfo`：`{mode:'REQUIRED'|'NONE'|'LEGACY', stage:'WAIT_NIGHTFALL'|'WAIT_ACK'|'COMPLETE'|'CANCELLED', entries:Record<seat,{infoId:string,team:{seat,nickname,avatar?,kind:'DEMON'|'MINION'}[], bluffRoleIds:string[], acknowledged:boolean}>, releasedAt?:number}`。REQUIRED 另存不可变起始校验基准 `{demonSeat:number,minionSeats:number[],excludedBluffRoleIds:string[]}`，来源为 createGame 时的真实/感知分配，不随恶魔继任等局内角色变化改写。该结构仅在加密房间快照，绝不整体序列化至 publicView/公共WS/public capabilities/日志或错误；私密通道也只投影本人允许的DTO。

新7–12人局 REQUIRED：按真实 roleType=DEMON/MINION 生成每个对应席位一条 entry，infoId 为 UUID，自己不在 team 内。恶魔只获爪牙名单和3个未在场善良角色；爪牙获恶魔/其他爪牙名单，无伪装。队友名单标恶魔/爪牙类别，不给具体爪牙角色；不按 recluse/spy 误认逻辑改动真实起始团队。伪装沿用 storytellerSeed:bluffs 确定性洗牌，排除真实与感知角色，每局生成一次，不因重试/刷新/重启重抽。

PrivateView 增加可选 `startInfo:{infoId,gameId,team,bluffs:{roleId,name,summary}[],acknowledged,canAcknowledge}`，只给 entry 对应的已授权本人且 releasedAt 已设。其他人（包括善良房主、大屏）连该字段都没有。`canAcknowledge = room.state==='RUNNING' && game.phase==='FIRST_NIGHT' && startInfo.stage==='WAIT_ACK' && releasedAt已设 && !本人entry.acknowledged && gameNow>=presentationUntil`；其余均false，CANCELLED即使曾释放也不可确认。确认后保留可回看内容；记录仅本人的可见信息，不放完整内部entry。5–6局 NONE/空 entries，初始 WAIT_NIGHTFALL、夜幕结束后 COMPLETE，保留现有小局规则提示，无此字段/无确认命令。

### 9.2 生成、释放、继续

1. createGame 构造自身角色消息及冻结 startInfo entries，但不把团队/伪装写入可见 history/messages，不调用 rememberBotTeam。stage=WAIT_NIGHTFALL。ROLE_REVEAL 确认和等待 UI 沿用，不提前暴露额外信息。
2. 所有玩家确认身份后，只切 FIRST_NIGHT、换 contextId、排 NIGHT_FALLS 演出；**不调用 initializeNight/settleNightIfReady**。夜幕持续5秒（旧局按旧时序），真人/人机在屏障完成前无 action，也不会收到自动首夜能力结果。
3. advanceTime调用`releaseStartInfoIfDue`前必须同时满足：room.state=RUNNING、game.phase=FIRST_NIGHT、全部身份已确认、stage=WAIT_NIGHTFALL、当前game确有day=0的NIGHT_FALLS事件、该事件end节点已发布且gameNow≥该事件startsAt+durationMs及presentationUntil。不满足时无副作用返回，尤其ROLE_REVEAL初始presentationUntil=0不能触发。满足后REQUIRED设置releasedAt=gameNow、stage=WAIT_ACK、phaseDeadlineAt=gameNow+180000；将各自结构化信息转换为本人记录，写一次；为对应人机填入同等合法队友记忆。NONE调用下述同一个`completeStartInfoAndContinue`完成函数。该释放在staged mutation持久化后才广播，不能在GET/序列化中发生。
4. WAIT_ACK 私密页面显示“首夜信息”，上部队友头像/座号/昵称（2–3列）、下部恶魔伪装角色卡，底部固定“已知晓”。确认中禁用连点；成功后“已知晓，等待其他玩家”。可关闭回到等待页并再次打开；关闭、返回首页或看角色表不算确认。其他玩家只看到同样的“夜晚进行中，请等待手机提示”，不显示待确认人数、座位、角色或私密步骤进度。
5. 最后一条 entry 确认后调用`completeStartInfoAndContinue`；该函数要求RUNNING/FIRST_NIGHT、全部身份已确认、当前game的day=0夜幕事件确实存在且end已发布、gameNow≥事件结束时间及presentationUntil；阶段只接受NONE+WAIT_NIGHTFALL或REQUIRED+WAIT_ACK且所有entry已ack两个入口，其他状态无副作用返回。它在同一事务内改COMPLETE、换contextId、调用initializeNight一次、设夜间phaseDeadlineAt=max(gameNow,presentationUntil)+180000、再settleNightIfReady；人机旧任务失效重算。NONE也必须settle，使首夜全为无需主动选目标的角色时自动发信息/进入黎明，而不等待不存在的行动。刷新/重复tick不能再次初始化、重复投毒或重复生成信息。entry保留到该game结束，正常私密历史可回看。GAME_OVER完整揭晓仍受演出屏障；中止时stage改CANCELLED、清理确认任务，ABORTED不额外公开身份，已释放给本人的信息仍只可由本人回看。

服务端必须在所有能力入口统一检查屏障：`privateAction`/`nightRequirement`在新局FIRST_NIGHT且stage非COMPLETE时不返回能力；`submitAction`在同条件下409 START_INFO_NOT_AVAILABLE；`initializeNight`/`settleNightIfReady`/夜序推进及自动信息生成在非COMPLETE时不得初始化、提交或结算。不能仅依赖nightOrder尚不存在，因为现有nightRequirement可独立推导能力，submitAction还会经settleNightIfReady自动初始化。只有上述释放/最后确认函数先把stage改COMPLETE后才能进入能力引擎。5–6局也经过夜幕结束屏障；LEGACY局保留原路径。

PlayerGame移除按ROLE_REVEAL文字筛选拼接的旧EvilFirstNightIntel卡，改用结构化startInfo；新记录写入FIRST_NIGHT/INFORMATION且只追加一次。私密卡沿用后台遮罩、重新同步后解锁与返回层机制，不在锁屏通知、页面标题、公开弹窗或声音中泄露内容。

### 9.3 确认接口、等待和异常

新增 `POST /api/rooms/:code/first-night-info/ack`，请求 `C + {infoId:string(UUID)}`，scope GAME，不收 seat/role/team/acknowledged。通过当前 HUMAN PLAYER token/账号归属、roomInstance/setup/game/context/version，再查本人的 infoId。新命令普通队列和收据两条路径都必须传 `accounts.get(request)?.sub`，保留已修好的人机按钮鉴权口径。BOT 仅经内部调度调用同一 service 规则，外部不能拿bot凭据操作。

前端 `api.ts commandBinding` 的GAME路径显式加入`first-night-info/ack`（冻结gameId/contextId）；`profile`显式ROOM绑定。两条POST路径均加入`rawRequest`的receipt-backed retry路径以及pending-command恢复入口，不能因路径默认匹配遗漏GAME字段。队列派发/重试必须使用原body、commandId和点击时绑定，expectedCommandVersion按既有机制处理，不能在重试时重新绑定下一局。ack收据kind=view，仅记操作，不持久化私密payload；HTTP每次返回重新序列化的最新私密视图。

WAIT_ACK、已释放且未确认的本人entry成功置 acknowledged=true，持久化后返回最新 PrivateView；同一 commandId/原payload 重放返回最新视图而非旧私密快照；相同ID不同payload409 COMMAND_ID_REUSED。新commandId在相同有效game/当前context下重复确认已确认entry为无副作用成功。错误顺序：先授权与协议/上下文，再查本人entry；无entry、他人infoId或未释放统一409 START_INFO_NOT_AVAILABLE，不返回他人身份或“还有几名邪恶”。旧局、5–6局同样返回该通用错误。

断线不自动确认，180秒到期只进入现有通用等待超时；服务端公开暂停原因保持“等待玩家完成当前操作”，不包含“邪恶/阵营确认”。房主可按已有权限延长等待、结束本局/回大厅，不能代点、看名单或强制跳过。本人重连取最新私密entry；恢复码仅恢复授权，不自动确认。结算/重开撤销旧game绑定，旧ack不得流入下一局。

BotKind 新增 `ACK_START_INFO`，args 只有 infoId，任务携带roomInstance/setup/game/context/commandVersion/controlGeneration；bot-policy 只根据自己的 PrivateView.startInfo.canAcknowledge 选择任务，不能读取其他entry或 assignments。调度器执行一次真实确认命令；paused不自动执行，step可执行一条。更换上下文、房主控制generation、重开时旧任务清除。freeze 的“推进计时”可推进到夜幕 end 并释放屏障，但不会替真人/人机确认；仍须本人点击/人机一步。没有自动计时边界且仍待确认时返回 WAITING，显示“等待玩家操作”，不假装已经推进。

## 10. 协议、持久化与兼容发布

### 10.1 协议与安全校验

协议升级到4，HTTP房间请求头、WS握手、RoomProtocolView及服务器入口同时更新。旧协议客户端访问房间接口/WS返回426及现有刷新提示，不让旧页面进入一个没有确认入口的新局。账号、目录、健康等非房间接口保持已有接口能力；不要放宽Origin、Cookie、签名票据或已绑定账号校验。新创建请求也受版本门禁，v1在此指报文版本，不代表允许旧room protocol3客户端继续游戏。

文中`C`即现有RoomCommandContext：ROOM包含`roomInstanceId/setupId/expectedCommandVersion`；GAME另含`gameId/contextId`；本次新增两条命令不带ballotId。所有绑定由现有命令队列取得，不能由表单拼猜。

昵称与头像沿用服务端规范；头像只接受目录精确 HTTPS URL，不因前端 avatarId可信而跳过服务端校验。语音链接只当用户提供的外部链接，不能插入 HTML。所有新room命令复用原频率限制、commandId、预期版本、持久化失败回滚与广播后置；不额外引入一套幂等表。

### 10.2 快照4与迁移

RoomRecord.schemaVersion=4；不增加关系表，新增字段进入现有加密快照。升级顺序明确为：识别输入schema→旧1/2升级至3（保留当前既有迁移）→校验3→3到4→校验4→restore service。禁止把4送进当前 `upgradeBotRoom` 的 `schemaVersion!==3` 分支，否则会把BOT改成HUMAN并丢失时钟；改为显式legacy集合，3→4不得调用清零初始化。

3→4：所有已有game标记 presentationVersion=1、startInfo={mode:LEGACY,stage:COMPLETE,entries:{}}（已ABORTED用CANCELLED），已有角色确认、首夜、消息和后续逻辑按旧流程走，不倒退、不重复发放信息、不要求旧局补确认；旧 ROLE_REVEAL 全确认后仍按旧 initializeNight 路径。已有 events 缺 timingVersion 补1；保留 startsAt/durationMs/pendingPublications/投票绝对时间、WALL/MANUAL偏移与epoch、botControl/memory/pending、收据及账号资料。新createGame和下一把才启用REQUIRED/NONE和presentationVersion=2。

`LiveRoomRuntime.initialize` 当前`legacyCodes = schemaVersion!==3`必须同步修改：按**输入**schema为undefined/1/2/3选出真实迁移房间，不包含4；在现有初始化事务中一次性保存迁移后的4快照及必要revision变化，提交成功后再开放调度/HTTP，失败不启动。重复加载已为4的快照不写库、不额外revision+1；不能只在service内存补字段却未持久化3→4，也不能把4当旧版本反复迁移。

快照4校验：stage/mode枚举正确，game/seat引用有效，REQUIRED entries与不可变起始校验基准的恶魔/爪牙席位完全对应且符合人数配置，不能用局内已变化的roleType反校验起始信息；infoId唯一，team为基准内除本人外的完整队友、类别对应，bluffs仅起始恶魔且恰好3个互异合法善良roleId、不在excludedBluffRoleIds中，布尔ack合法。WAIT_NIGHTFALL没有releasedAt；WAIT_ACK必须有releasedAt且仍FIRST_NIGHT；COMPLETE在新REQUIRED局所有ack为true；CANCELLED仅ABORTED，允许未确认entry及未释放状态；LEGACY entries空且只允许COMPLETE/CANCELLED。NONE无起始校验基准、entries空，仅WAIT_NIGHTFALL/COMPLETE/CANCELLED。保存时不从私密文字反推entry。BOT任务验证器增加ACK_START_INFO参数白名单与UUID校验，拒绝未知kind、越界时间、超量/重复任务；共享所有快照/序列化schema、DB预算校验和测试夹具一并升级，不能只改TS类型。

未知schema或损坏快照拒绝启动并报告房间码与错误类别，不打印快照/身份/token；不自动清空房间。迁移输出必须可用新程序再次加载且不产生二次变化。4不能回滚给旧schema3程序；需要回退时使用部署前数据库备份和对应旧代码，或发布支持4的前向修复，不能把schema号改回3。

### 10.3 配置、发布和恢复

无新增环境变量；演出/人机新旧时序按局版本选择，无后台“隐藏快进”配置。头像目录、昵称池、图片和时序表随同一构建发布。沿用当前Fribench账号/会话密钥，不写入文档或客户端。

未来实施完成且已获部署授权后，固定主线commit，按当时最新公共规范拿全局部署锁 `/run/lock/fribench-deploy.lock`，仅部署本游戏；发布前备份目标数据库并在副本验证能恢复、迁移统计与原房间数/人机数一致。旧客户端426提示、API/WS版本、资源缓存刷新必须作为同一次发布。保留已有源站健康和公网HTTP只读检查；不创建生产测试房、不发送玩家消息、不读取/记录私密身份以验证。生产业务交互和视觉由用户真机验收；不存在浏览器验收结果时不声称已做真机验收。

## 11. 实施阶段、定向验证与验收

实施顺序（收到实施授权后才执行）：

1. 契约/快照4迁移、首夜屏障与账号鉴权；先保证旧局不退回、隐私不扩散和单步可达。
2. 游客资料、账号复用、不可变创建/加入意图及统一创建；保持丢响应不重复建房/占座。
3. 共享排序组件、暗场景与移动布局；替换现存两套排序，保持服务端排列权限。
4. 版本2演出、音效/动画锚点与人机延迟；接入新局版本，旧局保留原时序。
5. 按下表逐项核对、独立代码review并修复；同步现有开发记录、部署文档和本方案的实施状态，再按明确授权发布。

只为业务边界/故障场景补测试，复用已有覆盖；不为文案/色值/纯透传机械加断言。计划中的最短验证如下，实际运行后记录结果，未执行不得标为通过。

| 风险/场景 | 验证方法与明确通过标准 |
| --- | --- |
| 排序不连续/静止抖动 | 几何和弹簧纯函数定向测试：3/4列、末行、跨行、静止指针、6px滞回、滚动偏移；同一位置索引稳定，邻项目标不依赖动画rect，位移/速度连续 |
| 拖动取消/重复提交 | 复用DOM交互测试（不启浏览器）：主指针8px、cancel/Escape/失焦/setup变更、意外lostcapture与主动release、旋转resize、drop后click、键盘落位；同序0次、一次drop1次请求，旧响应不覆盖新快照，自身变序setup的WS/HTTP快成功均不提前销毁浮层 |
| 排序权限/并发准备 | 服务端现有reorder测试补：DISPLAY/非房主拒绝、不完整排列拒绝；join/踢人/start并发只有一个有效setup；成功变序清准备一次，重试不重复清 |
| 游客持久/随机 | storage mock+固定随机源：首次生成一次、重开表单复用、仅坏字段修复、目录失败fallback、storage拒绝内存继续、storage事件不覆盖草稿、登录账号从不随机；随机重名在换BOT/消费票据前拒绝，用户改名后继续原房；覆盖用户举例名字与目录合法性而非样式常量 |
| 资料权限与局内冻结 | app/service定向测试游客本人、他人、DISPLAY、BOT、账号token/sub不匹配；LOBBY立即更新不清准备，RUNNING/结算pending，下把应用；账号profile stale保留草稿 |
| 创建/加入超时 | 复用意图/票据测试补avatar与creationVersion：双击singleflight、创建响应丢失、pendingJoin写入顺序、加入已消费重试、只替换一次人机、跨账号旧响应丢弃；v1旧指纹不变、v2语音不丢；账号资料并发变化409且票据/人机未消费，明确确认后只加入原房一次 |
| 7/8/10/12人起始信息 | 固定配牌服务端测试：恶魔/1–2爪牙各取合法信息、3伪装未在场、善良/大屏无字段；ROLE_REVEAL初始0时限重复tick不释放；确认自身身份前/夜幕end前history均不可见，首夜能力必须等待全员ack；继任恶魔后起始信息仍按原基准加载 |
| 5/6人规则及首夜能力 | 默认Teensyville无队友/伪装/ack，正常走到投毒/占卜/管家等真实首夜行动；全首夜无需主动选目标的合法配牌也能自动信息→黎明；隐士/间谍误认不改变起始团队；不增加新角色规则 |
| 确认重复/并发/存储故障 | 最后两人并发ack、同ID重放、他人infoId、旧game/context、账号与游客分别调用；新增前端路径实际带GAME字段且重试同ID；确认前直接POST action拒绝且无nightSubmissions/回执/能力初始化；最后初始化恰好一次；DB失败无ack/发布/记忆泄漏，重试正常继续 |
| 断线/超时/重开 | 真人断线不代确认，超时只通用等待，延长不绕过屏障；重连信息不重抽，旧ack/旧bot任务不能作用下一把；结算/终止仍按原隐私屏障 |
| 人机暂停/单步/冻结 | 新任务经本人PrivateView选择；pause不自动ack、step只执行一条、advance到夜幕end只释放；MANUAL冻结无进度/音效前进；多人加入仍按原规则退出单人冻结 |
| 演出发布边界 | 版本1/2 fake clock：start/result/end 前后1ms，死亡/胜方/角色/能力未提前；辩护仍20s、每席1.5s，旧票/管家隐私既有有效用例复用 |
| 动画及音效恢复 | EventStage/音效调度定向测试：稳定event节点、freeze/epoch不重播已过cue、晚加入只播未来、mute/hidden取消；结果锚点来自同一表；不把这些测试当视觉验收 |
| 持久化迁移 | DB副本/integration fixture覆盖schema1/2/3→4，3的BOT/pending/MANUAL/未公开演出/投票/账号资料不丢；4重复加载稳定，损坏/未来版本拒绝；旧ROLE_REVEAL不补屏障 |
| 资源与类型集成 | 本次新增契约跨web/server，需工作区typecheck与生产build各一次验证导出、CSS/资源路径和版本门禁；只在此集成稳定节点运行，不每改一处重跑 |

未来部署后用户手机验收清单：微信内置浏览器、iOS Safari、Android Chrome；320×568/375×667/390×844/430×932及横屏短高。创建/加入/头像弹窗键盘开启时关闭与保存始终可见；整页不滚、内部可滚；暗背景下昵称和状态清楚；12席跨行拖动和自动滚动跟手、静止无抖动、落位无闪回；外部语音不能外跳时能显式复制；7+含人机完整首夜等待可读，暂停/单步/冻结文案对应实际行为。该清单留给用户，不在本地打开页面代做。

完成判据：六项确认范围均落地；表中相关定向验证有真实结果或明确复用证据；独立review无未关闭P1/P2；现有开发/部署文档同步；获得部署授权后固定commit发布并完成非浏览器健康核对。用户真机未验收时明确保留此项，不把它伪装成自动化已覆盖。

## 12. 独立 review 与修订记录

2026-11-11 完整草案后进行两路只读独立review：`plan_backend_review`负责资料/鉴权/首夜/人机/迁移，`plan_ux_review`负责排序/手机布局/节奏/恢复。主代理修订后两路再次复审，最终均确认可直接实施，无未关闭P1/P2。

| 审查发现 | 已纳入的修订 |
| --- | --- |
| 只延后initializeNight仍能通过直接action绕过确认 | §9.2统一私密action读取、直接POST、initialize/settle屏障，§11直接请求故障用例 |
| 5–6局状态和全被动首夜可能卡住 | NONE初始等待夜幕，两个入口共用初始化→deadline→settle完成函数 |
| 中止后的待确认状态无法加载/仍显示确认按钮 | CANCELLED、完整canAcknowledge公式及对应快照校验 |
| 恶魔继任会使按当前角色反校验起始信息失败 | 以不可变起始基准校验，不从局内新角色重算起始信息 |
| Portal移动源节点会丢capture/焦点；自身排序成功被误当冲突 | 稳定capture/源wrapper/视觉副本；关联提交句柄，同排列新setup保留落位 |
| avatarId无法保留历史版本 | 存精确可信URL，完整历史白名单与当前v3随机子集分开 |
| 账号资料并发更新会破坏冻结意图 | 新入座前revision与完整显示值比较；未消费409后显式确认继续原房 |
| 新API路径可能缺GAME绑定/安全重试；迁移只在内存 | 点名commandBinding/retry/pending，初始化来源版本筛选与原子持久化 |

另完成规则来源核对、随机重名恢复、零时长事件与中性事件timingVersion传递的文档自查。现有前一版方案增加后续方向链接；部署记录无需修改，因为运行版本没有改变。实际执行仅为源码/规则阅读、文档编写和独立审查；第11节是未来实施验证计划，本轮未执行其中测试、构建、数据库迁移或真机验收，也未打开本地游戏页面或部署。


## 13. 2026-11-11 实施与验证记录

实施基线fff959e，公共规范实施前/发布准备重新核对均为964c0ba2357810506ba4d9e883d217f377ea0615。实现没有更新依赖、公共账号或其他应用。

| 范围 | 实际实现与核对 |
| --- | --- |
| 排序 | SeatOrderGrid/seat-sort替换大厅和SeatOrderEditor旧拖拽；稳定grid capture、视觉portal、原位空槽、独立弹簧、最终指针计算、键盘/失焦/成员变动取消、自己新setup保留落位、同ID失败重试；未提交可取消，已提交Esc不撤回 |
| 暗背景 | imagegen内置工具生成不同构图的无人物内庭，1440×2560 WebP为88196字节；创建/加入/大厅接入暗遮罩，资源失败有纯色渐变；提示词与来源见public/art/rooms/courtyard-night.json |
| 资料 | 共享PlayerProfileEditor与usePlayerProfile；游客随机名池≥80、头像从共享v3目录选，完整历史URL保留、整条localStorage存储；关闭弹窗还原草稿，固定头像层与返回焦点；首页和大厅本人可保存 |
| 创建/加入 | 统一创建与可选语音，v1原报文/指纹继续；v2忽略旧模式且校验外链无用户名密码；账号revision/显示值冲突不消费票据；创建/加入single-flight与冻结意图，存储失败有内存后备，清空tombstone阻止撤销会话复活 |
| 大屏与语音 | 更多提供公共大屏链接，display=1预选DISPLAY加入表单，点击链接不占座、不借PLAYER授权；大屏不显示账号资料，有独立426刷新入口；语音链接显式打开/复制与域名提示 |
| 节奏 | 新局时序2，夜幕5秒、射击/处决6秒、黎明6.5秒、结算7秒；动作/音效/结果点统一版本表；旧局时序1不改；稳定事件DOM、冻结seek与未来cue恢复、缺WA静态降级；辩护20秒/逐席1.5秒保持 |
| 首夜 | 7+夜幕后释放本人结构化起始信息并确认，全部完成才初始化/settle；能力读取、直接POST和内部引擎均有屏障；5–6无额外信息且全被动也能自动到黎明；人机经自身view确认，暂停/单步/冻结继续生效 |
| 迁移 | 快照4/协议4，启动事务持久化1/2/3→4、4不重复写；旧局LEGACY路径，BOT/待办/时钟/票据/公开进度保留；取消态与不可变起始角色基准可恢复 |

验证实际执行与复用（均无浏览器）：

- 新接口、首页资料、创建/加入、移动交互等58项定向通过；规则、时序、排序及5/6/12席真实人机流程87项通过。
- 旧票/管家隐私、启动/快照兼容、负载和收据预算等49项中48项通过，1项PG初次按默认环境跳过，后由隔离PG补足。原有精确旧演出用例明确使用LEGACY/时序1夹具，新时序2另有结果前后1ms、终局揭晓、20秒/1.5秒用例。
- 新增最终边界与恢复等29项通过，包括公共大屏不自动占座、v1创建不补null头像、存储只读时撤销会话不复活、损坏游客资料复用内存；排序DOM用例检查快速drop、自身WS成功保持同一浮层、成员删除安全取消和键盘焦点。
- 隔离PostgreSQL17.11仅监听本机127.0.0.1，10个相关用例最终通过（6个真实PG用例及同文件纯测试）。初次9通过/1个夹具仍期待schema3，更新为4后只复跑受影响bots文件2项，均通过；其他已通过结果复用。覆盖加密、事务失败、单写锁、1/2/3迁移与4重载、资料和创建收据。临时数据库已停止；本机临时目录清理被工具策略拒绝，未影响其他数据库。
- 工作区typecheck与生产build通过，输出index-CKo3SEhV.js/index-D67ISAzx.css；保留既有两条平台注入脚本非module构建提示。后续只改文档/资源来源记录时不重复构建。
- 首次整体运行324项，285通过/33失败/6PG跳过；失败集中于需显式补首夜状态/协议4/新交互的旧夹具及上述新路径，相关失败均在定向复跑关闭，不将首次运行写为全绿，也不叠加重复用例数字为总覆盖数。
- pnpm audit非零：4 high/12 moderate/4 low，依赖版本本轮未变；high均来自jsdom开发依赖下undici8.10.2，生产服务包不含该npm模块。其他告警保留为既有依赖审计事实，没有顺带升级依赖。

独立审查：implementation_backend_review、implementation_frontend_review和implementation_completion_review均在修订后确认无未关闭P1/P2。关闭项包括后端URL验证、教学人机时长、DISPLAY资料隔离；加入并发/内存意图、撤销会话tombstone、modal焦点与取消、首夜确认后继续行动；以及大屏入口/426刷新、无WA降级和已提交排序Esc行为。

本地没有打开任何游戏/预览页面，没有使用有头或无头浏览器。手机视觉、手感、微信外跳和真实帧率仍由用户在部署后验收，以上DOM/时钟用例不替代该验收。


### 发布收尾

固定提交1487d0028ac7648d77a8330076dcec485fe19786已推送并合入main，2026-11-11 12:38完成本游戏独立发布。全局锁、目标库备份与隔离恢复、固定控制版本、旧协议426、新静态资源哈希、HTTPS与无凭据WS拒绝及30秒观察通过；原有1局/8席/7人机未清空，schema3→4后座序/凭据/机器人/时钟摘要一致。45个非目标容器与本轮核对的32份路由摘要不变，未建生产测试房。备份/验收/缓存清理精确路径见[部署记录](../../unified-deployment.md)。

本轮实施、逐项核对、三路独立复审、必要验证和授权部署均已完成；旧局保持原时序，新节奏与首夜确认从下一把启用。未执行的手机真机视觉/流畅度验收如实保留，不作为本轮已完成的验证。
