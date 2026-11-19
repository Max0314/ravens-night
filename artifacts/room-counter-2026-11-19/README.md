# 开房滚轮与钟楼设置素材

在仓库根目录运行 `python artifacts/room-counter-2026-11-19/build.py`，需要 Pillow、NumPy 和 FFmpeg。脚本生成 `apps/web/public/assets/ravens/room-counter-v1/` 内的图像和 `apps/web/public/audio/effects/v10/` 内的六段音效及来源清单。数字图集为 5 列 × 2 行，顺序为 0–9。

## 录音原件

- `ratchet-screwdriver-source.mp3` 为 InspectorJ（Jonathan Shaw）发布的录音试听版。截取三次齿扣，与人数及阵容滚轮过档同步。 [原录音](https://freesound.org/people/InspectorJ/sounds/393490/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- `trackpad-source.mp3` 为 Joseph SARDIN 的触控板录音，用于按钮轻触和档位切换。 [原录音](https://bigsoundbank.com/macbook-trackpad-simple-click-s1740.html) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- `switch-source.mp3` 为 DavidGreck 的机械开关录音。截取两次按击，分别用于打开和收起面板。 [原录音](https://bigsoundbank.com/switch-5-s0321.html) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

## 图像原件与生成提示词

以下 PNG 使用 Codex 内置 ImageGen 生成。运行版压缩为 WebP，背景同时用于声音设置和「我的钟楼」。

### counter-frame-source.png

Use case: product-mockup, game UI raster asset. Generate one entirely isolated extremely wide horizontal border for a compact Victorian gothic mechanical number counter in an elegant dark town clocktower game. The canvas is landscape. Straight-on orthographic. The component should be centered and about five times as wide as it is tall. Outer rail edged with fine double antique bronze wire, darkened recessed warm black iron, restrained hand-engraved line details at the four corners, two small end-pieces with square rivets and hints of clockwork teeth. Only the left and right ends have material mass. Long straight extremely thin central top and bottom edges. Large empty transparent rectangular center from about 13 percent to 87 percent of the total width, intended for HTML numbers and controls. The aperture and the outside canvas are both truly transparent alpha. Precise bilateral symmetry and straight rails, level on pixel grid, low metallic luster, weathered dark blackened-bronze patina; muted amber rim light. Reads crisp and refined at a 320px rendered width. No text, numerals, symbols, labels, ornamental center crest, buttons, people, detached bits, smoke, or background. Edges use subtly clipped corners instead of complicated silhouettes. Maximize the horizontal length within the canvas.

### counter-digits-source.png

Use case: logo-brand glyph sheet, isolated production game asset on a genuinely transparent canvas. Ten large meticulously engraved Victorian clockmaker Arabic numerals in EXACT order in a rigid five-column two-row grid. Top row reads exactly 0 1 2 3 4. Bottom row reads exactly 5 6 7 8 9. Digit centers at 10%, 30%, 50%, 70%, 90% of canvas width in both rows. Equal ink size, equal spacing, fronts straight-on. Numbers only. A small pointy calligraphic terminal and slight stroke contrast, crisp easy-to-read silhouettes at 14 px, charcoal black ink and extremely restrained internal worn bronze pin highlights, dense dark ink so usable on aged cream paper. Expressive but legible 1 and 7, open 4, conventional 6 and 9. Keep ample transparent space between all ten separate numbers. No grids, borders, shadows outside the numeral silhouette, marks, background, type specimens, or other text. All ten isolated individual numbers on transparent alpha.

### settings-study-source.png

Create a wide landscape (3:2) cinematic raster background for a small settings dialog in an original gothic clocktower social deduction game, Ravens at Midnight. Quiet real medieval clocktower study, deeply dark warm charcoal, burnt umber and muted antique bronze, extremely subtle textured dark stone/plaster and old wood. Right edge and upper right only: aged brass gramophone and clock mechanism on a shelf, and a dim warm glancing light illuminating a segment of stone arch and brass details. Left half and the entire lower half almost empty dark softly textured negative space so Chinese labels read easily. Luxuriously restrained realistic game matte painting like interior art from atmospheric Victorian gothic painterly game. Dim but legible right-side silhouette, rich materials. No bright lights, no blue, no pop-up frame, no people, no text, no words, no symbols, no logo. Flat artwork to serve as a background, no UI.
