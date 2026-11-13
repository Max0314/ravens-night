"""Build lamp candle and carriage material cues offline. Requires FFmpeg and NumPy.
Only writes v9 outputs and their measured TypeScript index; existing approved tracks stay untouched.
"""
from pathlib import Path
import hashlib, importlib.util, json, math, subprocess, sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/cinematic-motion-2026-11-12/sources/role-audio-v9'
OUT=ROOT/'apps/web/public/audio/effects/v9'
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
 # Small physical movements only: no footsteps, ignition, recruiting or success cues.
 chain=material['fine-chain'];a,_=helpers.pick(chain,.23,(0,.4));b,_=helpers.pick(chain,.22,(.4,.75));c,_=helpers.pick(chain,.18,(.7,1))
 chain_motion=mix(2.65,(a,0,.6),(b,.65,.38),(c,1.4,.22),(envelope(a[:round(.18*RATE)],.03,.07),2.1,.1))
 emit('lamp-chain',chain_motion,['fine-chain'],['Four diminishing excerpts of a real small metal chain, 0/650/1400/2100ms relative to lamp swing; no footsteps or door impact'],'highpass=f=350,lowpass=f=6500',attack=.025,target=-34,soften=True)
 fire=cut(material['fire'],.35,3.0)
 emit('small-flame',fire,['fire'],['Quiet continuous crop 350..3000ms of archived A04 fire recording, softened as lamp/candle foley; no ignition or three artificial flame strikes, not claimed as a candle field recording'],'highpass=f=180,lowpass=f=2800',attack=.12,target=-34,soften=True)
 roll,start=helpers.pick(material['wheel-roll'],.5,(.15,.55))
 emit('carriage-roll',roll,['wheel-roll'],['Real rolling wheelbarrow friction crop at '+str(start)+'ms, low-pass/softened as brief carriage-wheel foley; no horses, voices or claimed wooden-carriage field recording'],'highpass=f=70,lowpass=f=1900',attack=.04,target=-28,soften=True)
 emit('carriage-stop',stretch(material['wood-small'],.28),['wood-small'],['Single quiet recorded wood contact for light carriage settling, no cannon/gavel/theme hit'],'highpass=f=60,lowpass=f=1800',attack=.006,target=-29,soften=True)
 emit('carriage-hinge',stretch(cut(material['door-creak'],.18,.92),.55),['door-creak'],['Recorded door friction crop, compressed to the small carriage-door hinge movement; no extra slam'],'highpass=f=160,lowpass=f=4200',attack=.025,target=-28,soften=True)
 for i,region in enumerate([(0,.5),(.5,1)],1):
  tear,start=helpers.pick(material['paper-tear'],.2,region)
  emit('contract-seal-'+str(i),tear,['paper-tear'],['Different real dry paper-tear excerpt at '+str(start)+'ms as seal-release foley, not claimed as literal wax recording; no impact theme'],'highpass=f=300,lowpass=f=6000',attack=.003,target=-28,soften=True)
 for i,id in enumerate(['paper-draw','paper-handling'],1):
  paper,start=helpers.pick(material[id],.65)
  emit('contract-unroll-'+str(i),stretch(paper,.7),[id],['Different recorded paper take at '+str(start)+'ms, lowered/extended for thick parchment unrolling; no real outsider names/roles or recruitment sound'],'highpass=f=120,lowpass=f=5500',attack=.035,target=-27,soften=True)
 manifest=dict(version=9,group='lamp-candle-carriage-detail',rebuild='python scripts/build-role-audio-v9.py',sourceIndex='artifacts/cinematic-motion-2026-11-12/sources/role-audio-v9/sources.json',license='CC0-1.0 recordings; original project material arrangement',files=records,totalBytes=sum(r['bytes'] for r in records),totalDecodedBytes=sum(r['decodedBytes'] for r in records))
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 leads={r['id']:{'onset':r['onsetOffsetMs'],'peak':r['peakOffsetMs'],'duration':r['durationMs']} for r in records}
 (ROOT/'apps/web/src/components/role-audio-v9.ts').write_text('// Generated by scripts/build-role-audio-v9.py from decoded runtime MP3s.\nexport const roleAudioV9='+json.dumps(leads,indent=2)+' as const;\n',encoding='utf-8')
 print(json.dumps([{k:r[k] for k in ['id','durationMs','onsetOffsetMs','peakOffsetMs','peakDbFS','rmsDbFS']} for r in records],indent=2))

if __name__=='__main__':main()
