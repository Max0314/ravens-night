"""Offline delivery samples only. Requires Pillow; never opens a webpage."""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PUBLIC = ROOT / 'apps/web/public/assets/ravens'
SAMPLES = {
    'lancet-square': PUBLIC / 'portraits-b-v4/undertaker.webp',
    'fleur-rounded': PUBLIC / 'portraits-b-v4/monk.webp',
    'leaf-rounded': PUBLIC / 'portraits-b-v3/spy.webp',
}
sheet = Image.new('RGB', (960, 916), '#162027')
draw = ImageDraw.Draw(sheet)
for column, (frame_id, portrait_path) in enumerate(SAMPLES.items()):
    frame = Image.open(PUBLIC / 'frames-a-v1' / (frame_id + '.png')).convert('RGBA')
    w, h = frame.size
    alpha = frame.getchannel('A')
    # Only the connected central opening is filled in these samples. Openwork
    # holes and outside margin retain the sample background.
    region = alpha.point(lambda value: 0 if value <= 8 else 255)
    ImageDraw.floodfill(region, (w // 2, h // 2), 128, thresh=0)
    mask = region.point(lambda value: 255 if value == 128 else 0)
    assert mask.getbbox() and all(v == 0 for v in [mask.getpixel((0, h // 2)), mask.getpixel((w - 1, h // 2)), mask.getpixel((w // 2, 0)), mask.getpixel((w // 2, h - 1))]), frame_id + ': opening leaks into outer margin'
    mask = ImageChops.multiply(mask.filter(ImageFilter.MaxFilter(3)), ImageChops.invert(alpha))
    checker = Image.new('RGBA', (w, h), '#a9a9a9')
    checker_draw = ImageDraw.Draw(checker)
    for y in range(0, h, 32):
        for x in range(0, w, 32):
            if (x // 32 + y // 32) % 2:
                checker_draw.rectangle((x, y, x + 31, y + 31), fill='#dedede')
    bare = Image.alpha_composite(checker, frame)
    portrait = Image.open(portrait_path).convert('RGBA').resize((w, h), Image.Resampling.LANCZOS)
    portrait.putalpha(mask)
    composite = Image.new('RGBA', (w, h), '#162027')
    composite = Image.alpha_composite(Image.alpha_composite(composite, portrait), frame)
    for row, sample in enumerate([bare, composite]):
        sample.thumbnail((312, 416), Image.Resampling.LANCZOS)
        sheet.paste(sample.convert('RGB'), (column * 320 + 4, row * 458 + 26))
        draw.text((column * 320 + 8, row * 458 + 6), frame_id + (' | alpha sample' if row == 0 else ' | offline composite'), fill='#f1d8a4')
sheet.save(HERE / 'frame-samples.png')
print(json.dumps({'sample': 'frame-samples.png', 'frames': 3, 'browser': False}))
