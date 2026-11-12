"""Rebuild original Ravens cues from CC0 foley and a local spoken phrase.

Usage: python scripts/build-effects-audio.py <external-cache-directory>
Run prepare-effects-voice.ps1 with the same directory first. ffmpeg is required.
No keys, voice services or paid APIs are used. Output MP3s are self contained.
"""
from __future__ import annotations
import array, hashlib, json, math, pathlib, random, shutil, subprocess, sys, urllib.request, wave, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/web/public/audio/effects/v1'
RATE = 44100
RNG = random.Random(20261112)
CACHE = pathlib.Path(sys.argv[1]).resolve()
SOURCES = [
 {'file':'glass.wav','expectedSha256':'37d29069c885afe3f7ca639293fa679fb6511a6a1e54316f0e403e4493f502b3','url':'https://opengameart.org/sites/default/files/glass_breaking.wav','page':'https://opengameart.org/content/glass-break','author':'TinyWorlds','license':'CC0-1.0'},
 {'file':'yelling.zip','expectedSha256':'e9100a4e3b9dcd146993089970dc6097dcf9935fa4683b196040012bad65d67a','url':'https://opengameart.org/sites/default/files/yelling%20sounds.zip','page':'https://opengameart.org/content/male-gruntyelling-sounds','author':'HaelDB and the male vocalists in the published pack','license':'CC0-1.0 (selected from the page\'s dual CC0 / OGA-BY offer)'},
 {'file':'kenney.zip','expectedSha256':'029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8','url':'https://kenney.nl/download-link/6173736574732f696d706163742d736f756e6473','page':'https://kenney.nl/assets/impact-sounds','author':'Kenney','license':'CC0-1.0; archive License.txt verified'},
]

