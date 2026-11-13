# 四类同色角色金框

2026-11-13 用户确认的四类公开角色装饰：镇民小城楼与窗花；外来者羽叶与绳结；爪牙向内交缠荆棘；恶魔横展蝠翼与角冠。四者全部使用相同暖暗金色，以徽记轮廓区分，不通过改颜色区分。

底框统一使用上一批 `independent-frames-2026-11-13/originals/fleur-rounded.png`。内置 `image_gen` 分别生成四枚高细节透明金属徽记，完整提示词在 `final-prompts.json`，原徽记在 `crests/`；离线合成仅在同一底框顶部叠徽记、在侧轨加微小同款浮雕。底框轮廓、色泽、粗细不重新生成、不改色，中央脸区不放徽记。此前三类历史框及人物原图全部保留。

## 文件与重建

- `originals/{townsfolk,outsider,minion,demon}.png`：四套完整透明框，1086×1448 RGBA。
- `apps/web/public/assets/ravens/role-type-frames-v1/`：每类完整PNG及无损WebP各960×1280；`-small.webp`缩略档240×320，共12图。
- 运行目录 `manifest.json`：底框/徽记/完整原件及所有导出SHA256。`base`以仓库根解析；各项`crest`和`source`以本美术交付目录解析；`variants[].file`以运行素材目录解析。
- `thumbnail-preview.png`：240像素宽离线预览，供查看四类徽记区别；不是手机或页面截图。

重建：仓库根 `python artifacts/role-type-frames-2026-11-13/build-assets.py`，使用既有Pillow。生成过程不调用API、不打开浏览器。原绘画由内置imagegen完成，脚本只做等比缩放、透明图层合成与编码。

## 使用边界与验证

`role-art.ts` 的 `roleFrame(type)` 只接受公开分类TOWNSFOLK/OUTSIDER/MINION/DEMON，不通过玩家身份、座位或房间状态推断。`roleArt`仅对已知公开角色目录补充框引用，未知身份无分类框。首页角色轮播、手册图鉴及本人身份卡的展示叠层由下一批UI提交接入，名称继续在框外，不改变公开座位/玩家头像/城镇死亡标记。

已离线目视四徽记、四完整框及缩略预览，独立review无阻塞；核对12图尺寸、透明通道、中心空和四框中央区域与同一底框一致。实际手机审美与触摸留给用户人工验收，未使用有头/无头浏览器，未部署。共享阶段/发布记录由统筹会话维护。
