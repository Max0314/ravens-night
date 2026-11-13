"""Four raster crests on one unchanged raster frame. Requires Pillow."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'apps/web/public/assets/ravens/role-type-frames-v1'
BASE = ROOT / 'artifacts/independent-frames-2026-11-13/originals/fleur-rounded.png'
OUT.mkdir(parents=True, exist_ok=True)
(HERE / 'originals').mkdir(exist_ok=True)
base = Image.open(BASE).convert('RGBA')
width, height = base.size
sheet = Image.new('RGB', (960, 352), '#162027')
frames = []
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
for column, frame in enumerate(json.loads((HERE / 'final-prompts.json').read_text(encoding='utf-8'))['frames']):
    crest_path = HERE / 'crests' / (frame['id'] + '.png')
    crest = Image.open(crest_path).convert('RGBA')
    crest.thumbnail((round(width * .58), round(height * .09)), Image.Resampling.LANCZOS)
    result = base.copy()
    result.alpha_composite(crest, ((width - crest.width) // 2, 6))
    # Small matching reliefs remain on the side rails, outside the face aperture.
    side = Image.open(crest_path).convert('RGBA')
    side.thumbnail((round(width * .065), round(height * .024)), Image.Resampling.LANCZOS)
    for right in [False, True]:
        ornament = side.rotate(-90 if right else 90, expand=True)
        center = round(width * (.955 if right else .045))
        result.alpha_composite(ornament, (center - ornament.width // 2, round(height * .55)))
    original = HERE / 'originals' / (frame['id'] + '.png')
    result.save(original)
    variants = []
    for suffix, size, fmt in [('', (960, 1280), 'PNG'), ('', (960, 1280), 'WEBP'), ('-small', (240, 320), 'WEBP')]:
        name = frame['id'] + suffix + ('.png' if fmt == 'PNG' else '.webp')
        target = OUT / name
        result.resize(size, Image.Resampling.LANCZOS).save(target, format=fmt, **({'lossless': True, 'method': 6} if fmt == 'WEBP' else {}))
        variants.append({'file': name, 'width': size[0], 'height': size[1], 'bytes': target.stat().st_size, 'sha256': sha(target)})
    sample = Image.open(OUT / (frame['id'] + '-small.webp')).convert('RGBA')
    sheet.paste(sample, (column * 240, 26), sample)
    ImageDraw.Draw(sheet).text((column * 240 + 10, 6), frame['type'], fill='#e5c58c')
    frames.append({'id': frame['id'], 'type': frame['type'], 'crest': 'crests/' + crest_path.name, 'crestSha256': sha(crest_path), 'source': 'originals/' + original.name, 'sourceSha256': sha(original), 'variants': variants})
sheet.save(HERE / 'thumbnail-preview.png')
(OUT / 'manifest.json').write_text(json.dumps({'collection': 'role-type-frames-v1', 'createdAt': '2026-11-13', 'base': str(BASE.relative_to(ROOT)).replace('\\', '/'), 'baseSha256': sha(BASE), 'composition': 'Same base, dimensions, gold and rail thickness; four imagegen crests at top and small repeats on side rails. No hue-based taxonomy.', 'frames': frames}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'frames': 4, 'runtimeImages': 12}))
