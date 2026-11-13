"""Build recorded raven/coffin material cues offline. Requires FFmpeg and NumPy.
Only writes v7 outputs and their measured TypeScript index; existing approved tracks stay untouched.
"""
from pathlib import Path
import hashlib, importlib.util, json, math, subprocess, sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/cinematic-motion-2026-11-12/sources/role-audio-v7'
OUT=ROOT/'apps/web/public/audio/effects/v7'
# Reuse the already reviewed PCM/filter helpers, without invoking its v6 main().
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('role_audio_v6',ROOT/'scripts/build-role-audio-v6.py')
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
RATE=helpers.RATE
decode_file,filtered,envelope,stretch,mix=helpers.decode_file,helpers.filtered,helpers.envelope,helpers.stretch,helpers.mix
def sha(raw):return hashlib.sha256(raw).hexdigest()
def cut(a,start,end):return a[round(start*RATE):round(end*RATE)].copy()

def main():
 rows=json.loads((SOURCE/'sources.json').read_text(encoding='utf-8'))['sources'];material={}
 for row in rows:
  path=ROOT/row['path'];assert sha(path.read_bytes())==row['sha256'],'Source changed: '+row['id'];material[row['id']]=decode_file(path)
 OUT.mkdir(parents=True,exist_ok=True);records=[]
 def emit(id,a,source_ids,layers,filters,attack=.012,target=-25,soften=False):
  a=filtered(envelope(a,attack,.07),filters);rms=float(np.sqrt(np.mean(a*a)))
  if soften:a=3*rms*np.tanh(a/max(3*rms,1e-8))
  rms=float(np.sqrt(np.mean(a*a)));scale=min(10**(target/20)/max(rms,1e-8),.63/max(float(np.max(np.abs(a))),1e-8));a*=scale
  path=OUT/(id+'.mp3')
  subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','pipe:0','-af','alimiter=limit=0.63:level=false','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(path)],input=a.astype('<f4').tobytes(),check=True)
  raw=path.read_bytes();check=decode_file(path);peak=float(np.max(np.abs(check)));hits=np.flatnonzero(np.abs(check)>=peak*.03)
  records.append(dict(id=id,file=path.name,sha256=sha(raw),bytes=len(raw),durationMs=round(len(check)/RATE*1000,3),decodedBytes=len(check)*4,sampleRate=RATE,channels=1,onsetOffsetMs=round(int(hits[0])/RATE*1000,3),peakOffsetMs=round(int(np.argmax(np.abs(check)))/RATE*1000,3),peakDbFS=round(20*math.log10(peak),2),rmsDbFS=round(20*math.log10(float(np.sqrt(np.mean(check*check)))),2),sources=source_ids,layers=layers,processing=filters+(' -> soft saturation at 3x RMS' if soften else '')+' -> gain -> limiter 0.63',normalization=dict(targetRmsDbFS=target,peakCap=.63,appliedGain=round(scale,6),attackMs=attack*1000,releaseMs=70)))
 # Actual recorded wing material, two different excerpts; no stock whoosh or pitched result sting.
 bird=material['bird-wings']
 emit('raven-wing-open',stretch(cut(bird,.075,.32),.42),['bird-wings'],['Actual pigeon takeoff excerpt 75..320ms, stretched to 420ms for stylized raven opening stroke; no claim of a raven field recording'],'highpass=f=110,lowpass=f=6200',target=-24,soften=True)
 emit('raven-wing-fold',stretch(cut(bird,.32,.63),.48),['bird-wings'],['Different natural wing excerpt 320..630ms, stretched to 480ms for smaller closing stroke'],'highpass=f=160,lowpass=f=6500',target=-27,soften=True)
 feather=stretch(cut(bird,.18,.72),1.15)
 emit('raven-feathers',feather,['bird-wings'],['Recorded bird feather/air texture excerpt 180..720ms, extended under articulated movement; gradual fade, no extra impact'],'highpass=f=650,lowpass=f=7500',attack=.065,target=-32,soften=True)
 emit('raven-short-call',cut(material['crow-call'],1.58,2.18),['crow-call'],['Fixed 1580..2180ms crop of archived A05 crows recording; identical for every scene/result, not selected from revealed/death data'],'highpass=f=260,lowpass=f=5400',attack=.04,target=-27,soften=True)
 emit('coffin-hinge',stretch(cut(material['door-creak'],.14,1.5),1.06),['door-creak'],['Recorded opening-door hinge friction 140..1500ms, resampled to 1060ms and darkened as heavy wood lid foley; not repeated synthesized impacts'],'highpass=f=70,lowpass=f=3500',attack=.025,target=-24,soften=True)
 wood=stretch(material['wood-small'],.32)
 settle=mix(.6,(wood,0,.8),(filtered(wood,'lowpass=f=500'),.14,.14),(filtered(wood,'lowpass=f=350'),.28,.055))
 emit('coffin-settle',settle,['wood-small'],['Recorded small wood contact, lowered by resampling; two strongly damped low-pass reflections at 140/280ms, fully faded by 600ms; follows lid settling, no result meaning'],'highpass=f=45,lowpass=f=1800',attack=.004,target=-24,soften=True)
 manifest=dict(version=7,group='raven-coffin-detail',rebuild='python scripts/build-role-audio-v7.py',sourceIndex='artifacts/cinematic-motion-2026-11-12/sources/role-audio-v7/sources.json',license='CC0-1.0 recordings; original project material arrangement',files=records,totalBytes=sum(r['bytes'] for r in records),totalDecodedBytes=sum(r['decodedBytes'] for r in records))
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 leads={r['id']:{'onset':r['onsetOffsetMs'],'peak':r['peakOffsetMs'],'duration':r['durationMs']} for r in records}
 (ROOT/'apps/web/src/components/role-audio-v7.ts').write_text('// Generated by scripts/build-role-audio-v7.py from decoded runtime MP3s.\nexport const roleAudioV7='+json.dumps(leads,indent=2)+' as const;\n',encoding='utf-8')
 print(json.dumps([{k:r[k] for k in ['id','durationMs','onsetOffsetMs','peakOffsetMs','peakDbFS','rmsDbFS']} for r in records],indent=2))

if __name__=='__main__':main()
