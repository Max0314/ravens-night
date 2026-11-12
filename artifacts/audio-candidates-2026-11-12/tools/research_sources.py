"""Read official source metadata into the candidate folder; no game files touched."""
import concurrent.futures, html, json, pathlib, re, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path.home()/'.codex/tools/ravens-night-audio/source-cache'
CACHE.mkdir(parents=True, exist_ok=True)

def read(url, key):
    path = CACHE/key
    if not path.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
        path.write_bytes(data)
    return path.read_bytes()

def oga(slug):
    url = 'https://opengameart.org/content/'+slug
    try:
        body = read(url, slug+'.html').decode()
        files = re.findall(r'href=[\"\'](https://opengameart.org/sites/default/files/[^\"\']+)', body)
        licenses = re.findall(r'https?://creativecommons.org/[^\"\'<> ]+', body)
        author = re.findall(r'<a[^>]+href=[\"\']/users/[^\"\']+[\"\'][^>]*>(.*?)</a>', body)
        return {'slug': slug, 'page': url, 'files': list(dict.fromkeys(map(html.unescape, files))),
                'license_urls': list(dict.fromkeys(licenses)),
                'author': list(dict.fromkeys(html.unescape(re.sub('<[^>]+>', '', a)) for a in author))[:3]}
    except Exception as exc:
        return {'slug': slug, 'page': url, 'error': str(exc)}

if __name__ == '__main__':
    titles = ['Grand Dark Waltz Allegro','Grand Dark Waltz Moderato','Evening of Chaos',
              'Dark Fog','Night of Chaos','Ghost Story','Distant Tension','Lightless Dawn',
              'Virtutes Instrumenti','Gathering Darkness','Concentration','Comfortable Mystery',
              'Moonlight Hall','Long note One','Long Note One','Air Prelude']
    music = json.loads(read('https://incompetech.com/music/royalty-free/pieces.json', 'pieces.json'))
    selected = [m for m in music if m['title'] in titles]
    (ROOT/'research-music.json').write_text(json.dumps(selected,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for m in selected:
        print(json.dumps(m, ensure_ascii=False),flush=True)
    slugs = ['female-scream-1','female-high-pitched-scream-sfx','pain-sounds-by-emopreben',
             'hurt-death-sound-effect-for-character','rpg-sound-pack','dark-cavern-ambient',
             'wind1','dark-long-hits','cloth-swing-sounds','body-hitting-ground',
             '40-wet-towel-clubpoundhitattack-sounds','swishes-sound-pack',
             'crunching-bones','ticking-clock','fire-crackling','crows-singing']
    results = list(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(oga, slugs))
    (ROOT/'research-effects.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for r in results:
        print(json.dumps(r, ensure_ascii=False),flush=True)
