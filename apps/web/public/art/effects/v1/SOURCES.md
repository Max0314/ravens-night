# Ravens effects art v1

These three new illustrations were generated with the built-in imagegen tool
on 2026-11-12. Exact production prompts are in `prompts.json`; source and final
SHA256 values, dimensions and alpha checks are in `files.json`.

- `demon-wings.webp`: isolated frontal crimson-winged demon, 1600 × 800,
  transparent. Intended for private demon attacks and symbolic defeat during
  good victory. The runtime supplies wing movement, fragments and claw marks.
- `butler.webp`: isolated Victorian butler with hand over heart, 960 × 1440,
  transparent. The runtime animates the bow from the standing sprite.
- `evil-town.webp`: burning gothic town beneath an enormous demonic wing
  canopy, 941 × 1672, opaque. Intended as the evil victory background.

No existing role or homepage asset was replaced. Generated originals remain
under the operator's imagegen output directory; the game references only these
project-local WebP files. Images were inspected individually, without opening
a game page. Both transparent sprites retain visible subject pixels and fully
transparent background pixels; resizing kept their alpha channels.

To encode replacement originals without creative image edits:

```powershell
node scripts/prepare-effects-art.mjs demon.png butler.png evil-town.png
```

The script uses sharp for size-limited WebP encoding, validates alpha and writes
the final artifact manifest. Changes to the artwork itself use imagegen.
