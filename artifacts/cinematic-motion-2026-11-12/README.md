# 演出动作核对素材

这些是离线审查输出，不是浏览器截图，也不是微信真机验收。无本地游戏或演示页面被打开。

- `private/`：`scripts/render-private-prop-review.mjs` 直接渲染运行中的 `LayeredSceneArt`。同一 SVG 几何、同一材质与同一 elapsedMs，通过 React 服务端输出和 sharp 栅格化；仅为 librsvg 解码将内嵌 WebP 转为 PNG，不另造动作。黑/灰关键帧用于检查透明边、铰链和遮挡；GIF 用于观察连续动作。
- `butler/`：单一中立画由 `scripts/build-butler-rig.py` 确定性蒙皮，24 个下降姿态、原姿态反向起身。正常与骨架 GIF 使用运行时共享时间点，以 40ms 采样；骨架和图集来自同一个 pose()，双腿/髋/膝/踝保持原位。关节及运行画布见 `butler-pose.json`。
- `public/`：`scripts/render-public-cinematic-review.mjs` 直接导出猎枪、独立恶魔双翼、有人/无人断头台、喷溅与两种胜利的生产 SVG；`review.json` 记录材质位置、采样时刻和方法。这里不包含 HTML 玩家卡和操作栏，不把局部美术导出当作整页视觉验证。

真实情报只在应用收到授权描述符并达到结果时间后挂载。这里的姓名和角色是固定审查夹具，不来自实际房间。素材来源、提示、哈希和图层裁切见 `apps/web/public/art/effects/v4/manifest.json` 与 `SOURCES.md`；音轨来源与实际起音偏移见 `apps/web/public/audio/effects/v4/`。

本组输出证明局部素材与动作几何，不证明设备扬声器听感、微信原生栏位或实际渲染帧率。手机适配另以运行组件结构、CSS 高度/安全区及定向用例核对。

跨电脑交付补充：sources归档17张已采用的生成PNG原图、固定SHA的Kenney CC0包、source-index.json及可移植的root-source-spec.json。已逐项核对原件SHA与运行provenance一致，原电脑缓存不再是唯一来源。脚本/依赖说明见仓库README，正常PNG/WebP及声轨未重新生成。

2026-11-13 第一批修订：管家 atlas 由运行组件的固定 320×448 内层 viewport 显式裁切，防止外层 meet 留白暴露邻格。离线验证使用完整运行 SVG（800×240、240×600，四个时刻），不只检查源单格。恶魔接触时钟增加头像左刀2050ms、右刀2350ms；屏幕左/右刀仍为1450/1750ms，展翼600/850/1100ms，公共总时长不变。手机实际观感仍需人工验收。

2026-11-13 第二批修订：v5新增独立透明短管双管猎枪、宽比例断头台（340×480运行画布、颈孔44直径随整台等比），原v4及旧绞刑架保留。书壳、书脊和16条活动页共用斜面投影；棺盖加入真实向上抬升，90度不再缩成线；水面覆盖浸水布、滴水位于盆前沿后；毒瓶实际液体内增加20枚裁切气泡；刀接触下移12px，三块菜片覆盖全部源菜尾端；鸦翼支点移至实际素材翼根。
新原图及简述prompt保存在sources/nov13，构建命令 `node scripts/build-cinematics-v5.mjs`。本批重新输出的private与public黑/灰PNG是当前运行SVG静态关键帧；同目录既有GIF保留为11月12日历史版本，不代表本次动作，未打开本地演示或游戏网页。烧城环境板先随素材保存，下一批接入独立主体/火/烟/余烬层。

2026-11-13 第三批修订：公开入夜/黎明使用独立缓升月亮/太阳（AtmosphericSky），背景v5/night-town与dawn-town已去预烘焙天体。胜利使用全屏town/atmosphere和独立meet主体；邪恶胜利恢复无恶魔烘焙的燃烧城镇，独立翅膀、透明火焰纹理、烟和32余烬。镇长使用无权杖底图加独立完整权杖，消除移动时底图空洞。透明绿雾原图保存在sources/nov13；构建将RGB约束深绿(.19G,.64G,.075G)，保留原alpha，黑/灰底PNG已核查无白边。PoisonVapour增加30枚由底部升至58%高度气泡，900ms开始显现；非compact为独立fixed全屏层。PrivateSceneStage的挂载由来源会话负责，条件为poisoner的IDENTITY/ACTION_SUBMITTED，并使用/art/effects/v5/poison-vapour.webp冻结readyKey；不表示能力成功。屏幕刀痕也独立fixed，中央道具保持原等比画布。
本批所有生成素材使用built-in image_gen，生成prompt简述与尺寸/hash见sources/nov13/spec.json及v5/manifest.json；工程内路径均已落库，不依赖生成缓存。未执行浏览器、手机观感或听感验收。

2026-11-13 第四批修订：用户要求短管枪连握柄重做、断头台继续加宽。v6/birdhead-shotgun为无肩托、短而下弯鸟头木柄，保留清晰扳机护圈、双管和精细机匣；外形参考Denix官方1114（非1115长托）、Wilson55失能双管手枪型与Réplique Manga Ciné P1114，仅参考外形，商品照片不进入游戏资源。来源链接与prompt见sources/nov13-v6/spec.json。v6断头台重新绘制成近方形宽结构，独立宽浅刀片；画布480×480、主体480×462.19，头像/颈孔直径81.34（上一稿44），与实际透明孔同一几何。源图孔部半透明杂色通过明确110源像素圆形alpha裁切和低alpha噪点清理恢复透明，未横向拉伸主体。所有头像、台、刀在同一按容器短边适配的方形canvas内，避免横/竖屏meet留白时HTML头像错位。运行SVG宽台审查PNG按方形输出。
重建命令 `node scripts/build-cinematics-v6.mjs`；v5及旧素材均保留，本批未替换角色portrait、声音、公共结果或总时长。现有测试覆盖实际孔部alpha与头像几何、空台不落刀/不震动/无血；手机实际体验交用户人工验收。

第四批独立复审修订：宽刀片行程250，保持公开resultAt；媒体用例按实际刀片alpha轮廓逐列验证斜刃已越过整孔底，关键帧更新。工作树node_modules为junction，pnpm脚本被UNSAFE_TASK_RUN_STATE_PATH拒绝；已执行同一package.json步骤的tsc --noEmit与vite build等价构建成功。该构建之后仅修订行程常量并通过对应媒体用例，未重复构建。
