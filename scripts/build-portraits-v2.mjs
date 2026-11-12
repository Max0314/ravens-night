import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ROLE_CATALOG } from "../packages/game-engine/src/roles/catalog.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(root, "artifacts/character-production-b-2026-11-12/originals");
const outputRoot = path.join(root, "apps/web/public/assets/ravens/portraits-b-v2");
const portraits = [];
await fs.mkdir(outputRoot, { recursive: true });
for (const role of ROLE_CATALOG) {
  const original = await fs.readFile(path.join(sourceRoot, `${role.id}.png`));
  const metadata = await sharp(original).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 960 || metadata.width * 4 !== metadata.height * 3) {
    throw new Error(`Expected a 3:4 portrait at least 960px wide: ${role.id}`);
  }
  const variants = [];
  for (const [suffix, width, quality] of [["", 960, 88], ["-small", 240, 80]]) {
    const file = `${role.id}${suffix}.webp`;
    // Delivery encoding only. Keep all artwork: no cropping, framing or recolouring.
    const result = await sharp(original).rotate().resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 6 }).toFile(path.join(outputRoot, file));
    if (result.width !== width || result.height !== width * 4 / 3) throw new Error(`Invalid output: ${file}`);
    variants.push({ file, width: result.width, height: result.height, bytes: result.size });
  }
  portraits.push({
    id: role.id, name: role.name,
    sourceSha256: createHash("sha256").update(original).digest("hex"),
    sourceWidth: metadata.width, sourceHeight: metadata.height, variants,
  });
}
if (portraits.length !== 22) throw new Error("The B collection requires all 22 roles");
await fs.copyFile(
  path.join(root, "apps/web/public/assets/ravens/portraits-a-v1/concealed.svg"),
  path.join(outputRoot, "concealed.svg"),
);
const manifest = {
  collection: "gothic-b-v2", selectedAt: "2026-11-12", generator: "built-in image_gen",
  encoder: `sharp ${sharp.versions.sharp}`, complete: true, border: false, portraits,
};
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({
  portraits: portraits.length,
  fullBytes: portraits.reduce((n, p) => n + p.variants[0].bytes, 0),
  thumbnailBytes: portraits.reduce((n, p) => n + p.variants[1].bytes, 0),
}));
