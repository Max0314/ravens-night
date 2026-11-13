"""Create a loudness-adjusted full M19 copy; no download, trimming or song replacement.
Requires FFmpeg. The archived audition MP3 is immutable and SHA-pinned.
"""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'apps/web/public/audio-candidates/2026-11-12-v1/M19.mp3'
OUT=ROOT/'apps/web/public/audio/music/v1'
PIN='bf74a06a49a90395da5d681d4222af510bda8a5a772902cfa8c41c6e844c5d27'
FILTER='loudnorm=I=-20:TP=-2:LRA=7,afade=t=in:d=0.05'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 assert sha(SOURCE)==PIN,'Pinned M19 source changed'
 OUT.mkdir(parents=True,exist_ok=True);target=OUT/'lobby-m19.mp3'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(SOURCE),'-af',FILTER,'-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','160k',str(target)],check=True)
 result=subprocess.run(['ffmpeg','-hide_banner','-i',str(target),'-af','loudnorm=I=-20:TP=-2:LRA=7:print_format=json','-f','null','-'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True,check=True)
 measured=json.loads(re.search(r'\{[^{}]+\}',result.stderr).group())
 manifest={'version':1,'id':'M19','name':'短暂的人世','source':'/audio-candidates/2026-11-12-v1/M19.mp3','sourceSha256':PIN,'author':'Magdalen Kadel (Makemi); submitted by ceninan','sourcePage':'https://opengameart.org/content/breves-dies-hominis','license':'CC0-1.0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/','file':target.name,'sha256':sha(target),'bytes':target.stat().st_size,'processing':FILTER,'preserved':'Full recording, stereo, pitch and speed; no trim or replacement','rebuild':'python scripts/build-lobby-music.py','measuredIntegratedLUFS':float(measured['input_i']),'measuredTruePeakDb':float(measured['input_tp']),'measuredLRA':float(measured['input_lra'])}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False))
if __name__=='__main__':main()
