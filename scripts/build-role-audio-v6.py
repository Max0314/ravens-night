"""Build role detail group-one cues from archived CC0 sources; no downloads or protected-file writes.
Usage: python scripts/build-role-audio-v6.py
Requires FFmpeg and NumPy. Source originals and hashes live in the repository.
"""
from pathlib import Path
import hashlib,json,math,subprocess
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artifacts/cinematic-motion-2026-11-12/sources/role-audio-v6'
OUT=ROOT/'apps/web/public/audio/effects/v6'
RATE=44100
SEED=20261113
rng=np.random.default_rng(SEED)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def decode_file(path):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','f32le','-ar',str(RATE),'-ac','1','pipe:1']),dtype='<f4').copy()
def filtered(a,filters):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-f','f32le','-ar',str(RATE),'-ac','1','-i','pipe:0','-af',filters,'-f','f32le','pipe:1'],input=a.astype('<f4').tobytes()),dtype='<f4').copy()
def envelope(a,attack=.012,release=.07):
 a=a.copy();n=len(a);a*=np.minimum(1,np.arange(n)/max(1,attack*RATE))*np.minimum(1,np.arange(n,0,-1)/max(1,release*RATE));return a

def stretch(a,seconds):return np.interp(np.linspace(0,len(a)-1,round(seconds*RATE)),np.arange(len(a)),a).astype(np.float32)
def pick(a,seconds,region=(0,1)):
 lo=int(len(a)*region[0]);hi=int(len(a)*region[1]);part=a[lo:hi];center=lo+int(np.argmax(np.abs(part)));start=max(lo,min(hi-round(seconds*RATE),center-round(.04*RATE)));start=max(0,start);out=a[start:start+round(seconds*RATE)]
 if len(out)<round(seconds*RATE):out=np.pad(out,(0,round(seconds*RATE)-len(out)))
 return out,round(start/RATE*1000,3)
def mix(seconds,*layers):
 out=np.zeros(round(seconds*RATE),np.float32)
 for a,at,gain in layers:
  start=round(at*RATE);size=min(len(a),len(out)-start)
  if size>0:out[start:start+size]+=a[:size]*gain
 return out

