# A版独立透明历史边框

2026-11-13 根据 A版 `collection-preview.png` 与22张原图逐张盘点，经独立review，去重为 **3种结构**。不按阵营或角色数量强行分类。人物遮住的拱线、底边及绘画磨损差异不另分一类；本批为使用内置 `image_gen` 的完整重绘，补全被遮挡的部分，并非从原图逐像素抠取。

| ID | 结构 | 原A版角色 |
|---|---|---|
| `lancet-square` | 双尖窗角板、三叶镂饰、柱式侧轨、直角直底 | washerwoman、librarian、fortune_teller、undertaker、virgin、recluse、scarlet_woman |
| `fleur-rounded` | 百合长矛及斜枝上角饰、下方百合卷叶圆弧角板 | chef、monk、mayor、ravenkeeper、baron |
| `leaf-rounded` | 镂空三叶/叶枪上角饰、下方卷草与三叶花圆弧角板 | investigator、empath、slayer、butler、drunk、saint、poisoner、spy、imp、soldier |

三类分别以图书管理员、男爵、调查员旧图的框为直接设计参考，保持暗金/黑铜材质、细密刻纹及哥特尖拱；保留完整连续拱顶和底框。该映射记录历史结构来源，**不要求前端按角色固定选框，也不表示角色阵营**。

## 交付文件

- `originals/<id>.png`：3张1086×1448 RGBA生成原图。
- `final-prompts.json`：完整提示词、参考原角色图及22角色结构归类。
- `a-source-inventory.jpg`：22张旧图离线拼图，仅用于结构核对。
- `frame-samples.png`：上排透明棋盘示例、下排与当前人物离线合成；棋盘仅在此样例中绘制，正式资产不含棋盘。不是网页截图或手机验收。
- `apps/web/public/assets/ravens/frames-a-v1/<id>.png` 及同名 `.webp`：3对960×1280、3:4运行资产，PNG和无损WebP的alpha及所有可见像素一致，完全透明像素的隐藏RGB由WebP编码器优化。中心空、保留透明通道。
- 运行目录 `manifest.json`：每类对应原图、22张历史原图SHA256、生成原件SHA256/尺寸、6个交付文件SHA256/体积，以及透明度检查事实。

重建导出：`node artifacts/independent-frames-2026-11-13/build-assets.mjs`，使用仓库既有sharp。重建离线样例：`python artifacts/independent-frames-2026-11-13/build-samples.py`，需Pillow，并使用当前两新版人物及已选间谍。两脚本均不打开浏览器。导出只等比缩放、编码，不裁切、改色或重绘；保留生成的alpha，不用阈值抠图替换生成结果。

## 接入与核对

这是独立边框资产包，本提交不接入页面，不改首页、手册、全局CSS或任何组件。由整合/手册会话选择使用。在3:4容器里叠加一张框；框自带尖拱、角花、侧边和底边，避免同时保留另一层装饰性CSS框。人物图与框为独立文件，人物原图不烘焙此框。图层中心应保持人物可见；样例脚本以中心连通透明区裁出人物，展示实际框内开口，不要求页面照搬样例实现。

RGBA中心像素alpha=0；源图中央区域（横向15%–85%、纵向32%–90%）alpha最大为1/255，为生成的极低透明残值，未再涂改。透明棋盘样例已核对中心无场景、无人物残留，四边/拱顶/底角完整且没有画布裁断。全部22个历史角色恰好归类一次，6个运行文件的尺寸、alpha和PNG/WebP可见像素一致性已核对；独立review检查结构与来源映射。旧A/B人物和历史URL没有覆盖。

不恢复城镇死者装饰框，不涉及玩家头像、演出道具、公共协议或运行依赖。共享阶段/发布文档由整合会话记录；本包尚未部署，也未进行浏览器或实际手机验收。
