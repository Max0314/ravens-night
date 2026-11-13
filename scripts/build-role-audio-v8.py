"""Build remaining material and pulse cues offline. Requires FFmpeg and NumPy.
Only writes v8 outputs and their measured TypeScript index; existing approved tracks stay untouched.
"""
from pathlib import Path
import hashlib, importlib.util, json, math, subprocess, sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/cinematic-motion-2026-11-12/sources/role-audio-v8'
OUT=ROOT/'apps/web/public/audio/effects/v8'
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
 # Single physical contacts; no secondary arbitrary impact or musical success tone.
 wood=stretch(material['wood-contact'],.3);metal=stretch(material['light-metal'],.24)
 emit('scepter-contact',mix(.34,(wood,0,.85),(metal,.012,.12)),['wood-contact','light-metal'],['Recorded wood contact plus quiet metal fitting rattle, one scepter footfall'],'highpass=f=70,lowpass=f=4500',attack=.003,target=-24,soften=True)
 emit('soldier-shield',stretch(material['metal-contact'],.8),['metal-contact'],['Single recorded metal contact with damped tail; no second armor strike or shot-result sound'],'highpass=f=120,lowpass=f=5500',attack=.004,target=-24,soften=True)
 cloth=material['cloth'];heavy=material['cloth-heavy']
 emit('cloak-unfold',stretch(heavy,1.1),['cloth-heavy'],['Recorded heavy cloth stretched to follow opening cape, no wing or low musical drone'],'highpass=f=100,lowpass=f=6500',attack=.055,target=-27,soften=True)
 emit('cloak-hem',stretch(cloth,.55),['cloth'],['Different light cloth take for delayed hem friction, no impact'],'highpass=f=160,lowpass=f=6500',attack=.06,target=-30,soften=True)
 wine=material['wine-liquid']
 emit('cup-sway-left',stretch(cut(wine,1.2,1.7),.47),['wine-liquid'],['Fixed recorded wine-liquid excerpt 1200..1700ms, softened as small liquid agitation during cup sway; no invented bubbles or clink'],'highpass=f=120,lowpass=f=3000',attack=.05,target=-29,soften=True)
 emit('cup-sway-right',stretch(cut(wine,2.7,3.2),.47),['wine-liquid'],['Different wine-liquid excerpt 2700..3200ms for opposite return sway; material foley, not claimed as an isolated real swirl recording'],'highpass=f=120,lowpass=f=3000',attack=.05,target=-31,soften=True)
 def low_pulse(seconds,hz):
  t=np.arange(round(seconds*RATE))/RATE
  body=np.sin(2*np.pi*hz*t)+.4*np.sin(2*np.pi*hz*2.03*t)+.15*np.sin(2*np.pi*hz*3.02*t)
  return envelope((body*np.exp(-22*t)).astype(np.float32),.016,.06)
 pulse=mix(.22,(low_pulse(.2,64),0,.8))
 emit('empath-pulse',pulse,[],['Original authored single low pulse with quiet upper partials; shared visual clock supplies the same fixed left/right double-beat pattern for every result; not a real heartbeat recording'],'highpass=f=38,lowpass=f=260',attack=.01,target=-26)
 paper=material['paper-draw'];paper,_start=helpers.pick(paper,.6)
 emit('mayor-document',paper,['paper-draw'],['Real paper unfolding during council document movement, no stamp, ding or success cue'],'highpass=f=150,lowpass=f=6000',attack=.04,target=-29,soften=True)
 emit('flower-ribbon',stretch(cloth,.42),['cloth'],['Very quiet recorded cloth friction as silk ribbon foley during flower opening; no invented petal impact'],'highpass=f=240,lowpass=f=6500',attack=.07,target=-32,soften=True)
 manifest=dict(version=8,group='remaining-material-detail',rebuild='python scripts/build-role-audio-v8.py',sourceIndex='artifacts/cinematic-motion-2026-11-12/sources/role-audio-v8/sources.json',license='CC0-1.0 recordings; original project material arrangement',files=records,totalBytes=sum(r['bytes'] for r in records),totalDecodedBytes=sum(r['decodedBytes'] for r in records))
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 leads={r['id']:{'onset':r['onsetOffsetMs'],'peak':r['peakOffsetMs'],'duration':r['durationMs']} for r in records}
 (ROOT/'apps/web/src/components/role-audio-v8.ts').write_text('// Generated by scripts/build-role-audio-v8.py from decoded runtime MP3s.\nexport const roleAudioV8='+json.dumps(leads,indent=2)+' as const;\n',encoding='utf-8')
 print(json.dumps([{k:r[k] for k in ['id','durationMs','onsetOffsetMs','peakOffsetMs','peakDbFS','rmsDbFS']} for r in records],indent=2))

if __name__=='__main__':main()
