import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { icons } from '../artifacts/role-icons-2026-11-18/draw-originals.mjs';

const archive = new URL('../artifacts/role-icons-2026-11-18/', import.meta.url);
const source = new URL('originals/', archive);
const runtime = new URL('../apps/web/public/assets/ravens/role-icons-v1/', import.meta.url);
const ids = Object.keys(icons);
const assets = await readdir(source);
if (ids.length !== 22 || assets.length !== ids.length || ids.some(id => !assets.includes(`${id}.png`))) {
  throw new Error('Expected one PNG original for each of the 22 role icons');
}

await mkdir(runtime, { recursive: true });
const seen = new Set();
const tiles = [];
const labels = [];
const cellWidth = 168;
const cellHeight = 98;
const width = cellWidth * 6;
const height = 42 + cellHeight * 4;
let totalBytes = 0;
for (const [index,id] of ids.entries()) {
  const image = sharp(fileURLToPath(new URL(`${id}.png`, source)));
  const meta = await image.metadata();
  if (meta.width !== 256 || meta.height !== 256 || !meta.hasAlpha) throw new Error(`Invalid original: ${id}`);
  const resized = image.resize(96,96);
  let encoded = await resized.clone().webp({ lossless: true }).toBuffer();
  if (encoded.length > 8 * 1024) encoded = await resized.clone().webp({ quality: 82, alphaQuality: 100 }).toBuffer();
  totalBytes += encoded.length;
  if (encoded.length > 8 * 1024) throw new Error(`Icon exceeds 8 KiB: ${id}`);
  const runtimeImage = sharp(encoded);
  const outputMeta = await runtimeImage.metadata();
  if (outputMeta.width !== 96 || outputMeta.height !== 96 || !outputMeta.hasAlpha) throw new Error(`Invalid output: ${id}`);
  const hash = createHash('sha256').update(encoded).digest('hex');
  if (seen.has(hash)) throw new Error(`Duplicate icon output: ${id}`);
  seen.add(hash);
  await writeFile(new URL(`${id}.webp`,runtime),encoded);

  const left = (index % 6) * cellWidth + 9;
  const top = 42 + Math.floor(index / 6) * cellHeight;
  labels.push(`<rect x="${left}" y="${top}" width="150" height="86" rx="8" fill="#1c1813" stroke="#493820"/>
    <text x="${left+75}" y="${top+72}" text-anchor="middle">${id.replaceAll('_',' ')}</text>`);
  for (const [size,x,gray] of [[24,8,false],[32,35,false],[48,68,false],[32,118,true]]) {
    let sample = runtimeImage.clone().resize(size,size);
    if (gray) sample = sample.grayscale();
    tiles.push({ input: await sample.png().toBuffer(), left:left+x, top:top+9+Math.floor((48-size)/2) });
  }
}
if (totalBytes > 132 * 1024) throw new Error(`Role icon set exceeds 132 KiB: ${totalBytes}`);

const board = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#12100e"/>
  <g fill="#e9d5ad" font-family="sans-serif" font-size="12">
    <text x="16" y="26" font-size="15">Ravens Night · Role icons · 24 / 32 / 48 px + 32 px grayscale</text>
    ${labels.join('')}
  </g></svg>`);
await sharp(board).composite(tiles).png().toFile(fileURLToPath(new URL('contact-sheet.png',archive)));
console.log(`${ids.length} original role icons, ${totalBytes} WebP bytes, 96×96 with alpha`);