def request(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://kenney.nl/assets/impact-sounds'}),timeout=45).read()

def prepare():
 CACHE.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
 for source in SOURCES:
  p=CACHE/source['file']
  if not p.exists():
   body=request(source['url'])
   if source['file']=='kenney.zip':body=request(json.loads(body)['url'])
   p.write_bytes(body)
  source['sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
  if source['sha256']!=source['expectedSha256']:raise RuntimeError('Source archive changed; inspect before using '+source['file'])
  source['bytes']=p.stat().st_size
 kz=zipfile.ZipFile(CACHE/'kenney.zip')
 assert 'Creative Commons Zero, CC0' in kz.read('License.txt').decode()
 for name in ['impactMetal_heavy_000','impactMetal_light_001','impactPlate_heavy_001','impactWood_heavy_001','impactSoft_heavy_000','impactPunch_heavy_002']:
  (CACHE/(name+'.ogg')).write_bytes(kz.read('Audio/'+name+'.ogg'))
 yz=zipfile.ZipFile(CACHE/'yelling.zip')
 for name in ['3grunt1','3grunt3','1yell1','3yell1']:(CACHE/(name+'.wav')).write_bytes(yz.read('yelling sounds/'+name+'.wav'))

def decode(p,filters=None):
 cmd=['ffmpeg','-v','error','-i',str(p)]
 if filters:cmd+=['-af',filters]
 cmd+=['-f','f32le','-ac','1','-ar',str(RATE),'-']
 a=array.array('f');a.frombytes(subprocess.check_output(cmd));return a

def silence(seconds):return array.array('f',[0])*round(RATE*seconds)

def add(dst,src,at=0,gain=1,pan=0):
 # Cues are authored in mono; the runtime may spatialize individual layers.
 start=round(at*RATE)
 for i,v in enumerate(src[:max(0,len(dst)-start)]):
  if start+i>=0:dst[start+i]+=v*gain

def envelope(src,attack=.002,release=.06):
 n=len(src);a=max(1,round(attack*RATE));r=max(1,round(release*RATE))
 return array.array('f',(x*min(1,i/a,(n-i)/r) for i,x in enumerate(src)))

def noise(seconds,decay=8,low=0):
 n=round(seconds*RATE);v=0;out=array.array('f')
 for i in range(n):
  white=RNG.uniform(-1,1);v=low*v+(1-low)*white
  out.append(v*math.exp(-decay*i/RATE))
 return out

def sine(seconds,freq,decay=1,gain=1,slide=0):
 phase=0;out=array.array('f')
 for i in range(round(seconds*RATE)):
  t=i/RATE;phase+=2*math.pi*(freq+slide*t)/RATE
  out.append(gain*math.sin(phase)*math.exp(-decay*t))
 return envelope(out,attack=.005)

def bell(seconds,freq):
 out=silence(seconds)
 for ratio,level,decay in [(1,.55,1.6),(2.76,.25,2.8),(5.4,.12,4.5),(7.8,.05,6)]:add(out,sine(seconds,freq*ratio,decay,level))
 return out

def whoosh(seconds,level=1):
 src=noise(seconds,0,.92);n=len(src)
 return array.array('f',(v*level*math.sin(math.pi*i/max(1,n-1))**2 for i,v in enumerate(src)))

def liquid(seconds):
 out=silence(seconds)
 for _ in range(round(seconds*22)):
  at=RNG.uniform(.02,max(.03,seconds-.15));freq=RNG.uniform(160,620)
  add(out,sine(.13,freq,35,RNG.uniform(.08,.22),-freq*4),at)
 add(out,noise(seconds,0,.985),0,.17)
 return out

def crunchy(seconds):
 out=silence(seconds)
 for _ in range(21):
  at=RNG.uniform(0,seconds-.025);add(out,noise(.045,70,.35),at,RNG.uniform(.1,.45))
 return out

def strings(seconds,freq):
 out=silence(seconds)
 for detune in [-.0025,.0025]:
  for h in [1,2,3,4,5]:add(out,sine(seconds,freq*(1+detune)*h,.7,.11/h),0)
 return envelope(out,attack=.09,release=.35)

def finish(name,data,layers):
 # Prevent source/encoder overshoot on small mobile speakers.
 peak=max(abs(x) for x in data) or 1
 data=array.array('f',(math.tanh(x/peak*1.25)*.76 for x in data))
 data=envelope(data,attack=.001,release=.08)
 wav=CACHE/(name+'-mix.wav')
 with wave.open(str(wav),'wb')as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE)
  pcm=array.array('h',(max(-32767,min(32767,round(x*32767))) for x in data));w.writeframes(pcm.tobytes())
 target=OUT/(name+'.mp3')
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','160k','-ar',str(RATE),'-ac','1','-map_metadata','-1',str(target)],check=True)
 decoded=decode(target);p=max(abs(x) for x in decoded);rms=math.sqrt(sum(x*x for x in decoded)/len(decoded))
 assert p<10**(-1/20),f'{name} exceeds -1dBFS';assert rms>.002,f'{name} is effectively silent'
 return {'file':name+'.mp3','bytes':target.stat().st_size,'durationSeconds':round(len(decoded)/RATE,4),'sampleRate':RATE,'channels':1,'peakDbFS':round(20*math.log10(p),2),'rmsDbFS':round(20*math.log10(rms),2),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'layers':layers}

def main():
 prepare();records=[]
 glass=decode(CACHE/'glass.wav');metal=decode(CACHE/'impactMetal_heavy_000.ogg');light=decode(CACHE/'impactMetal_light_001.ogg');plate=decode(CACHE/'impactPlate_heavy_001.ogg');wood=decode(CACHE/'impactWood_heavy_001.ogg');soft=decode(CACHE/'impactSoft_heavy_000.ogg');punch=decode(CACHE/'impactPunch_heavy_002.ogg')
 grunt=decode(CACHE/'3grunt1.wav','silenceremove=start_periods=1:start_threshold=-38dB,atempo=1.12,highpass=f=80,lowpass=f=6500');yell=decode(CACHE/'3yell1.wav','silenceremove=start_periods=1:start_threshold=-38dB,asetrate=36000,aresample=44100,lowpass=f=3200')
 shot=silence(1.45);add(shot,noise(.2,37,.1),.005,.75);add(shot,sine(.6,125,10,.8,-130),.005);add(shot,punch,0,.8);add(shot,wood,.025,.35);add(shot,light,.13,.17);add(shot,noise(.6,6,.95),.06,.16);records.append(finish('shot',shot,['original pressure impulse and sub body','Kenney punch/wood/metal foley; no scream or glass']))
 out=silence(1.6);add(out,glass,0,.8);add(out,light,.02,.14);records.append(finish('glass',out,['TinyWorlds glass break','Kenney light metal debris']))
 out=silence(1.2);add(out,wood,0,.8);add(out,punch,.018,.9);add(out,crunchy(.24),.01,.3);add(out,sine(.5,76,9,.6),.008);records.append(finish('impact',out,['Kenney wood and punch','original dry fracture and low impact']))
 out=silence(1.05);add(out,grunt,0,.85);records.append(finish('scream',out,['HaelDB pack 3grunt1 male short hurt vocal; trimmed silence, equalized and compressed']))
 out=silence(2.35);add(out,glass,.05,.28);add(out,liquid(2.1),.15,.9);add(out,noise(1.9,0,.85),.2,.035);records.append(finish('poison',out,['TinyWorlds bottle-like glass','original resonant liquid bubbles and acid hiss']))
 out=silence(1.7);add(out,whoosh(.45),0,.9);add(out,metal,.28,.8);add(out,plate,.3,.45);add(out,bell(1.3,310),.3,.23);records.append(finish('shield',out,['Kenney steel and plate','original shield air rush and metallic resonances']))
 voice=CACHE/'my-lord-raw.wav'
 if not voice.exists():raise RuntimeError('Run scripts/prepare-effects-voice.ps1 <cache-directory> first')
 spoken=decode(voice,'silenceremove=start_periods=1:start_threshold=-45dB,asetrate=16000,aresample=44100,atempo=1.2,highpass=f=75,lowpass=f=3700,equalizer=f=170:t=q:w=1:g=4,aecho=0.7:0.6:48:0.12')
 out=silence(max(2.35,len(spoken)/RATE+.2));add(out,whoosh(.35),0,.15);add(out,spoken,.16,.9);records.append(finish('butler',out,['original text My lord. rendered by installed Microsoft Zira Desktop, lowered and filtered into a deep register','original cloth movement; no television recording or actor impersonation']))
 out=silence(3.1);add(out,whoosh(.76),0,1.6);add(out,soft,.08,.5)
 for at in [.95,1.82]:
  add(out,whoosh(.28),at,.8);add(out,wood,at+.13,.24);add(out,crunchy(.28),at+.12,.6);add(out,liquid(.25),at+.14,.38);add(out,punch,at+.14,.35)
 records.append(finish('demon',out,['original wing rush and two slash gestures at 0.95/1.82s','Kenney soft/wood/punch; original bone crack and wet impact','deliberately no human scream; this is an attempted private action']))
 out=silence(4.0);add(out,glass,0,.15);add(out,crunchy(.4),0,.3)
 for at,freq in [(0,146.83),(.12,220),(.24,293.66),(.42,369.99),(.6,440),(.76,587.33)]:add(out,strings(3.1,freq),at,.8)
 add(out,bell(3.2,293.66),.4,.22);records.append(finish('good',out,['original ascending D major chamber chord and bright bell','TinyWorlds wing-fragment glass and original fracture']))
 out=silence(4.0);add(out,noise(4,0,.995),0,.28);add(out,crunchy(3.7),.12,.13)
 for f in [55,82.4,103.83,116.54]:add(out,strings(3.9,f),0,.8)
 add(out,whoosh(1.1),.4,.65);add(out,yell,1.1,.07);add(out,yell,2.1,.035);records.append(finish('evil',out,['original low dark chord, wing swell and smoldering fire crackle','HaelDB pack 3yell1 distant filtered lament at low level']))
 voice_sha=hashlib.sha256(voice.read_bytes()).hexdigest()
 manifest={'version':1,'builtAt':'2026-11-12','license':'CC0 source foley plus original synthesized composition; see source details','sources':SOURCES,'voice':{'text':'My lord.','generator':'Windows System.Speech, installed Microsoft Zira Desktop','originalSha256':voice_sha,'note':'Original local synthetic reading; pitch and tone processed. No third-party character recording.'},'processing':'scripts/build-effects-audio.py; ffmpeg libmp3lame 160k mono 44.1kHz; deterministic seed 20261112; source archive hashes are recorded','files':records}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'files':[{k:r[k]for k in ['file','durationSeconds','peakDbFS','bytes']}for r in records],'totalBytes':sum(r['bytes']for r in records)},indent=2))

if __name__=='__main__':main()
