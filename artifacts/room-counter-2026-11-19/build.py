import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


source = Path(__file__).resolve().parent
public = source.parents[1] / 'apps/web/public'
art = public / 'assets/ravens/room-counter-v1'
sound = public / 'audio/effects/v10'
art.mkdir(parents=True, exist_ok=True)
sound.mkdir(parents=True, exist_ok=True)

frame = Image.open(source / 'counter-frame-source.png').convert('RGBA')
frame.crop((9, 211, 2164, 512)).resize((1290, 180), Image.Resampling.LANCZOS).save(art / 'frame.webp', quality=91)

sheet = Image.open(source / 'counter-digits-source.png').convert('RGBA')
sprite = Image.new('RGBA', (5 * 76, 2 * 108))
rows = ((0, 444, [0, 393, 712, 1053, 1395, 1774]), (444, 887, [0, 367, 716, 1052, 1404, 1774]))
for row, (top, bottom, stops) in enumerate(rows):
    for column, (left, right) in enumerate(zip(stops, stops[1:])):
        glyph = sheet.crop((left, top, right, bottom))
        bounds = glyph.getchannel('A').point(lambda alpha: 255 if alpha > 48 else 0).getbbox()
        glyph = glyph.crop(bounds)
        width = round(glyph.width * 100 / glyph.height)
        glyph = glyph.resize((width, 100), Image.Resampling.LANCZOS)
        sprite.alpha_composite(glyph, (column * 76 + (76 - width) // 2, row * 108 + 4))
sprite.save(art / 'numerals.webp', quality=92)

study = Image.open(source / 'settings-study-source.png').convert('RGB')
study.resize((1044, 696), Image.Resampling.LANCZOS).save(art / 'settings-study.webp', quality=83)

recording = source / 'ratchet-screwdriver-source.mp3'
rate = 44100
decoded = subprocess.check_output([
    'ffmpeg', '-v', 'error', '-i', str(recording), '-af', 'highpass=f=280,lowpass=f=8100',
    '-ar', str(rate), '-ac', '1', '-f', 'f32le', '-',
])
wave = np.frombuffer(decoded, dtype='<f4')
assets = []
for index, onset in enumerate((0.36, 0.48, 1.01), 1):
    window = wave[int((onset - .018) * rate):int((onset + .019) * rate)]
    transient = int((onset - .018) * rate) + int(np.argmax(np.abs(window)))
    clip = wave[transient - 132:transient + 2340].copy()
    clip[:60] *= np.linspace(0, 1, 60)
    clip[-405:] *= np.linspace(1, 0, 405)
    clip *= 10 ** (-4 / 20) / np.max(np.abs(clip))
    name = f'setup-ratchet-{index}'
    output = sound / (name + '.mp3')
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ac', '1', '-ar', str(rate), '-i', '-',
        '-codec:a', 'libmp3lame', '-q:a', '2', str(output),
    ], input=clip.astype('<f4').tobytes(), check=True)
    assets.append({
        'id': name, 'file': output.name, 'name': f'棘轮螺丝刀 · 齿扣 {index}',
        'author': 'InspectorJ (www.jshaw.co.uk)', 'license': 'CC BY 4.0',
        'sourcePage': 'https://freesound.org/people/InspectorJ/sounds/393490/',
        'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
        'processing': 'Edited from Screwdriver, Ratchet, C.wav (public HQ preview). Mono, bandpass, tail fade, peak at -4 dBFS before encoding.',
        'sourcePeakWindowSeconds': onset, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    })

controls = (
    ('control-tap', '面板轻触', 'trackpad-source.mp3', .098, .048,
     'Joseph SARDIN', 'https://bigsoundbank.com/macbook-trackpad-simple-click-s1740.html'),
    ('control-open', '打开面板', 'switch-source.mp3', .294, .083,
     'DavidGreck', 'https://bigsoundbank.com/switch-5-s0321.html'),
    ('control-close', '合上面板', 'switch-source.mp3', 1.780, .067,
     'DavidGreck', 'https://bigsoundbank.com/switch-5-s0321.html'),
)
for name, title, original, onset, length, author, page in controls:
    audio = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(source / original), '-af', 'highpass=f=175,lowpass=f=7100',
        '-ar', str(rate), '-ac', '1', '-f', 'f32le', '-',
    ])
    wave = np.frombuffer(audio, dtype='<f4')
    start = round((onset - .012) * rate)
    clip = wave[start:start + round(length * rate)].copy()
    clip[:176] *= np.linspace(0, 1, 176)
    clip[-352:] *= np.linspace(1, 0, 352)
    clip *= 10 ** (-6 / 20) / np.max(np.abs(clip))
    output = sound / (name + '.mp3')
    subprocess.run([
        'ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ac', '1', '-ar', str(rate), '-i', '-',
        '-codec:a', 'libmp3lame', '-q:a', '2', str(output),
    ], input=clip.astype('<f4').tobytes(), check=True)
    assets.append({
        'id': name, 'file': output.name, 'name': title, 'author': author, 'license': 'CC0 1.0',
        'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/', 'sourcePage': page,
        'processing': 'Trimmed recorded transient, mono, bandpass, edge fades, peak at -6 dBFS before encoding.',
        'sourcePeakWindowSeconds': onset, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    })
(sound / 'manifest.json').write_text(json.dumps({'version': 10, 'files': assets}, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
