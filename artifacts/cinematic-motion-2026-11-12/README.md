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
