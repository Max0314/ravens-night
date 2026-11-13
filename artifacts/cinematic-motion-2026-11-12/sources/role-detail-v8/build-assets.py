"""Independent painted layers, explicit world rect placement and offline QA.

Uses Pillow. No live generation, browser, runtime component or game state.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUT = ROOT / 'apps/web/public/art/effects/v8'
contract = json.loads((HERE / 'contract.json').read_text(encoding='utf-8'))
parser = argparse.ArgumentParser()
parser.add_argument('--group', choices=list(contract['groups']), required=True)
args = parser.parse_args()
OUT.mkdir(parents=True, exist_ok=True)
(HERE / 'qa').mkdir(exist_ok=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest_path = OUT / 'role-detail-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'version': 8, 'world': contract['world'], 'generator': 'built-in image_gen', 'files': []}
images, rows = {}, []

def bounds(alpha, threshold):
    return alpha.point(lambda value: 255 if value > threshold else 0).getbbox()

def measure(image):
    a = image.getchannel('A')
    result = {'alphaAbove8Bounds': bounds(a, 8), 'alphaAbove128Bounds': bounds(a, 128)}
    result['opaqueVerticalSamples'] = {}
    for x in [100, 110, 135, 273, 300, 327, 465, 490, 499]:
        ys = [y for y in range(500) if a.getpixel((x, y)) > 128]
        result['opaqueVerticalSamples'][str(x)] = [min(ys), max(ys)] if ys else None
    return result

def save(image, row):
    target = OUT / (row['id'] + '.webp')
    image.save(target, format='WEBP', lossless=True, method=6)
    images[row['id']] = image
    rows.append({**row, 'file': target.name, 'url': contract['runtimeRoot'] + target.name, 'width': image.width, 'height': image.height, 'bytes': target.stat().st_size, 'sha256': sha(target), 'hasAlpha': True, 'measured': measure(image)})

for part in contract['groups'][args.group]['parts']:
    source = HERE / 'originals' / (part['id'] + '.png')
    prompt = HERE / 'prompts' / (part['id'] + '.txt')
    original = Image.open(source).convert('RGBA')
    visible = bounds(original.getchannel('A'), 8)
    assert visible, source
    crop = (max(0, visible[0] - 1), max(0, visible[1] - 1), min(original.width, visible[2] + 1), min(original.height, visible[3] + 1))
    x, y, w, h = part['targetRect']
    material = original.crop(crop).resize((w, h), Image.Resampling.LANCZOS)
    image = Image.new('RGBA', tuple(contract['world']))
    image.alpha_composite(material, (x, y))
    save(image, {'id': part['id'], 'group': args.group, 'targetRect': part['targetRect'], 'source': str(source.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source), 'sourceSize': original.size, 'sourceRect': crop, 'prompt': str(prompt.relative_to(ROOT)).replace('\\', '/'), 'processing': 'Only this independently generated part; explicit alpha bbox plus 1px source safety border; resample to agreed local material rect and place on the common 600x500 canvas. No triangle cut of a whole composite; no colour/alpha painting.'})

if args.group == 'envelope':
    # The motion owner explicitly requested two real pieces of the SAME wax.
    seal = images['envelope-seal']
    left, right = seal.copy(), seal.copy()
    left_a, right_a = seal.getchannel('A'), seal.getchannel('A')
    offsets = [0, -1.5, 1, -2, 1.5, -.7, 2.2, .3, -2.5, .8, 1.8, -.5, 0]
    for y in range(500):
        q = max(0, min(len(offsets) - 1.000001, (y - 298) / 54 * (len(offsets) - 1)))
        i = int(q)
        cut = round(300 + offsets[i] * (1 - (q - i)) + offsets[i + 1] * (q - i))
        for x in range(600):
            if x > cut: left_a.putpixel((x, y), 0)
            else: right_a.putpixel((x, y), 0)
    left.putalpha(left_a)
    right.putalpha(right_a)
    combined = Image.alpha_composite(left, right)
    assert combined.getchannel('A').tobytes() == seal.getchannel('A').tobytes()
    for side, image in [('left', left), ('right', right)]:
        save(image, {'id': 'envelope-seal-broken-' + side, 'group': args.group, 'derivedFrom': 'envelope-seal', 'fractureWorldOffsets': offsets, 'processing': 'Complementary irregular fracture of the same painted wax material, requested by motion owner; no new flat wax shapes. Two unmoved pieces reconstruct the intact alpha exactly.'})
    a = images['envelope-front'].getchannel('A')
    assert a.getpixel((300, 250)) == 0, 'front pocket must have a real V opening'
    closed = Image.new('RGBA', (600, 500))
    for name in contract['groups']['envelope']['defaultZ']: closed = Image.alpha_composite(closed, images[name])
    opened = Image.new('RGBA', (600, 500))
    opened = Image.alpha_composite(opened, images['envelope-back'])
    flap = images['envelope-flap-back'].crop((100, 220, 500, 345))
    flap = ImageOps.flip(flap).resize((400, round(125 * abs(math.cos(math.radians(175))))), Image.Resampling.LANCZOS)
    opened.alpha_composite(flap, (100, 220 - flap.height))
    paper = images['envelope-paper'].crop((135, 230, 465, 430))
    opened.alpha_composite(paper, (135, 45))
    opened = Image.alpha_composite(opened, images['envelope-front'])
    qa = Image.new('RGB', (1200, 1040), '#0b0e0d')
    draw = ImageDraw.Draw(qa)
    for column, (name, image) in enumerate([('closed / intact wax', closed), ('open / paper raised185', opened)]):
        for row, background in enumerate(['#0b0e0d', '#797977']):
            panel = Image.new('RGBA', (600, 500), background)
            panel = Image.alpha_composite(panel, image)
            qa.paste(panel.convert('RGB'), (column * 600, row * 520 + 20))
            draw.text((column * 600 + 12, row * 520 + 4), name + ' | offline assembly', fill='#ccb88b')
    qa.save(HERE / 'qa/envelope-assembly.png')

ids = {r['id'] for r in rows}
manifest['files'] = [r for r in manifest['files'] if r['id'] not in ids] + rows
manifest['contracts'] = contract['groups']
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'group': args.group, 'images': len(rows), 'runtime': str(OUT.relative_to(ROOT))}))