def main():
 rows=json.loads((SOURCE/'sources.json').read_text(encoding='utf-8'))['sources'];material={}
 for row in rows:
  raw=(SOURCE/row['file']).read_bytes();assert sha(raw)==row['sha256'],'Source changed: '+row['id'];material[row['id']]=decode_file(SOURCE/row['file'])
 OUT.mkdir(parents=True,exist_ok=True);records=[]
 def emit(id,a,source_ids,layers,filters='highpass=f=100,lowpass=f=7000',attack=.008,target=-23,soften=False):
  a=filtered(envelope(a,attack,.065),filters);rms=float(np.sqrt(np.mean(a*a)))
  if soften:a=3*rms*np.tanh(a/max(3*rms,1e-8))
  rms=float(np.sqrt(np.mean(a*a)));scale=min(10**(target/20)/max(rms,1e-8),.63/max(float(np.max(np.abs(a))),1e-8));a*=scale
  path=OUT/(id+'.mp3');processing='alimiter=limit=0.63:level=false'
  subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','pipe:0','-af',processing,'-ar',str(RATE),'-ac','1','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(path)],input=a.astype('<f4').tobytes(),check=True)
  raw=path.read_bytes();check=decode_file(path);peak=float(np.max(np.abs(check)));hits=np.flatnonzero(np.abs(check)>=peak*.03)
  records.append({'id':id,'file':path.name,'sha256':sha(raw),'bytes':len(raw),'durationMs':round(len(check)/RATE*1000,3),'decodedBytes':len(check)*4,'sampleRate':RATE,'channels':1,'onsetOffsetMs':round(int(hits[0])/RATE*1000,3) if len(hits) else 0,'peakOffsetMs':round(int(np.argmax(np.abs(check)))/RATE*1000,3),'peakDbFS':round(20*math.log10(peak),2),'rmsDbFS':round(20*math.log10(float(np.sqrt(np.mean(check*check)))),2),'sources':source_ids,'layers':layers,'processing':filters+(' -> original soft saturation at 3x RMS' if soften else '')+' -> gain -> '+processing,'normalization':{'targetRmsDbFS':target,'peakCap':.63,'appliedGain':round(scale,6),'attackMs':attack*1000,'releaseMs':65}})
 cloth=material['cloth'];heavy=material['cloth-heavy'];water,water_start=pick(material['water-drops'],.44)
 dip=mix(.5,(stretch(heavy,.42),0,.4),(water,.025,.6));emit('washer-dip',dip,['cloth-heavy','water-drops'],['Recorded cloth and quiet recorded water entry; no impact/voice'],target=-24)
 scrub=mix(.72,(stretch(cloth,.31),0,.7),(stretch(cloth[::-1],.32),.34,.58));emit('washer-scrub',scrub,['cloth'],['Two soft recorded cloth friction strokes'],target=-25)
 drops=mix(1.2,(water,0,.7),(water,.39,.54),(water,.83,.36));emit('washer-drops',drops,['water-drops'],['Three recorded drops, descending dynamics; source selection starts '+str(water_start)+'ms'],target=-26)
 # Fixed reversed grains break lexical continuity: no text, names, seat, alignment or result input.
 voice=material['whisper'];whisper=np.zeros(round(1.6*RATE),np.float32)
 for i in range(14):
  start=int((.8+i*.37)*RATE)%max(1,len(voice)-8000);grain=voice[start:start+round(.13*RATE)][::-1];grain=envelope(grain,.025,.03);at=round((i*.105)*RATE);n=min(len(grain),len(whisper)-at);whisper[at:at+n]+=grain[:n]*(.65+.18*np.sin(i*1.7))
 whisper+=np.roll(whisper,round(.073*RATE))*.27;emit('washer-whisper',whisper,['whisper'],['Original fixed montage of reversed 130ms recorded whisper grains; lexical order destroyed; never receives player/game data'],filters='highpass=f=260,lowpass=f=4600',attack=.07,target=-29,soften=True)
 t=np.arange(round(2.7*RATE))/RATE
 hum=(np.sin(2*np.pi*77*t+.06*np.sin(2*np.pi*.3*t))*.6+np.sin(2*np.pi*154.3*t)*.24+np.sin(2*np.pi*231.2*t)*.16+np.sin(2*np.pi*308.5*t)*.06)*(1+.07*np.sin(2*np.pi*.55*t))
 emit('crystal-resonance',hum.astype(np.float32),[],['Original authored slow low resonance; continuous 200ms onset, no result-specific pitch or chime'],filters='highpass=f=45,lowpass=f=1100',attack=.2,target=-25)
 t=np.arange(round(1.25*RATE))/RATE
 glass=sum(np.sin(2*np.pi*f*t+.11*np.sin(2*np.pi*.4*t))*(.7+.17*np.sin(2*np.pi*(3.2+i*.41)*t))/(i+1) for i,f in enumerate([418.7,687.1,1138.6]))
 emit('crystal-shiver',glass.astype(np.float32),[],['Original authored glass-like fine partial vibration; slow 170ms onset, no impact ping and identical for YES/NO'],filters='highpass=f=300,lowpass=f=2400',attack=.17,target=-29)
 paper_a,paper_a_start=pick(material['paper-handling'],.8,(0,.45));paper_b,paper_b_start=pick(material['paper-draw'],.8);bottle,bottle_start=pick(material['bottle'],.4)
 lens=mix(.8,(stretch(cloth,.72),0,.8),(envelope(stretch(bottle,.7),.15,.15),.025,.08));emit('investigator-lens',lens,['cloth','bottle'],['Recorded gentle surface/rim friction, not stamp, impact or alignment-result cue'],filters='highpass=f=180,lowpass=f=5200',attack=.055,target=-26,soften=True)
 evidence,evidence_start=pick(material['paper-draw'],.4);emit('investigator-evidence',evidence,['paper-draw'],['Recorded paper evidence slide; source selection starts '+str(evidence_start)+'ms'],filters='highpass=f=150,lowpass=f=6000',attack=.028,target=-25,soften=True)
 tear,tear_start=pick(material['paper-tear'],.22);emit('envelope-seal',tear,['paper-tear'],['Recorded dry paper tear transient used as soft seal release foley; not falsely labeled a wax field recording; source '+str(tear_start)+'ms'],filters='highpass=f=300,lowpass=f=6500',attack=.003,target=-22)
 emit('envelope-flap',stretch(paper_a,.6),['paper-handling'],['Recorded paper flap movement; source '+str(paper_a_start)+'ms'],filters='highpass=f=150,lowpass=f=6500',attack=.018,target=-25,soften=True)
 emit('envelope-draw',stretch(paper_b,.7),['paper-draw'],['Recorded paper extraction, separate physical take; source '+str(paper_b_start)+'ms'],filters='highpass=f=150,lowpass=f=6500',attack=.025,target=-24,soften=True)
 (OUT/'manifest.json').write_text(json.dumps({'version':6,'group':'role-detail-one','rebuild':'python scripts/build-role-audio-v6.py','seed':SEED,'sourceIndex':'artifacts/cinematic-motion-2026-11-12/sources/role-audio-v6/sources.json','license':'CC0-1.0 recorded material plus original project composition; all fixed source originals archived','files':records,'totalBytes':sum(r['bytes'] for r in records),'totalDecodedBytes':sum(r['decodedBytes'] for r in records)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 leads={r['id']:{'onset':r['onsetOffsetMs'],'peak':r['peakOffsetMs'],'duration':r['durationMs']} for r in records}
 (ROOT/'apps/web/src/components/role-audio-v6.ts').write_text('// Generated by scripts/build-role-audio-v6.py from the decoded runtime MP3s.\nexport const roleAudioV6='+json.dumps(leads,ensure_ascii=False,indent=2)+' as const;\n',encoding='utf-8')
 print(json.dumps([{k:r[k]for k in ['id','durationMs','onsetOffsetMs','peakOffsetMs','peakDbFS','rmsDbFS']} for r in records],indent=2))
if __name__=='__main__':main()
