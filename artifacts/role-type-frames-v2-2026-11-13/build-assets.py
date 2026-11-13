"""Export immutable v2 frames and offline samples. Requires Pillow; no browser."""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'apps/web/public/assets/ravens/role-type-frames-v2'
OUT.mkdir(parents=True, exist_ok=True)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
spec = json.loads((HERE / 'final-prompts.json').read_text(encoding='utf-8'))
portraits = ['portraits-b-v4/monk.webp', 'portraits-b-v2/recluse.webp', 'portraits-b-v2/poisoner-approved-20261112.webp', 'portraits-b-v2/imp.webp']
public = ROOT / 'apps/web/public/assets/ravens'
sheet = Image.new('RGB', (960, 534), '#342a1b')
draw = ImageDraw.Draw(sheet)
frames = []
for column, item in enumerate(spec['frames']):
    source = HERE / item['source']
    image = Image.open(source).convert('RGBA')
    w, h = image.size
    assert w >= 960 and w * 4 == h * 3, item['id']
    alpha = image.getchannel('A')
    assert alpha.getpixel((w // 2, h // 2)) == 0, item['id']
    central = alpha.crop((int(w * .15), int(h * .33), int(w * .85), int(h * .90)))
    assert central.getextrema()[1] <= 1, item['id'] + ': unexpected paint in aperture'
    visible_bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    assert visible_bbox and visible_bbox[0] > 3 and visible_bbox[1] > 3 and visible_bbox[2] < w - 3 and visible_bbox[3] < h - 3, item['id'] + ': visible frame touches canvas'
    variants = []
    for suffix, size in [('', (960, 1280)), ('-small', (240, 320))]:
        name = item['id'] + suffix + '.webp'
        target = OUT / name
        image.resize(size, Image.Resampling.LANCZOS).save(target, format='WEBP', lossless=True, method=6)
        variants.append({'file': name, 'width': size[0], 'height': size[1], 'bytes': target.stat().st_size, 'sha256': sha(target), 'encoding': 'lossless WebP; full-image proportional downscale; original alpha retained'})
    small = Image.open(OUT / (item['id'] + '-small.webp')).convert('RGBA')
    sheet.paste(small, (column * 240, 22), small)
    draw.text((column * 240 + 6, 5), item['type'] + ' | 240px', fill='#f3ddb2')
    # Derive a connected aperture mask only for this offline portrait sample.
    region = alpha.point(lambda value: 0 if value <= 8 else 255)
    ImageDraw.floodfill(region, (w // 2, h // 2), 128, thresh=0)
    mask = region.point(lambda value: 255 if value == 128 else 0)
    assert not any(mask.getpixel(point) for point in [(0, h // 2), (w - 1, h // 2), (w // 2, 0), (w // 2, h - 1)]), item['id'] + ': aperture leaks'
    mask = ImageChops.multiply(mask.filter(ImageFilter.MaxFilter(3)), ImageChops.invert(alpha))
    portrait = Image.open(public / portraits[column]).convert('RGBA').resize((w, h), Image.Resampling.LANCZOS)
    portrait.putalpha(mask)
    composite = Image.new('RGBA', (w, h), '#342a1b')
    composite = Image.alpha_composite(Image.alpha_composite(composite, portrait), image)
    composite.thumbnail((120, 160), Image.Resampling.LANCZOS)
    bare = small.resize((120, 160), Image.Resampling.LANCZOS)
    sheet.paste(bare, (column * 240, 367), bare)
    sheet.paste(composite.convert('RGB'), (column * 240 + 120, 367))
    draw.text((column * 240 + 6, 350), '120px bare / composite', fill='#f3ddb2')
    frames.append({'id': item['id'], 'type': item['type'], 'source': str(source.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source), 'sourceWidth': w, 'sourceHeight': h, 'sourceCentreAlpha': 0, 'sourceCentralMaxAlpha': central.getextrema()[1], 'sourceVisibleAlphaAbove8Bounds': visible_bbox, 'variants': variants})
sheet.save(HERE / 'offline-preview.png')
manifest = {'collection': 'role-type-frames-v2', 'createdAt': '2026-11-13', 'tool': 'built-in image_gen', 'usage': 'Role index thumbnails only. No home/detail/own-card integration in this asset delivery.', 'thumbnailDecision': 'Reuse existing 240x320 size; Guide caps actual frame width at 120 CSS px, at least 2x. No extra middle-size tier.', 'design': 'Soft rounded/beveled outer corners and arch shoulders; distinct category motifs in BOTH upper corner panels and side rails; unified aged gold/black bronze.', 'frames': frames}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'frames': 4, 'runtimeImages': 8, 'sizes': ['960x1280', '240x320']}))
