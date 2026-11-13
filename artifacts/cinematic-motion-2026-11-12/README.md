# 演出动作核对素材

这些是离线审查输出，不是浏览器截图，也不是微信真机验收。无本地游戏或演示页面被打开。

- `private/`：`scripts/render-private-prop-review.mjs` 直接渲染运行中的 `LayeredSceneArt`。同一 SVG 几何、同一材质与同一 elapsedMs，通过 React 服务端输出和 sharp 栅格化；仅为 librsvg 解码将内嵌 WebP 转为 PNG，不另造动作。黑/灰关键帧用于检查透明边、铰链和遮挡；GIF 用于观察连续动作。
- `butler/`：单一中立画由 `scripts/build-butler-rig.py` 确定性蒙皮，24 个下降姿态、原姿态反向起身。正常与骨架 GIF 使用运行时共享时间点，以 40ms 采样；骨架和图集来自同一个 pose()，双腿/髋/膝/踝保持原位。关节及运行画布见 `butler-pose.json`。
- `public/`：`scripts/render-public-cinematic-review.mjs` 直接导出猎枪、独立恶魔双翼、有人/无人断头台、喷溅与两种胜利的生产 SVG；`review.json` 记录材质位置、采样时刻和方法。这里不包含 HTML 玩家卡和操作栏，不把局部美术导出当作整页视觉验证。

真实情报只在应用收到授权描述符并达到结果时间后挂载。这里的姓名和角色是固定审查夹具，不来自实际房间。素材来源、提示、哈希和图层裁切见 `apps/web/public/art/effects/v4/manifest.json` 与 `SOURCES.md`；音轨来源与实际起音偏移见 `apps/web/public/audio/effects/v4/`。

本组输出证明局部素材与动作几何，不证明设备扬声器听感、微信原生栏位或实际渲染帧率。手机适配另以运行组件结构、CSS 高度/安全区及定向用例核对。

跨电脑交付补充：sources归档17张已采用的生成PNG原图、固定SHA的Kenney CC0包、source-index.json及可移植的root-source-spec.json。已逐项核对原件SHA与运行provenance一致，原电脑缓存不再是唯一来源。脚本/依赖说明见仓库README，正常PNG/WebP及声轨未重新生成。

2026-11-13 第一批修订：管家 atlas 由运行组件的固定 320×448 内层 viewport 显式裁切，防止外层 meet 留白暴露邻格。离线验证使用完整运行 SVG（800×240、240×600，四个时刻），不只检查源单格。恶魔接触时钟增加头像左刀2050ms、右刀2350ms；屏幕左/右刀仍为1450/1750ms，展翼600/850/1100ms，公共总时长不变。手机实际观感仍需人工验收。

2026-11-13音频补充：恶魔当前接触轨在 `apps/web/public/audio/effects/v5/`，重建脚本 `scripts/build-contact-audio.py`；复用已固定SHA的v3源，未覆盖历史文件。主能量接触点85ms已补偿到共享时钟1450/1750/2050/2350ms，四次音效只表示袭击动作提交。预览仅显示当前v4演出，顶部常驻声音开关/实际主输出音量，私密试听设置与正式房间隔离；首页标题快速三击可进入，单轨试听仍保留。横屏矮窗使用右侧播放控制栏。本地仅代码/DOM/媒体数值核对，真机视听仍需正式环境人工验收。

2026-11-13 第二批修订：v5新增独立透明短管双管猎枪、宽比例断头台（340×480运行画布、颈孔44直径随整台等比），原v4及旧绞刑架保留。书壳、书脊和16条活动页共用斜面投影；棺盖加入真实向上抬升，90度不再缩成线；水面覆盖浸水布、滴水位于盆前沿后；毒瓶实际液体内增加20枚裁切气泡；刀接触下移12px，三块菜片覆盖全部源菜尾端；鸦翼支点移至实际素材翼根。
新原图及简述prompt保存在sources/nov13，构建命令 `node scripts/build-cinematics-v5.mjs`。本批重新输出的private与public黑/灰PNG是当前运行SVG静态关键帧；同目录既有GIF保留为11月12日历史版本，不代表本次动作，未打开本地演示或游戏网页。烧城环境板先随素材保存，下一批接入独立主体/火/烟/余烬层。

