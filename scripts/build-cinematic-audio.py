"""Build v4 material stems from pinned existing CC0 foley and original project liquid.

Usage: python scripts/build-cinematic-audio.py <existing-v1-source-cache>
Never downloads or overwrites the accepted v1 shield / v3 claw tracks.
"""
from __future__ import annotations
import hashlib, json, math, pathlib, subprocess, sys, zipfile
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/web/public/audio/effects/v4'
RATE = 44100
PIN = '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8'
def sha(data): return hashlib.sha256(data).hexdigest()
def decode(data):
    return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i','pipe:0','-f','f32le','-ar',str(RATE),'-ac','1','pipe:1'],input=data),dtype='<f4').copy()
def trim(a):
    hits=np.flatnonzero(np.abs(a)>max(.0003,float(np.max(np.abs(a)))*.01))
    return a[max(0,int(hits[0])-44):min(len(a),int(hits[-1])+2205)] if len(hits) else a
def pitch(a,ratio): return np.interp(np.arange(0,len(a),ratio),np.arange(len(a)),a).astype(np.float32)
def env(a,attack=.002,release=.04):
    a=np.asarray(a,dtype=np.float32).copy();n=len(a)
    a*=np.minimum(1,np.arange(n)/max(1,attack*RATE))*np.minimum(1,np.arange(n,0,-1)/max(1,release*RATE));return a
def mix(seconds,*parts):
    a=np.zeros(round(seconds*RATE),np.float32)
    for src,at,gain in parts:
        i=round(at*RATE);n=min(len(src),len(a)-i)
        if n>0:a[i:i+n]+=src[:n]*gain
    return a
def extend(a,seconds):
    return np.tile(a,math.ceil(seconds*RATE/len(a)))[:round(seconds*RATE)]

def main():
    archive=pathlib.Path(sys.argv[1])/'kenney.zip';raw=archive.read_bytes();assert sha(raw)==PIN,'Pinned Kenney source differs'
    z=zipfile.ZipFile(archive);assert 'Creative Commons Zero, CC0' in z.read('License.txt').decode()
    material={n:trim(decode(z.read('Audio/'+n+'.ogg'))) for n in ['impactWood_heavy_001','impactSoft_heavy_000','impactMetal_light_001']}
    wood,soft,metal=[material[n] for n in ['impactWood_heavy_001','impactSoft_heavy_000','impactMetal_light_001']]
    liquid_path=ROOT/'apps/web/public/audio/effects/v2/poison-bubbles.mp3';liquid_raw=liquid_path.read_bytes();liquid=decode(liquid_raw)
    OUT.mkdir(parents=True,exist_ok=True)
    records=[]
    def emit(id,a,layers,filters='highpass=f=90,lowpass=f=7000',source_ids=('kenney',)):
        a=env(a);a*=.6/max(.00001,float(np.max(np.abs(a))))
        # Retain a sharp, short contact rather than boosting long noisy tails.
        p=OUT/(id+'.mp3')
        subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(RATE),'-ac','1','-i','pipe:0','-af',filters+',alimiter=limit=0.6:level=false','-ar',str(RATE),'-ac','1','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(p)],input=a.astype('<f4').tobytes(),check=True)
        check=decode(p.read_bytes());peak=float(np.max(np.abs(check)));rms=float(np.sqrt(np.mean(check*check)));hits=np.flatnonzero(np.abs(check)>peak*.01)
        records.append({'id':id,'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'durationSeconds':round(len(check)/RATE,4),'decodedBytes':len(check)*4,'sampleRate':RATE,'channels':1,'trimStartMs':0,'trimEndMs':round(len(a)/RATE*1000),'onsetOffsetMs':round(int(hits[0])/RATE*1000,2) if len(hits) else None,'peakOffsetMs':round(int(np.argmax(np.abs(check)))/RATE*1000,2),'peakDbFS':round(20*math.log10(peak),2),'rmsDbFS':round(20*math.log10(rms),2),'sources':list(source_ids),'processing':filters,'layers':layers,'license':'CC0-1.0 source foley + original project composition'})
    emit('poison-cork',mix(.23,(pitch(soft,1.7)[:round(.13*RATE)],0,.9),(pitch(wood,2.2)[:round(.1*RATE)],0,.24),(pitch(metal,1.6)[:round(.09*RATE)],.025,.045)),['Soft stopper pop from recorded soft material','Short wood friction and quiet intact-glass-like contact; no glass fracture'])
    # The existing project-authored liquid is explicitly credited as composition,
    # never mislabeled as a fresh field recording or a third-party water source.
    pour=env(extend(pitch(liquid,1.35),.65),.025,.11)
    emit('poison-pour',pour,['Existing authored liquid remixed as a 650ms pouring stream; no bottle break'],filters='highpass=f=120,lowpass=f=1600,acompressor=threshold=0.15:ratio=3:attack=4:release=60',source_ids=('project-liquid',))
    for i,ratio in enumerate([1,1.12,.95],1):emit('chef-chop-'+str(i),pitch(wood,ratio)[:round(.19*RATE)],['One recorded wood chopping contact, independently scheduled at '+str([650,1000,1350][i-1])+'ms'])
    friction=extend(pitch(wood,.75),1.02)*np.linspace(.14,.025,round(1.02*RATE))
    emit('coffin-open',mix(1.05,(env(friction,.08,.13),0,1),(pitch(soft,.75),0,.12)),['Low wooden hinge friction from repeated recorded grain; opening begins600ms'],filters='highpass=f=100,lowpass=f=1900')
    emit('coffin-settle',mix(.24,(pitch(wood,.84)[:round(.22*RATE)],0,.65),(pitch(soft,.8),.01,.32)),['Quiet recorded lid settling, not a corpse or death result'])
    manifest={'version':4,'rebuild':'python scripts/build-cinematic-audio.py <existing-v1-source-cache>','sources':[{'id':'kenney','author':'Kenney','url':'https://kenney.nl/assets/impact-sounds','license':'CC0-1.0','archiveSha256':PIN,'licenseVerified':'Creative Commons Zero, CC0 in archive License.txt','files':[{ 'file':n+'.ogg','sha256':sha(z.read('Audio/'+n+'.ogg'))} for n in material]},{'id':'project-liquid','file':'../v2/poison-bubbles.mp3','sha256':sha(liquid_raw),'license':'Original project composition','build':'scripts/build-effects-v2.py bubbles(); no new field recording'}],'files':records,'totalBytes':sum(r['bytes'] for r in records),'totalDecodedBytes':sum(r['decodedBytes'] for r in records)}
    assert manifest['totalBytes']<200_000
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (OUT/'SOURCES.md').write_text('# Cinematic material stems v4\n\nBuilt from the pinned, previously approved Kenney Impact Sounds CC0 archive and the project’s original liquid composition. No movie audio, actor imitation, paid API or new external download.\n\n- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds): CC0; archive `License.txt` verified. Exact archive and individual Ogg hashes are in `manifest.json`.\n- `../v2/poison-bubbles.mp3`: original project-authored resonant liquid; this is synthesized composition, not a real pouring recording. The v4 pour reuses this material without a glass fracture.\n\nEach manifest entry records trim, onset, peak offset, processing, decoded bytes and output SHA. v1 shield and v3 left/right slashes remain untouched.\n',encoding='utf8')
    print(json.dumps({k:manifest[k] for k in ['totalBytes','totalDecodedBytes']}))
if __name__=='__main__':main()
