# Cinematic material layers v4

Generated with the built-in image_gen tool on 2026-11-12. Complete prompts, source image hashes, exact source rectangles and final hashes are retained in manifest.json, root-sources.json and props-sources.json. No external artist images or film stills were used; references were previously generated, approved project effects. Character portrait art and avatar directories are outside this revision.

The material source and the animation are distinct: props are separated image layers; image placement and motion are determined by private-prop-motion.ts / public-motion.ts. The butler uses one neutral painting, deterministic waist/neck/forearm skinning and a 24-pose atlas; rising reverses the same poses, lower limbs remain fixed. Source material pose bindings are measured on the actual neutral image, not inherited from the old optical-flow sheet. butler-motion.json records the exact shared pose coordinates, source hash and canvas bounds.

Rebuild root layers with `node scripts/prepare-motion-assets.mjs <explicit-source-spec.json>`; source-spec rows are reconstructable from each manifest sourceRect/prompt/source filename. Rebuild butler with `python scripts/build-butler-rig.py <source-neutral.png> --review <review-dir> --vendor <numpy-opencv-dir>`. Review exports use the same React SVG components via renderToStaticMarkup and sharp, with only embedded WebP converted to PNG for librsvg compatibility; they do not open a browser.

Original PNGs and rejected candidates remain in the operator's generated-images cache/work directory. The first poison layer candidate was rejected for pale glass fill; the corrected material has a transparent inner cavity. The old body-motion sheet is preserved in v3 but no longer used by ButlerBow. Atlas isolation rectangles prevent blade/rifle/cloth packing contamination.

Runtime: 29 WebP files, 2658256 bytes. Every file is bounded and alpha-preserving; the largest decoded asset is the butler atlas at 13.13 MiB, loaded only for that scene. No data or server schema migration.