2026-11-13 第三批修订：公开入夜/黎明使用独立缓升月亮/太阳（AtmosphericSky），背景v5/night-town与dawn-town已去预烘焙天体。胜利使用全屏town/atmosphere和独立meet主体；邪恶胜利恢复无恶魔烘焙的燃烧城镇，独立翅膀、透明火焰纹理、烟和32余烬。镇长使用无权杖底图加独立完整权杖，消除移动时底图空洞。透明绿雾原图保存在sources/nov13；构建将RGB约束深绿(.19G,.64G,.075G)，保留原alpha，黑/灰底PNG已核查无白边。PoisonVapour增加30枚由底部升至58%高度气泡，900ms开始显现；非compact为独立fixed全屏层。PrivateSceneStage的挂载由来源会话负责，条件为poisoner的IDENTITY/ACTION_SUBMITTED，并使用/art/effects/v5/poison-vapour.webp冻结readyKey；不表示能力成功。屏幕刀痕也独立fixed，中央道具保持原等比画布。
本批所有生成素材使用built-in image_gen，生成prompt简述与尺寸/hash见sources/nov13/spec.json及v5/manifest.json；工程内路径均已落库，不依赖生成缓存。未执行浏览器、手机观感或听感验收。

2026-11-13 第四批修订：用户要求短管枪连握柄重做、断头台继续加宽。v6/birdhead-shotgun为无肩托、短而下弯鸟头木柄，保留清晰扳机护圈、双管和精细机匣；外形参考Denix官方1114（非1115长托）、Wilson55失能双管手枪型与Réplique Manga Ciné P1114，仅参考外形，商品照片不进入游戏资源。来源链接与prompt见sources/nov13-v6/spec.json。v6断头台重新绘制成近方形宽结构，独立宽浅刀片；画布480×480、主体480×462.19，头像/颈孔直径81.34（上一稿44），与实际透明孔同一几何。源图孔部半透明杂色通过明确110源像素圆形alpha裁切和低alpha噪点清理恢复透明，未横向拉伸主体。所有头像、台、刀在同一按容器短边适配的方形canvas内，避免横/竖屏meet留白时HTML头像错位。运行SVG宽台审查PNG按方形输出。
重建命令 `node scripts/build-cinematics-v6.mjs`；v5及旧素材均保留，本批未替换角色portrait、声音、公共结果或总时长。现有测试覆盖实际孔部alpha与头像几何、空台不落刀/不震动/无血；手机实际体验交用户人工验收。

第四批独立复审修订：宽刀片行程250，保持公开resultAt；媒体用例按实际刀片alpha轮廓逐列验证斜刃已越过整孔底，关键帧更新。工作树node_modules为junction，pnpm脚本被UNSAFE_TASK_RUN_STATE_PATH拒绝；已执行同一package.json步骤的tsc --noEmit与vite build等价构建成功。该构建之后仅修订行程常量并通过对应媒体用例，未重复构建。
2026-11-13手机无声反馈追加：手册纸张声由书内开关授予局部许可，不再被默认关闭的演出总开关误拦截。`createBookAudio().prepare(feedback?: boolean): Promise<boolean>` 必须直接在声音开启/翻页手势内调用，先同步解锁并预热既有纸轨，再异步准备纹理；`silence`/`dispose`撤销该书许可与晚到反馈。不会开启私密动作音效或修改线上/线下/预览偏好；纸张仍用原轨，book范围增益从0.23调为0.65。共享解锁允许后续手势重新resume，不复用卡住的自动请求。此为代码与离线数值修复，不能替代手机可听验收。

