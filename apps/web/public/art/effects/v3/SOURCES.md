# 精细演出素材 v3

2026-11-12 使用内置 `image_gen` 生成原创栅格插画，统一为写实绘制的哥特道具、黑金材质与低照度场景。延续已获认可的 v1 小恶魔画风；血迹明显，不展示断肢或器官。`manifest.json` 记录每张生成图的提示词、原图 SHA、尺寸，以及发布 WebP/图集切片 SHA。

| 分类 | 素材及用途 |
| --- | --- |
| 角色道具 | washerwoman、librarian、investigator、chef、empath、fortune_teller、undertaker、monk、ravenkeeper、virgin、slayer、soldier、mayor、drunk、recluse、saint、poisoner、spy、scarlet_woman、baron；22角色的另外两位分别用完整管家帧图和保留的 v1 小恶魔 |
| 可独立运动部件 | 厨师案板/刀、洗衣妇木盆/布、断头台框架/刀刃；不把整个静物当作活动部件旋转 |
| 恶魔与结果 | 左右全屏爪痕、左右目标头像爪痕、黎明头像小爪痕、城镇已公布夜死标记；imp-defeated 用于原恶魔无继任者信息的延续、恶魔被击败分支 |
| 毒药 | 对称绿玻璃毒瓶；单泡、泡群、爆泡、细烟、毒云、腐蚀边缘，按空间和强度分层 |
| 血迹 | 左/右定向喷溅、放射喷溅、残留血迹；公开血层只随已公布的死亡结果展示 |
| 玻璃 | 弹孔、碎渣云、单碎片、细碎片；与程序不规则裂纹共用同一坐标，保留真实可见 UI 的局部折射 |
| 环境 | 同一城镇构图的 scene-night / scene-dawn，分别用于入夜/天亮；sealed-letter 用于公开提名及本人首夜信息 |
| 管家 | 生成完整人物关键姿态，脚锚对齐，光流插帧，56帧 8×7、单格256×448；无隐藏腿脚、无整片站姿旋转。保持原My lord音轨及868ms低头停留 |

构建：`node scripts/prepare-premium-art.mjs <外部原图清单.json>`；清单每项 `{id,source,prompt}`。随后 `python scripts/build-premium-butler.py <butler原始4×4图.png> <外部审阅目录>`。原始PNG与GIF审阅件保存在操作者素材缓存，发布仓库只保留WebP、生成/加工清单及脚本。构建工具 sharp 0.35.5、Pillow、numpy 2.5.4、opencv-python-headless 5.0.0.93；后二者只用于外部素材加工，不增加Web运行时依赖。

图集保留为素材原版，运行时按需读取独立切片。管家 `butler-motion.json` 表明它是生成姿态与光流插值，不声称骨骼长度严格不变；像素检查覆盖脚底锚和边缘裁剪。背景为全幅场景，其余透明图保留alpha。首次断头台生成图的半透明白底版本已弃用，清单采用重新编辑的透明框架。

旧v1/v2素材与绞刑架源码保留；未启用绞刑架。昼夜、枪击、死亡等图像不增加规则推断或提前公开信息。
