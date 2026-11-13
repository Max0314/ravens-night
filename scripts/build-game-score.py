"""Build approved background music copies and bounded private score excerpts offline.
Requires FFmpeg; source originals and publisher/license catalog are already in Git.
Never writes M19, candidate files or source originals.
"""
from pathlib import Path
import hashlib,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'apps/web/public/audio/music/v2'
TITLES={'M01':'Moonlight Hall','M03':'Comfortable Mystery','M15':'Unsolved Investigation','M18':'Dark Shrine Loop','M22':'No More Magic'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def credits(rows):
 for r in rows:r['originalTitle']=TITLES[r['id']]
 text='\n'.join(f"<li>{r['id']} — {r['originalTitle']} — {r['author']} — <a href=\"{r['sourcePages'][0]}\">original</a> — <a href=\"{r['licenseUrl']}\">{r['license']}</a>. Changes: loudness, MP3 encoding"+(' and four-second excerpt' if r['excerptSeconds'] else '')+'.</li>' for r in rows)
 (OUT/'credits.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8"><title>音乐来源</title><h1>音乐来源与许可</h1><ul>'+text+'</ul><p>M19: Breves Dies Hominis — Magdalen Kadel (Makemi), submitted by ceninan; <a href="https://opengameart.org/content/breves-dies-hominis">original</a>, CC0-1.0. Original runtime copy unchanged.</p></html>\n',encoding='utf-8')
def main():
 if '--credits-only' in sys.argv:
  p=OUT/'manifest.json';m=json.loads(p.read_text(encoding='utf-8'));credits(m['files']);p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');return
 catalog=json.loads((ROOT/'apps/web/public/audio-candidates/2026-11-12-v1/catalog.json').read_text(encoding='utf-8'))['assets'];rows=[];OUT.mkdir(parents=True,exist_ok=True)
 for id,offset,duration in [('M01',0,None),('M15',0,None),('M18',0,None),('M03',3,4),('M22',0,4)]:
  source=next(r for r in catalog if r['id']==id);path=ROOT/'artifacts/audio-candidates-2026-11-12'/source['source_file'];assert sha(path)==source['source_sha256'],'Original changed: '+id
  name=('scene-' if duration else 'background-')+id.lower()+'.mp3';target=OUT/name
  filters='loudnorm=I='+('-27' if duration else '-20')+':TP=-2:LRA=7,afade=t=in:d='+('0.08' if duration else '0.05')
  if duration:filters='atrim=duration=4,asetpts=PTS-STARTPTS,'+filters+',afade=t=out:st=3.7:d=0.3'
  args=['ffmpeg','-v','error','-xerror','-y','-ss',str(offset),'-i',str(path)]
  if duration:args+=['-t',str(duration)]
  subprocess.run(args+['-af',filters,'-ar','44100','-ac','1' if duration else '2','-c:a','libmp3lame','-b:a','128k' if duration else '160k','-map_metadata','-1',str(target)],check=True)
  subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(target),'-f','null','-'],check=True)
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',str(target)],text=True));stream=probe['streams'][0]
  measure=subprocess.run(['ffmpeg','-hide_banner','-i',str(target),'-af','loudnorm=I=-20:TP=-2:LRA=7:print_format=json','-f','null','-'],stderr=subprocess.PIPE,stdout=subprocess.DEVNULL,text=True,check=True);loud=json.loads(re.search(r'\{[^{}]+\}',measure.stderr).group())
  rows.append(dict(id=id,file=name,sha256=sha(target),bytes=target.stat().st_size,durationSeconds=float(probe['format']['duration']),decodedBytesEstimate=round(float(probe['format']['duration'])*int(stream['sample_rate'])*stream['channels']*4),offsetSeconds=offset,excerptSeconds=duration,sourcePath=path.relative_to(ROOT).as_posix(),sourceSha256=source['source_sha256'],sourcePages=source['sources'],author=source['author'],license=source['license'],licenseUrl=source['license_url'],processing=filters,integratedLUFS=float(loud['input_i']),truePeakDb=float(loud['input_tp'])))
 credits(rows)
 (OUT/'manifest.json').write_text(json.dumps(dict(version=2,rebuild='python scripts/build-game-score.py',files=rows,m19='Existing /audio/music/v1/lobby-m19.mp3 unchanged; .8 base volume retained'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps([{k:r[k] for k in ['id','file','durationSeconds','integratedLUFS','truePeakDb']}for r in rows],indent=2))
if __name__=='__main__':main()
