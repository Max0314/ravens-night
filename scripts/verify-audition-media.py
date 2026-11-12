from pathlib import Path
import json,hashlib,subprocess,re,concurrent.futures
root=Path(__file__).resolve().parents[1];folder=root/'apps/web/public/audio-candidates/2026-11-12-v1'
rows=json.loads((folder/'catalog.json').read_text(encoding='utf8'))['assets']
def check(row):
 p=folder/row['file'];assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256']
 meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name','-of','json',str(p)]))
 assert meta['streams'][0]['codec_name']=='mp3'
 duration=float(meta['format']['duration']);assert abs(duration-row['duration_seconds'])<.2,(row['id'],duration)
 measured=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-af','loudnorm=I=-23:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
 result=json.loads(re.findall(r'\{[^{}]+\}',measured)[-1]);peak=float(result['input_tp'])
 if row['id']!='R01':assert peak<=-.5,(row['id'],peak)
 return {'id':row['id'],'sha256':row['sha256'],'duration':duration,'true_peak_dbtp':peak}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:checked=list(pool.map(check,rows))
path=root/'artifacts/audio-candidates-2026-11-12/mobile-verification.json';path.write_text(json.dumps({'method':'ffprobe MP3/duration + full FFmpeg decode/true-peak analysis; not artistic approval or browser validation','count':len(checked),'assets':checked},indent=2)+'\n',encoding='utf8');print(json.dumps({'mp3s':len(checked),'full_decode':'passed','peak_guard':'passed except unchanged R01 reference'}))
