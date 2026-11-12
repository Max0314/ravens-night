import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ROLE_CATALOG } from "../packages/game-engine/src/roles/catalog.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(root, "artifacts/character-production-b-2026-11-12/originals");
const outputRoot = path.join(root, "apps/web/public/assets/ravens/portraits-b-v2");
const selectedRole = process.argv[2]?.match(/^--role=([a-z_]+)$/)?.[1];
if (process.argv.length > 2 && (process.argv.length !== 3 || !ROLE_CATALOG.some(role => role.id === selectedRole))) {
  throw new Error("Usage: node scripts/build-portraits-v2.mjs [--role=<role-id>]");
}
const previousManifest = selectedRole ? JSON.parse(await fs.readFile(path.join(outputRoot, "manifest.json"), "utf8")) : null;
const portraits = previousManifest?.portraits ?? [];
await fs.mkdir(outputRoot, { recursive: true });
for (const role of ROLE_CATALOG) {
  if (selectedRole && role.id !== selectedRole) continue;
  const approved = role.id === "poisoner";
  const sourceFile = approved
    ? path.join(root, "artifacts/character-production-b-2026-11-12/approved/poisoner-20261112.jpg")
    : path.join(sourceRoot, `${role.id}.png`);
  const original = await fs.readFile(sourceFile);
  const metadata = await sharp(original).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 960 || (!approved && metadata.width * 4 !== metadata.height * 3)) {
    throw new Error(`Expected a 3:4 portrait at least 960px wide: ${role.id}`);
  }
  const variants = [];
  for (const [suffix, width, quality] of [["", 960, 88], ["-small", 240, 80]]) {
    const file = `${approved ? "poisoner-approved-20261112" : role.id}${suffix}.webp`;
    // Delivery encoding only. Keep all artwork: no cropping, framing or recolouring.
    const result = await sharp(original).rotate().resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: 6 }).toFile(path.join(outputRoot, file));
    if (result.width !== width || result.height !== Math.round(width * metadata.height / metadata.width)) throw new Error(`Invalid output: ${file}`);
    variants.push({ file, width: result.width, height: result.height, bytes: result.size });
  }
  const portrait = {
    id: role.id, name: role.name,
    ...(approved ? { sourceFile: path.relative(root, sourceFile).replaceAll("\\", "/"), source: "user-selected attachment", selectedAt: "2026-11-12" } : {}),
    sourceSha256: createHash("sha256").update(original).digest("hex"),
    sourceWidth: metadata.width, sourceHeight: metadata.height, variants,
  };
  const index = portraits.findIndex(item => item.id === role.id);
  if (index === -1) portraits.push(portrait);
  else portraits[index] = portrait;
}
if (portraits.length !== 22) throw new Error("The B collection requires all 22 roles");
if (!selectedRole) await fs.copyFile(
  path.join(root, "apps/web/public/assets/ravens/portraits-a-v1/concealed.svg"),
  path.join(outputRoot, "concealed.svg"),
);
const manifest = previousManifest ?? {
  collection: "gothic-b-v2", selectedAt: "2026-11-12", generator: "built-in image_gen",
  encoder: `sharp ${sharp.versions.sharp}`, complete: true, border: false, portraits,
};
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({
  portraits: portraits.length,
  fullBytes: portraits.reduce((n, p) => n + p.variants[0].bytes, 0),
  thumbnailBytes: portraits.reduce((n, p) => n + p.variants[1].bytes, 0),
}));
