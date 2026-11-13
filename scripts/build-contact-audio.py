"""Rebuild v5 demon contact stems from the pinned project v3 slashes.
No downloads. Requires FFmpeg and NumPy. Run from any working directory.
"""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'apps/web/public/audio/effects/v5'
PINS={'left':'f846ce760c8db3c0d22cdd1611d23cac93ff4c540ae7dba784189d0e2e1c5266','right':'8e387ff4c295cfd54e53a8d19c1fe269e903d245c80a674d0642970fef0456fb'}
FILTER='atrim=start=0.08:duration=0.42,asetpts=PTS-STARTPTS,highpass=f=120,equalizer=f=2200:t=q:w=1:g=2,acompressor=threshold=0.1:ratio=4:attack=2:release=65:makeup=2.5,alimiter=limit=0.85:level=false,afade=t=in:d=0.004,afade=t=out:st=0.34:d=0.08'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def decode(p):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-ar','44100','-ac','1','pipe:1']),dtype=np.float32)
def main():
 OUT.mkdir(parents=True,exist_ok=True);rows=[]
 for direction,pin in PINS.items():
  source=ROOT/f'apps/web/public/audio/effects/v3/slash-{direction}.mp3'
  assert sha(source)==pin,'Pinned source changed'
  target=OUT/f'slash-{direction}.mp3'
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-af',FILTER,'-ar','44100','-ac','1','-c:a','libmp3lame','-b:a','160k',str(target)],check=True)
  a=decode(target);peak=float(np.max(np.abs(a)));onset=int(np.flatnonzero(np.abs(a)>=peak*.03)[0]);energy=np.array([np.sqrt(np.mean(a[i:i+441]**2)) for i in range(0,len(a),441)]);contact_ms=int(np.argmax(energy))*10+5
  rows.append({'id':f'slash-{direction}','file':target.name,'source':f'../v3/slash-{direction}.mp3','sourceSha256':pin,'sha256':sha(target),'bytes':target.stat().st_size,'durationMs':round(len(a)/44100*1000,3),'peakOffsetMs':round(int(np.argmax(np.abs(a)))/44100*1000,3),'onsetOffsetMs':round(onset/44100*1000,3),'contactOffsetMs':contact_ms,'contactMeasurement':'center of strongest decoded 10ms RMS window','peakDb':round(float(20*np.log10(peak)),2),'rmsDb':round(float(20*np.log10(np.sqrt(np.mean(a*a)))),2),'processing':FILTER,'license':'Original project composition plus previously attributed Kenney CC0 foley; v1/SOURCES.md'})
 (OUT/'manifest.json').write_text(json.dumps({'version':5,'rebuild':'python scripts/build-contact-audio.py','purpose':'Four action-submission contact transients; no death, result, vocal or hidden-success cue','files':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(rows,indent=2))
if __name__=='__main__':main()