大厅M19无声反馈追加：原候选完整录音不变，运行另用 `apps/web/public/audio/music/v1/lobby-m19.mp3` 的完整响度修订副本（175.521秒，实测-20.73 LUFS/-2.44dBTP），脚本 `scripts/build-lobby-music.py` 从固定SHA候选重建，无新外部来源。大厅播放器音量改为0.8，预载音频；按实际readyState/paused/muted和playing/pause/waiting/error事件更新状态，8秒未起播或加载失败显示可重试入口，click/touchend直接重试未完成自动请求。不可把DOM/HTTP/Range/媒体数值检查写成手机真实可听验收。

2026-11-13 手机候选印布/头像抓痕追加（本提交未发布，基线5685b7b；26dcefe既有上线事实不变）：洗衣妇原通用小标记在无头像URL时仅有小字，且没有与分条衣料共用变形/遮挡。现将本次shown.seats对应的imprint头像与昵称印入同一10条衣料切片，无URL时画昵称首字默认头像；布统一1.2倍等比，实际衣料alpha约束、浸水水面与盆前沿共用遮挡，提起后可见二人。仅使用已获知候选和公开资料，不查询真实角色或修正醉毒线索，1900ms前仍不挂候选语义。
恶魔原头像刀痕按含昵称整格定位，512纹理主刀痕又集中下半部。新增独立64px/短屏42px头像盒（昵称在盒外），PrivateAvatarClaw按实测红墨alpha重心裁取主刀痕：左(219,342)、右(281,329)，500×300局部视窗配显式主刀痕clip与头像圆clip，剔除纹理顶端碎片，手机两种尺寸均将刀痕落在头像上。认可的1450/1750屏幕两刀、2050/2350目标两刀和所有声音未改；队列、门禁、ACK与信息公布未改。
有效验证：PrivateSceneStage定向16项（含候选来源/1900门控/默认头像、长昵称独立头像盒）；实际runtime SVG媒体2项（64/42px主墨alpha中心、布沉入/提起头像遮挡）；前端tsc通过，独立只读review通过。静态证据private/washer-marks-2026-11-13.png、avatar-claw-anchors-2026-11-13.png；`node scripts/render-private-mark-review.mjs`可重建。图中A/B是无真实玩家数据的测试头像，时刻/方法见同目录JSON；无浏览器、演示播放或手机感官验证，仍待正式手机人工复验。共享阶段/发布记录由来源会话统一同步。

2026-11-13 提名方笼独立素材追加（未发布，不含UI/状态修改）：黑铁暖金反光正面方笼，三根细栏杆，少量右上纵深；无背景、人物、文字或分类徽框。原图与完整prompt在sources/nov13-cage，`node scripts/build-nomination-cage.mjs`导出到public/art/effects/v7并生成每档尺寸、SHA与原件SHA。透明PNG1024为nomination-cage.png，WebP512为nomination-cage.webp（57,550字节），默认运行建议nomination-cage-small.webp256（19,362字节），极小图nomination-cage-tiny.webp128（7,136字节），所有档保留同一透明画布/等比坐标。
源1254×1254的头像建议锚点cx600/cy660/diameter660，安全头像方区x270/y330/w660/h660（仍有三根细铁栏覆盖）；四个完全通透窗区见spec/manifest。覆盖头像A×A时，笼图宽/高1.9A、left=-0.40909A、top=-0.5A，需在圆头像裁切之外叠加，不能按整图中心或裁进圆内。各档像素锚点见v7/manifest.json。素材头像区铁栏约14.5%，其余通透；256/128小档alpha<10的比例约82.6%/78.3%，四角全透明。四个源窗区alpha<10比例均为1。实际64/42px假头像套笼静态样张public/nomination-cage-2026-11-13.png及JSON（2倍最近邻显示，非真实用户/页面）。
游玩会话负责替换绳圈、提名公开状态/详情、最高票待处决者保留牢笼并加现有公开gallows图形；本素材任务未改SeatRing等文件，旧绳索与绞刑架均保留，无需重复制作整套绞刑架。媒体验证覆盖透明度、细栏杆小图可见性与正面头像锚点，不代表浏览器或手机人工验收。
方笼独立素材review已通过；接入必须置于头像圆形裁切之外，并使用开口锚点。

