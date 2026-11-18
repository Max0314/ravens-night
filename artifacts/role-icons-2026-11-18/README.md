# 鸦钟夜话角色速查图标

22 枚暗铜图标为本项目按角色道具绘制。每个角色的图样及容易混淆的配对见[实施方案](../../docs/superpowers/plans/2026-11-18-in-game-role-reference.md#4-原创角色图标)。画面以明亮外沿、较宽的刻痕与独立负形保证缩小后的辨识度，猩红女郎的披风使用暗红里衬。

- `draw-originals.mjs` 保存原创图样，可用 `node artifacts/role-icons-2026-11-18/draw-originals.mjs` 重绘 256×256 透明 PNG。
- `originals/` 保存 22 份 PNG，按角色目录的 ID 命名。
- `node scripts/build-role-icons.mjs` 通过仓库已有 Sharp 生成 [96×96 透明 WebP](../../apps/web/public/assets/ravens/role-icons-v1/) 和 [尺寸对照板](contact-sheet.png)。对照板从实际运行图缩放，依次显示 24、32、48px 和 32px 灰度样本。

当前运行资源合计 117,304 字节。构建会检查 22 份原件、运行图尺寸和透明通道、重复编码内容，以及单图 8 KiB 和全套 132 KiB 的上限。
