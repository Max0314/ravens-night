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
        ys = [y for y in range(image.height) if x < image.width and a.getpixel((x, y)) > 128]
        result['opaqueVerticalSamples'][str(x)] = [min(ys), max(ys)] if ys else None
    return result

def save(image, row):
    if 'prompt' in row and args.group not in ['envelope', 'lens']:
        row['promptSha256'] = hashlib.sha256((ROOT / row['prompt']).read_text(encoding='utf-8').replace('\r\n', '\n').encode('utf-8')).hexdigest()
        row['promptHashEncoding'] = 'UTF-8, LF line endings'
    target = OUT / (row['id'] + '.webp')
    image.save(target, format='WEBP', lossless=True, method=6)
    images[row['id']] = image
    rows.append({**row, 'file': target.name, 'url': contract['runtimeRoot'] + target.name, 'width': image.width, 'height': image.height, 'bytes': target.stat().st_size, 'sha256': sha(target), 'hasAlpha': True, 'measured': measure(image)})

def project(image, source_quad, target_quad, size=(600, 500)):
    import numpy as np
    matrix, vector = [], []
    for (x, y), (u, v) in zip(target_quad, source_quad):
        matrix.extend([[x, y, 1, 0, 0, 0, -u*x, -u*y], [0, 0, 0, x, y, 1, -v*x, -v*y]])
        vector.extend([u, v])
    coefficients = np.linalg.solve(np.array(matrix), np.array(vector)).tolist()
    return image.transform(size, Image.Transform.PERSPECTIVE, coefficients, Image.Resampling.BICUBIC), coefficients