2026-11-13用户澄清开场音乐范围：替代原大厅至全员身份确认截止。组件现提供`OpeningMusic`（兼容`LobbyMusic`）稳定挂载接口，支持跨首页/创建/加入/大厅/教学/身份确认/首夜保持同一M19音源与进度；首晨实际演出startsAt由App公开时钟驱动fadeOut，800ms降到0后暂停；ducked将前景期间音量平滑压到0.26而不中断。返回菜单或下一把可恢复原进度；不更改已认可的恶魔四刀或素材。此条记录组件交付，App范围接入/上线由来源会话统一记录。

跨入口音源所有权补充：App根层只调用一次`useOpeningMusic`，页面通过44px内联`OpeningMusicControl`移动控制，保证首页→创建/加入→房间不重建播放器。旧`LobbyMusic`/`OpeningMusic`wrapper仅保留兼容。`fadeOut`、`ducked`驱动包络，公开首晨时间及入口挂载由来源App集成；没有修改Home/App或恶魔素材/时钟。

2026-11-13最新统一声音约束：前述独立书声许可/音乐开关方向已被本条取代。唯一正式偏好`ravens_effects_audio`统管音乐/公开音效/翻页，无值默认on、显式off尊重；旧book/lobby值不再门控，纸张prepare也不能越过总关闭。根音乐hook与active/fadeOut/ducked保留，但持续层不自带控件；页面/手册统一使用44px`GlobalAudioButton`音符，原音乐长胶囊与悬浮音效长按钮移除。Global开关同点击栈resume→正式事件→HTMLAudio.play；预览临时设置与线下私密静音规则保留。音轨/盾/恶魔四刀素材与时钟均不变，App/Home/Guide接入由来源与手册会话完成。


2026-11-13 角色细节首组（本条记录本地组件交付；部署事实由统一部署记录维护）：EVIL_START改用v8八份真实独立信封层，破蜡600ms、翻盖850–1450ms、抽纸1450–2150ms并上提185；前袋持续遮住纸底，团队/伪装内容印在同一张纸上，仍只在既有1900/2400门禁后收到。调查员移除落章，改用独立证物台、空孔完整圈柄和淡玻璃弧光，650–1800ms自然扫查旋转；镜孔内重复采样实际底图并围绕当前镜心放大，未烘焙另一张纸像。运行镜心(300,205)，全透明安全半径82；实测外缘约101–104、孔归一半径85如实记录，不假称外圈精确100。v8全部11份600×500 RGBA层及源PNG、完整prompt、校准参数、SHA和重建脚本见sources/role-detail-v8与runtime role-detail-manifest.json；信封/镜新增解码量分别约9.6MB/3.6MB。
占卜三层紫烟保持原体积、慢速轮转并在答案出现后保留，玻璃弧光独立变化；洗衣布改为共边连续三角网格，褶皱、头像与姓名一起变形，入水/搓洗/提起驱动水纹，湿墨1900–2250ms渐显、提稳后保持清晰。只使用收到的shown/imprint，不纠正醉毒内容，不引入真实角色、成功结果或被动触发提示；已认可枪/管家/毒瓶/四刀、公开结果和总时长不改。
真实LayeredSceneArt离线黑/灰PNG已更新sealed-letter、investigator、fortune_teller和washerwoman；`node scripts/render-private-prop-review.mjs --frames-only <role>`可重建，旧GIF未更新。本组35项不同的定向动作/DOM/资源/媒体用例通过（复用未受后续改变影响的结果），镜孔alpha0与局部放大对照使用真实文件，前端类型检查和生产构建通过；独立只读review通过。共享接触时钟由cinematic-timing.ts维护，音轨由声音会话独立交付，未在本组件工作树重写音频引擎。没有浏览器、游戏/演示播放、试听或手机感官验收；后续角色组继续，不将首组交付写作全角色完成。
