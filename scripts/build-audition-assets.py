"""Publish mobile MP3 audition copies of the existing, attributed candidate pack."""
from pathlib import Path
import hashlib,json,math,subprocess,concurrent.futures
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/audio-candidates-2026-11-12'
OUT=ROOT/'apps/web/public/audio-candidates/2026-11-12-v1'
def digest(data):return hashlib.sha256(data).hexdigest()
catalog=json.loads((SOURCE/'catalog.json').read_text(encoding='utf8'))
analysis=json.loads((SOURCE/'analysis.json').read_text(encoding='utf8'))['assets']
OUT.mkdir(parents=True,exist_ok=True)
def encode(row):
    source=SOURCE/row['file'];raw=source.read_bytes();a=analysis[row['id']]
    assert digest(raw)==row['sha256']==a['sha256'],row['id']
    candidates=[0]
    for key,target_level in [('integrated_lufs',-23),('true_peak_dbtp',-2)]:
        value=a.get(key)
        if isinstance(value,(float,int)) and math.isfinite(value):candidates.append(target_level-value)
    gain=0 if row['id']=='R01' else min(candidates)
    target=OUT/(row['id']+'.mp3')
    if row['id']=='R01' and source.suffix=='.mp3':target.write_bytes(raw)
    else:subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-map_metadata','-1','-vn','-af',f'volume={gain:.4f}dB','-ar','44100','-c:a','libmp3lame','-b:a','160k',str(target)],check=True)
    return {**{k:row.get(k) for k in ['id','kind','name_zh','usage','description','review_note','author','license','license_url','processing','duration_seconds']},'sources':row.get('source_pages') or [row.get('source_page')], 'file':target.name,'source_file':row['file'],'source_sha256':row['sha256'],'sha256':digest(target.read_bytes()),'bytes':target.stat().st_size,'audition_gain_db':round(gain,4),'audition_processing':'R01原样保留' if row['id']=='R01' else 'MP3试听副本；仅衰减较响原件，不增益、不改变音高或速度。'}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(encode,catalog['assets']))
assert len(rows)==55 and len({r['id'] for r in rows})==55
data={'version':1,'date':'2026-11-12','status':'候选试听，未替换局内音轨','assets':rows}
(OUT/'catalog.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
for name in ['CREDITS.md','CATALOG.md']:
    content=(SOURCE/name).read_text(encoding='utf8')
    if name=='CATALOG.md':
        for row in catalog['assets']:content=content.replace(']('+row['file']+')',']('+row['id']+'.mp3)')
        content=content.replace('# 声音候选逐条说明','# 声音候选逐条说明\n\n线上文件链接为MP3试听副本。下列信号分析及原加工描述对应原件；试听副本的衰减量与新SHA见catalog.json。')
    (OUT/name).write_text(content.rstrip()+'\n',encoding='utf8')
import shutil
shutil.copytree(SOURCE/'licenses',OUT/'licenses',dirs_exist_ok=True)
print(json.dumps({'count':len(rows),'bytes':sum(r['bytes'] for r in rows),'source_bytes':sum(r['bytes'] for r in catalog['assets'])}))