for part in contract['groups'][args.group]['parts']:
    source = HERE / 'originals' / part.get('sourceFile', part['id'] + '.png')
    prompt = HERE / 'prompts' / part.get('promptFile', part['id'] + '.txt')
    original = Image.open(source).convert('RGBA')
    mode = part.get('processingMode')
    if mode == 'source-region':
        region = part['sourceRegion']
        material = original.crop(tuple(region))
        visible = bounds(material.getchannel('A'), 8)
        assert visible, source
        crop = (max(0,visible[0]-1)+region[0],max(0,visible[1]-1)+region[1],min(material.width,visible[2]+1)+region[0],min(material.height,visible[3]+1)+region[1])
        x,y,w,h = part['targetRect']
        image = Image.new('RGBA',(600,500))
        image.alpha_composite(original.crop(crop).resize((w,h),Image.Resampling.LANCZOS),(x,y))
        save(image, {'id':part['id'],'group':args.group,'source':str(source.relative_to(ROOT)).replace('\\','/'),'sourceSha256':sha(source),'sourceSize':original.size,'sourceRegion':region,'sourceRect':crop,'targetRect':part['targetRect'],'prompt':str(prompt.relative_to(ROOT)).replace('\\','/'),'processing':'One naturally separate generated sprite from its declared non-overlapping source region; preserve painted alpha and normalize only this complete sprite to target rect, no geometric repaint.'})
        continue
    if mode in ['project-plane', 'local-plane']:
        visible = bounds(original.getchannel('A'), 8)
        crop = (max(0, visible[0]-1), max(0, visible[1]-1), min(original.width, visible[2]+1), min(original.height, visible[3]+1))
        source_quad = part.get('sourceQuad', [[crop[0],crop[1]],[crop[2],crop[1]],[crop[2],crop[3]],[crop[0],crop[3]]])
        extra = {}
        if mode == 'local-plane':
            image = original.crop(crop).resize(tuple(part['localSize']), Image.Resampling.LANCZOS)
            extra['localSize'] = part['localSize']
        else:
            image, coefficients = project(original, source_quad, part['targetQuad'])
            extra.update({'sourceQuad': source_quad, 'targetQuad': part['targetQuad'], 'perspectiveOutputToSource': coefficients})
            if part['id'] == 'coffin-oblique-lining':
                from PIL import ImageChops, ImageFilter
                shell_alpha = images['coffin-oblique-base'].getchannel('A')
                region = shell_alpha.point(lambda value: 0 if value <= 8 else 255)
                ImageDraw.floodfill(region, (300, 285), 128, thresh=0)
                hole = region.point(lambda value: 255 if value == 128 else 0)
                assert hole.getpixel((0,0)) == 0 and hole.getbbox(), 'shell must have enclosed clear cavity'
                image.putalpha(ImageChops.multiply(image.getchannel('A'), hole.filter(ImageFilter.MaxFilter(3))))
                extra['occlusionMask'] = 'Enclosed actual shell alpha<=8 cavity, expanded1px under rim; prevents lining spilling outside bevel corners. Painted cloth preserved.'
        save(image, {'id': part['id'], 'group': args.group, 'source': str(source.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source), 'sourceSize': original.size, 'prompt': str(prompt.relative_to(ROOT)).replace('\\', '/'), 'sourceRect': crop, **extra, 'processing': 'Whole independently generated material, explicit plane normalization/projective placement only; natural painted bevel silhouette retained, no painted polygon replacement.'})
        continue
    if mode == 'anchor-fit':
        sx, sy = part['sourceAnchor']
        wx, wy = part['worldAnchor']
        scale = part['uniformScale']
        affine = (1 / scale, 0, sx - wx / scale, 0, 1 / scale, sy - wy / scale)
        image = original.transform((600, 500), Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)
        save(image, {'id': part['id'], 'group': args.group, 'source': str(source.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source), 'sourceSize': original.size, 'prompt': str(prompt.relative_to(ROOT)).replace('\\', '/'), 'sourceAnchor': part['sourceAnchor'], 'worldAnchor': part['worldAnchor'], 'uniformScale': scale, 'affineOutputToSource': affine, 'processing': 'Whole independently painted original, uniformly resampled around an explicitly measured material anchor onto the common world canvas. No shape painting or cut of a composite.'})
        continue
    if mode == 'calibrate-transparent-hole':
        a = original.getchannel('A')
        region = a.point(lambda value: 0 if value <= 8 else 255)
        ImageDraw.floodfill(region, (original.width // 2, round(original.height * .41)), 128, thresh=0)
        hole = bounds(region.point(lambda value: 255 if value == 128 else 0), 8)
        assert hole and hole[0] > 0 and hole[1] > 0 and hole[2] < original.width and hole[3] < original.height, 'ring aperture must be enclosed and empty'
        source_cx, source_cy = (hole[0] + hole[2]) / 2, (hole[1] + hole[3]) / 2
        radius = contract['groups']['lens']['measuredHoleNormalizeRadius']
        sx, sy = radius / ((hole[2] - hole[0]) / 2), radius / ((hole[3] - hole[1]) / 2)
        affine = (1 / sx, 0, source_cx - 300 / sx, 0, 1 / sy, source_cy - 205 / sy)
        image = original.transform((600, 500), Image.Transform.AFFINE, affine, Image.Resampling.BICUBIC)
        alpha = image.getchannel('A')
        clear_values = [alpha.getpixel((x, y)) for y in range(123, 288) for x in range(218, 383) if (x - 300) ** 2 + (y - 205) ** 2 <= 82 ** 2]
        assert max(clear_values) == 0, 'entire R82 aperture must be alpha0 without repainting'
        image.save(HERE / 'qa/magnifier-calibration.png')
        cardinal = {}
        for name, dx, dy in [('left', -1, 0), ('right', 1, 0), ('top', 0, -1), ('bottom', 0, 1)]:
            radii = [r for r in range(85, 120) if alpha.getpixel((300 + dx * r, 205 + dy * r)) > 128]
            cardinal[name] = max(radii) if radii else None
        save(image, {'id': part['id'], 'group': args.group, 'source': str(source.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source), 'sourceSize': original.size, 'prompt': str(prompt.relative_to(ROOT)).replace('\\', '/'), 'sourceHoleBoundsAlphaAtMost8': hole, 'affineOutputToSource': affine, 'lensCentre': [300, 205], 'nominalHoleRadius': radius, 'clearRadius82MaxAlpha': 0, 'measuredOuterCardinalRadiiAbove128': cardinal, 'processing': 'One affine calibrated from actual enclosed source hole. Normalize clear-hole bbox to radius85 so entire R82 is naturally alpha0; no alpha clearing/cut or baked lens contents. Original painted metal retained.'})
        continue
    if mode == 'whole-canvas-glint':
        image = original.resize((600, 500), Image.Resampling.LANCZOS)
        scale = part['glassLocalScale']
        image = image.transform((600, 500), Image.Transform.AFFINE, (1 / scale, 0, 300 - 300 / scale, 0, 1 / scale, 205 - 205 / scale), Image.Resampling.BICUBIC)
        alpha = image.getchannel('A').point(lambda value: round(value * part['opacity']))
        aperture = Image.new('L', (600, 500))
        ImageDraw.Draw(aperture).ellipse((215, 120, 385, 290), fill=255)
        from PIL import ImageChops
        image.putalpha(ImageChops.multiply(alpha, aperture))
        central = [image.getpixel((x, y))[3] for y in range(145, 266) for x in range(240, 361) if (x - 300) ** 2 + (y - 205) ** 2 <= 60 ** 2]
        assert max(central) <= 1, 'glint must not fill centre with milky glass'
        save(image, {'id': part['id'], 'group': args.group, 'source': str(source.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source), 'sourceSize': original.size, 'prompt': str(prompt.relative_to(ROOT)).replace('\\', '/'), 'glassLocalScale': scale, 'maxAlpha': image.getchannel('A').getextrema()[1], 'centralRadius60MaxAlpha': max(central), 'processing': 'Resample whole generated canvas then scale0.9 around calibrated glass centre, apply declared0.22 opacity and clip to calibrated aperture only; no metal or filled glass disk.'})
        continue
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

if args.group == 'lens':
    evidence, hardware, glint = [images[name] for name in ['investigator-evidence', 'investigator-magnifier', 'investigator-lens-glint']]
    qa = Image.new('RGB', (1200, 1040), '#0b0e0d')
    draw = ImageDraw.Draw(qa)
    for column, (cx, cy) in enumerate([(300, 205), (165, 245)]):
        zoom = evidence.transform((600, 500), Image.Transform.AFFINE, (1 / 1.5, 0, cx - cx / 1.5, 0, 1 / 1.5, cy - cy / 1.5), Image.Resampling.BICUBIC)
        mask = Image.new('L', (600, 500))
        ImageDraw.Draw(mask).ellipse((cx - 82, cy - 82, cx + 82, cy + 82), fill=255)
        zoom.putalpha(mask)
        composed = Image.alpha_composite(evidence, zoom)
        for layer in [glint, hardware]:
            shifted = Image.new('RGBA', (600, 500))
            shifted.alpha_composite(layer, (cx - 300, cy - 205))
            composed = Image.alpha_composite(composed, shifted)
        for row, background in enumerate(['#0b0e0d', '#797977']):
            panel = Image.alpha_composite(Image.new('RGBA', (600, 500), background), composed)
            qa.paste(panel.convert('RGB'), (column * 600, row * 520 + 20))
            draw.text((column * 600 + 12, row * 520 + 4), f'same evidence1.5x | C{cx},{cy} | offline only', fill='#ccb88b')
    qa.save(HERE / 'qa/lens-assembly.png')

if args.group == 'coffin':
    group = contract['groups']['coffin']
    opened = Image.alpha_composite(images['coffin-oblique-lining'], images['coffin-oblique-base'])
    lid = images['coffin-oblique-lid-front']
    projected, _ = project(lid, [[0,0],[380,0],[380,200],[0,200]], group['lidClosedQuad'])
    closed = Image.alpha_composite(opened, projected)
    qa = Image.new('RGB', (1200, 1040), '#0b0e0d')
    draw = ImageDraw.Draw(qa)
    for column, (name, layer) in enumerate([('lid absent / lining behind shell', opened), ('lid front at closed quad', closed)]):
        for row, background in enumerate(['#0b0e0d', '#797977']):
            panel = Image.alpha_composite(Image.new('RGBA', (600,500), background), layer)
            qa.paste(panel.convert('RGB'), (column*600,row*520+20))
            draw.text((column*600+12,row*520+4), name+' / offline only', fill='#ccb88b')
    qa.save(HERE / 'qa/coffin-assembly.png')

if args.group in ['recluse', 'saint', 'feather']:
    composed = Image.new('RGBA', (600,500))
    for name in contract['groups'][args.group]['defaultZ']:
        composed = Image.alpha_composite(composed, images[name])
    base = images[contract['groups'][args.group]['parts'][0]['id']]
    qa = Image.new('RGB', (1200,1040), '#0b0e0d')
    draw = ImageDraw.Draw(qa)
    for column, (name, layer) in enumerate([('base only', base), ('assembled', composed)]):
        for row, background in enumerate(['#0b0e0d','#797977']):
            panel = Image.alpha_composite(Image.new('RGBA',(600,500),background),layer)
            qa.paste(panel.convert('RGB'), (column*600,row*520+20))
            draw.text((column*600+12,row*520+4), name+' / offline still only', fill='#ccb88b')
    qa.save(HERE / ('qa/'+args.group+'-assembly.png'))

if args.group == 'raven':
    composed = Image.new('RGBA', (600, 500))
    for name in contract['groups']['raven']['defaultZ']:
        composed = Image.alpha_composite(composed, images[name])
    qa = Image.new('RGB', (1200, 520), '#0b0e0d')
    draw = ImageDraw.Draw(qa)
    for column, background in enumerate(['#0b0e0d', '#797977']):
        panel = Image.alpha_composite(Image.new('RGBA', (600, 500), background), composed)
        qa.paste(panel.convert('RGB'), (column * 600, 20))
        draw.text((column * 600 + 12, 4), 'six independent layers / neutral spread / offline only', fill='#ccb88b')
    qa.save(HERE / 'qa/raven-assembly.png')

ids = {r['id'] for r in rows}
manifest['files'] = [r for r in manifest['files'] if r['id'] not in ids] + rows
manifest['contracts'] = contract['groups']
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'group': args.group, 'images': len(rows), 'runtime': str(OUT.relative_to(ROOT))}))
