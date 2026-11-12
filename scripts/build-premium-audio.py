"""Restore the accepted v1 claw attack's dry/wet impact layers as separate cues.
Uses only versioned project media and original CC0 sources already attributed in v1.
"""
import pathlib,subprocess,hashlib,json
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=ROOT/'apps/web/public/audio/effects/v1/demon.mp3';out=ROOT/'apps/web/public/audio/effects/v3';out.mkdir(parents=True,exist_ok=True)
files=[]
for name,start in [('slash-left',.95),('slash-right',1.82)]:
 p=out/(name+'.mp3')
 # Separate original attack gestures, preserving their tearing transient and impact.
 filters='highpass=f=95,equalizer=f=2300:t=q:w=1:g=3,acompressor=threshold=0.3:ratio=2:attack=2:release=90,alimiter=limit=0.9:level=false,afade=t=out:st=0.49:d=0.08'
 subprocess.run(['ffmpeg','-y','-v','error','-ss',str(start),'-i',str(source),'-t','0.57','-af',filters,'-ar','44100','-ac','1','-c:a','libmp3lame','-b:a','160k',str(p)],check=True)
 b=p.read_bytes();files.append({'id':name,'file':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'source':'../v1/demon.mp3','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'start':start,'duration':.57,'processing':filters,'license':'Original project composition with previously attributed Kenney CC0 foley; see v1/SOURCES.md'})
(out/'manifest.json').write_text(json.dumps({'version':3,'files':files},indent=2)+'\n',encoding='utf8')
print(json.dumps({'files':len(files),'bytes':sum(f['bytes'] for f in files)}))
