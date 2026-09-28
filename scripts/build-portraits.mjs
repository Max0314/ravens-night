import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ROLE_CATALOG } from "../packages/game-engine/src/roles/catalog.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(root, "artifacts/character-production-a-2026-09-29/originals");
const outputRoot = path.join(root, "apps/web/public/assets/ravens/portraits-a-v1");
const partial = process.argv.includes("--partial");
await fs.mkdir(outputRoot, { recursive: true });
const portraits = [];
for (const role of ROLE_CATALOG) {
  const source = path.join(sourceRoot, `${role.id}.png`);
  let original;
  try { original = await fs.readFile(source); }
  catch (error) { if (partial && error.code === "ENOENT") continue; throw error; }
  const metadata = await sharp(original).metadata();
  if (!metadata.width || !metadata.height || Math.abs(metadata.width / metadata.height - .75) > .025) throw new Error(`Portrait must use a 3:4 composition: ${role.id}`);
  if (metadata.width < 960) throw new Error(`Portrait source is too small: ${role.id}`);
  const variants = [];
  for (const [suffix, width, quality] of [["", 960, 88], ["-small", 240, 80]]) {
    const file = `${role.id}${suffix}.webp`;
    // Delivery encoding only: keep the entire selected painting, with no crop,
    // recolour, background removal, compositing, or alteration of its artwork.
    const result = await sharp(original).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(path.join(outputRoot, file));
    variants.push({ file, width: result.width, height: result.height, bytes: result.size });
  }
  portraits.push({ id: role.id, name: role.name, sourceSha256: createHash("sha256").update(original).digest("hex"), sourceWidth: metadata.width, sourceHeight: metadata.height, variants });
}
if (!partial && portraits.length !== 22) throw new Error("The A collection must contain all 22 roles");
const manifest = { collection: "gothic-a-v1", selectedAt: "2026-09-29", encoder: `sharp ${sharp.versions.sharp}`, complete: portraits.length === 22, portraits };
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ portraits: portraits.length, bytes: portraits.reduce((sum, role) => sum + role.variants.reduce((n, variant) => n + variant.bytes, 0), 0) }));
