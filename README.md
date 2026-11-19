# 鸦钟夜话 · Ravens Night

手机多人社交推理游戏。正式环境与发布事实见[统一部署记录](docs/unified-deployment.md)，开发进展见[阶段记录](docs/2026-09-27-redesign.md)。HTTP/WS协议7、房间快照5／6、当前公开演出时序4；新提名20＋8秒统一截止，旧在途票保留原逐席时钟。

## 换一台电脑继续开发

安装 Node.js 24、pnpm 11.25.0 和 Git，拉取 main：

```sh
git clone git@github.com:Max0314/ravens-night.git
cd ravens-night
pnpm install --frozen-lockfile
pnpm build
```

前端开发：`pnpm --filter @ravens/web dev`。后端打包：`pnpm --filter @ravens/server build`，运行：`node apps/server/dist/index.cjs`，默认端口3000。按实际环境配置环境变量；使用PostgreSQL或Fribench账号时参考`.env.example`与统一部署记录，真实环境配置在各机器安全获取，不在Git中。检查使用`pnpm typecheck`，测试按改动选择现有Vitest用例；声音目录另有`node --test scripts/audio-audition*.test.mjs`。

试卖模式在应用服务端设置 `ROOM_CREATE_PASSCODE`，并让 `ACCESS_PASSWORD` 为空。已登录 Fribench 的房主可直接建房。游客点「创建房间」时先验证开房口令，验证通过后才进入创建页，受邀朋友凭房间邀请码以游客身份加入。游客可在「我的钟楼」或大厅本人资料查看和复制曾输入并保存的口令，旧版浏览器资格可继续使用并重新验码补存。授权无业务到期和次数限制，浏览器凭据最长按 400 天保存并续存。换码后原有资格和房间仍可使用，已保存的旧码会明确标记。清除凭据、换浏览器或更换签名密钥后需要重新验码。

创建默认 7 人，左右拖动人数滚轮切换 5–12 人，阵容四个数字可上下拖动。「恢复默认」复原当前人数模板，配置达标后才能开房。基础构成遵循相同的发牌校验，男爵仍会调整实际发牌。

首页快速连点三次游戏标题可切换调试模式。在此模式创建的房间会补齐已准备的人机。大厅座位上方可直接进入「动画演示」和「音频试听」，点击本人头像可选角色或关闭房间退出调试。普通大厅没有预览入口。预览使用当次独立音量，常规游戏和投屏设置保存在各自设备。各页面由音符打开同一设置面板，局内可切换私密操作音效。

## 已保存的素材和编辑入口

- 从游戏导航「城镇」右侧的「角色表」打开四类共 22 条公开能力速查。分类栏固定，详情先显示大图，再显示能力与规则。返回时保留原分类和滚动位置。[局内角色速查图标及原件](artifacts/role-icons-2026-11-18/README.md)

- 开房机械边框、滚轮数字、钟楼室内背景和界面录音可从原件重建。[素材、来源及重建命令](artifacts/room-counter-2026-11-19/README.md)

- [声音候选原件、说明与分析](artifacts/audio-candidates-2026-11-12/README.md)：55份完整编号文件，来源/许可与分析工具脚本均在目录中。移动试听副本位于`apps/web/public/audio-candidates/2026-11-12-v1/`；生成脚本`python scripts/build-audition-assets.py`，需FFmpeg/ffprobe。
- [角色B版及选定稿](artifacts/character-production-b-2026-11-12/README.md)：投毒者、猩红女郎原件在approved；[间谍/处女修订原件](artifacts/character-production-b-revisions-2026-11-12/README.md)在originals。共用引用在`apps/web/src/role-art.ts`，旧A/B原图保留。
- 送葬者与僧侣修订保存了新面容与完整道具。手册小图统一使用暗金内嵌圆拱。游玩中点击自己的身份打开单独设计的铜边角色卡。 [立绘原件](artifacts/character-production-b-faces-2026-11-13/README.md) · [圆拱框](apps/web/public/assets/ravens/role-type-frames-v5/arch.svg) · [历史圆拱框](artifacts/role-type-frames-v4-2026-11-13/README.md)
- [演出动作及审查帧](artifacts/cinematic-motion-2026-11-12/README.md)：sources内已补存17张v4生成原图、Kenney原始CC0包与SHA索引，不依赖原电脑生成缓存。根图层裁切配置为sources/root-source-spec.json，可在仓库根运行`node scripts/prepare-motion-assets.mjs artifacts/cinematic-motion-2026-11-12/sources/root-source-spec.json`。v4声音可用`python scripts/build-cinematic-audio.py artifacts/cinematic-motion-2026-11-12/sources`重建（FFmpeg及NumPy）；管家蒙皮脚本另需Pillow、NumPy、OpenCV，参数见脚本说明。
- `.tmp-ravens-art-20260807/`保留历史界面参考图；`.claude/launch.json`为项目启动配置。两者均随本轮交付保存，历史概念图不表示当前页面实现。

音频分析的CLAP模型及Python环境重建方法见候选包TOOLING.md；模型权重、node_modules、构建缓存和本机环境通过对应安装步骤恢复，不是源码素材。

局内分阶段配乐入口为`GameScoreOwner`，选曲规则在`game-score.ts`；`python scripts/build-game-score.py`从仓库已保存候选原件重建`apps/web/public/audio/music/v2`。来源、许可、裁切起点与产物哈希见该目录`SOURCES.md`及`manifest.json`，运行菜单提供署名页。完整背景乐流式播放，私密情报配乐只解码短片段；是否已上线以统一部署记录为准。

[精细道具分层源](artifacts/cinematic-motion-2026-11-12/sources/role-detail-v8/README.md)包含44个运行层、38份生成原件及完整提示词、锚点合同和重建参数；`build-assets.py --group`可分别重建10组，需Pillow，斜棺另需NumPy。22角色的动作对照与实际组件离线关键帧见演出记录；运行图、音轨及所有编辑原件均随Git保存。

## 线上查看

- 游戏：<https://clocktower.fribench.cn>
- 动画及声音试听：单人调试大厅座位上方的「动画演示」和「音频试听」。旧试听地址也会进入这个权限流程。
- 角色图鉴：<https://clocktower.fribench.cn/?preview=portraits>

正式发布只更新本游戏服务，遵守Fribench最新规范与全局发布锁。当前操作者已允许本地页面验证；按实际风险使用代码、媒体文件、定向用例和浏览器检查。桌面模拟不代替手机微信真机验收。

首页标题快速三击可进入动效调试；仅展示当前版本，顶部声音与音量可在播放中调整，不修改正式房间的私密声音模式。最新发布范围和手机待验收项以统一部署记录为准。
