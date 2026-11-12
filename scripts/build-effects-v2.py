"""Build Ravens v2 recorded foley, separate stems and role soundtracks.

python scripts/build-effects-v2.py <v2-external-cache> <existing-v1-source-cache>
Requires numpy and ffmpeg. Downloads only the listed public CC0 recordings.
Original source recordings/PCM masters stay outside Git; committed MP3s and
their manifest are immutable release assets. No paid APIs or movie recordings.
"""
from __future__ import annotations
import hashlib,json,math,pathlib,re,subprocess,sys,zipfile
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'apps/web/public/audio/effects/v2'
RATE=44100
RNG=np.random.default_rng(20261112)
CACHE=pathlib.Path(sys.argv[1]).resolve()
OLD=pathlib.Path(sys.argv[2]).resolve()
ONLY_BELLS='--only-bells' in sys.argv[3:]
EXISTING={f['id']:f for f in json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))['files']} if ONLY_BELLS else {}
SOURCES=[]
PINNED_RECORDINGS={
 '3446':'29d82355ff8e37830a36fd6593c6e91d0b3206d5bcfa16bfc6a0d351c02f0b19',
 '0164':'bbfe308e17db4bcd402d07c69447c31ec351dc9d4143f8d93c4e567d4c1ac8d5',
 '2213':'34167cc701a517c6d8501ec60fee0d90b6edc8f22b1dca1fdd94ce352968cf34',
 '2214':'dc522de9c55a7a45102618d4cf156573f0e8c0fef3024075ca7b099ccf2e599a',
 '2211':'64741ee40d6d5f149abf7ce559779ab9a82370f984a8e297d839612ce9f00e03',
 '2181':'19fe719fb9cb314ccf4babda05e7443b0a1c3227f6ba3a6232427a073d271e51',
 '2186':'1b10a6f477932f9eb0496a8e7c05c2886674de8d2273267728c909125a6e0bfc',
 '2187':'a1d27bb2af2af8b61f43b86bab785b3c80fd54b0d3e258da3169f383525876eb',
}

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def decode(p,filters=''):
    cmd=['ffmpeg','-v','error','-i',str(p)]
    if filters:cmd+=['-af',filters]
    cmd+=['-f','f32le','-ac','1','-ar',str(RATE),'-']
    return np.frombuffer(subprocess.check_output(cmd),dtype='<f4').copy()
def fetch(id,page,author):
    p=CACHE/(id+'.mp3');url='https://bigsoundbank.com/UPLOAD/mp3/'+id+'.mp3'
    if not p.exists() or p.stat().st_size<512:
        subprocess.run(['curl','--fail','--silent','--show-error','--location','--ipv4',
                        '--connect-timeout','10','--max-time','90','--retry','2',url,'-o',str(p)],check=True)
    # Missing files redirect to a HTML search page; do not mistake that for audio.
    subprocess.run(['ffprobe','-v','error','-show_entries','format=duration',str(p)],check=True,stdout=subprocess.DEVNULL)
    assert sha(p)==PINNED_RECORDINGS[id],'Recorded source changed; inspect license/content before rebuilding: '+id
    source={'id':id,'url':url,'page':page,'author':author,'license':'CC0-1.0',
            'licenseURL':'https://bigsoundbank.com/licenses.html','sha256':sha(p),'bytes':p.stat().st_size}
    SOURCES.append(source)
    return p
def silence(seconds):return np.zeros(round(seconds*RATE),dtype=np.float32)
def env(a,attack=.004,release=.06):
    a=a.copy();n=len(a);a*=np.minimum(1,np.arange(n)/max(1,attack*RATE))
    a*=np.minimum(1,np.arange(n,0,-1)/max(1,release*RATE));return a
def add(dst,src,at=0,gain=1):
    start=round(at*RATE);end=min(len(dst),start+len(src))
    if end>start:dst[start:end]+=src[:end-start]*gain
def mix(seconds,*items):
    out=silence(seconds)
    for src,at,gain in items:add(out,src,at,gain)
    return out
def trim(a,max_duration=None,threshold=.008):
    i=np.flatnonzero(np.abs(a)>threshold)
    if len(i):a=a[max(0,i[0]-int(.005*RATE)):min(len(a),i[-1]+int(.025*RATE))]
    if max_duration:a=a[:round(max_duration*RATE)]
    return env(a)
def pitch(a,ratio):
    return np.interp(np.arange(0,len(a),ratio),np.arange(len(a)),a).astype(np.float32)
def tone(seconds,freq,decay=2,gain=.2):
    t=np.arange(round(seconds*RATE))/RATE
    return env((np.sin(2*np.pi*freq*t)*np.exp(-decay*t)*gain).astype(np.float32))
def air(seconds,gain=.12):
    n=round(seconds*RATE);a=RNG.normal(0,gain,n)
    a=np.convolve(a,np.ones(13)/13,mode='same')
    return env((a*np.sin(np.linspace(0,np.pi,n))**2).astype(np.float32),.02,.08)
def bubbles(seconds):
    out=silence(seconds)
    for _ in range(round(seconds*25)):
        d=.07+RNG.random()*.09;t=np.arange(round(d*RATE))/RATE
        f=RNG.uniform(180,620);a=np.sin(2*np.pi*(f*t-f*2*t*t))*np.exp(-28*t)
        add(out,env(a.astype(np.float32),.004,.02),RNG.random()*max(.01,seconds-d),RNG.uniform(.04,.12))
    return out
def emit(id,data,layers,sources=(),cue=0,level=-7):
    if ONLY_BELLS and id not in ['night-bell','dawn-bell']:
        record=EXISTING[id]
        assert sha(OUT/record['file'])==record['sha256'],'Existing asset differs: '+id
        RECORDS.append(record);return np.empty(0,dtype=np.float32)
    data=env(np.asarray(data,dtype=np.float32),.002,.06)
    peak=float(np.max(np.abs(data))) or 1
    # Normalizing only the peak leaves real rustles/bells nearly inaudible when
    # their recording contains one sharp handling transient. Compress that crest
    # before the material-specific RMS balance; never muffle/slow human vocals.
    cap=10**(level/20)
    if id.startswith('hurt-') or id.startswith('cough-') or id=='butler-voice':
        data*=cap/peak
    else:
        target_db=-27 if id.startswith('paper-') else -33 if id.startswith('ui-') else -22 if id.startswith('role-') else -21 if id.endswith('-bell') else -23
        if id=='shot' or id=='guillotine-impact':target_db=-19
        target=10**(target_db/20)
        data*=.8/peak
        for _ in range(4):
            rms=float(np.sqrt(np.mean(data*data))) or 1
            data*=target/rms
            data=(np.tanh(data/cap)*cap).astype(np.float32)
    pcm=CACHE/(id+'-master.wav')
    cmd=['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','-']
    if id.endswith('-bell'):cmd+=['-af','loudnorm=I=-18:TP=-5.5:LRA=7']
    elif id.startswith('role-'):cmd+=['-af','loudnorm=I=-19:TP=-4.5:LRA=7']
    elif id.startswith('hurt-night-'):cmd+=['-af','loudnorm=I=-21:TP=-6:LRA=7']
    cmd+=['-ar',str(RATE),'-ac','1','-c:a','pcm_s16le',str(pcm)]
    subprocess.run(cmd,input=data.astype('<f4').tobytes(),check=True)
    target=OUT/(id+'.mp3')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(pcm),'-c:a','libmp3lame','-b:a','128k',
                    '-map_metadata','-1',str(target)],check=True)
    check=decode(target);peak=float(np.max(np.abs(check)));rms=float(np.sqrt(np.mean(check*check)))
    assert peak<10**(-3/20),f'{id} overshoot';assert rms>.0005,f'{id} silent'
    meter=subprocess.run(['ffmpeg','-hide_banner','-i',str(target),'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True).stderr
    integrated=re.findall(r'I:\s*(-?[0-9.]+) LUFS',meter)
    result={'id':id,'file':id+'.mp3','sha256':sha(target),'bytes':target.stat().st_size,
            'durationSeconds':round(len(check)/RATE,4),'trimStartMs':0,'trimEndMs':round(len(check)/RATE*1000),
            'cueMs':cue,'decodedBytes':len(check)*4,'sampleRate':RATE,'channels':1,
            'peakDbFS':round(20*math.log10(peak),2),'rmsDbFS':round(20*math.log10(rms),2),
            'integratedLUFS':float(integrated[-1]) if integrated and float(integrated[-1])>-60 else None,
            'license':'CC0-1.0 source foley + original composition' if sources else 'Original project sound design',
            'sourceURL':list(sources),'layers':layers,'rebuild':'python scripts/build-effects-v2.py <external-cache> <v1-source-cache>'}
    RECORDS.append(result);AUDIO[id]=check
    return check

def main():
    CACHE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    # Direct primary-source pages and their CC0 license were inspected 2026-11-12.
    bell_path=fetch('3446','https://bigsoundbank.com/cloche-1h-s3446.html','Joseph SARDIN & Axeline T.')
    papers=[fetch(i,'https://bigsoundbank.com/'+page,'DavidGreck' if i=='0164' else 'Joseph SARDIN')
            for i,page in [('0164','turned-page-s0164.html'),('2213','pages-that-turn-6-s2213.html'),
                           ('2214','pages-that-turn-7-s2214.html'),('2211','pages-that-turn-4-s2211.html')]]
    coughs=[fetch(i,'https://bigsoundbank.com/man-cough-'+label+'-s'+i+'.html','Joseph SARDIN')
            for i,label in [('2181','3'),('2186','8'),('2187','9')]]
    # Reuse pinned v1 archives, verifying their established hashes before extracting.
    for filename,expected in [('kenney.zip','029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8'),
                              ('yelling.zip','e9100a4e3b9dcd146993089970dc6097dcf9935fa4683b196040012bad65d67a')]:
        assert sha(OLD/filename)==expected,'v1 source archive differs: '+filename
    kz=zipfile.ZipFile(OLD/'kenney.zip');assert 'Creative Commons Zero, CC0' in kz.read('License.txt').decode()
    yz=zipfile.ZipFile(OLD/'yelling.zip')
    def k(name):
        p=CACHE/(name+'.ogg');p.write_bytes(kz.read('Audio/'+name+'.ogg'));return decode(p)
    def voice(name):
        p=CACHE/(name+'.wav');p.write_bytes(yz.read('yelling sounds/'+name+'.wav'))
        return decode(p,'highpass=f=110,lowpass=f=8200,silenceremove=start_periods=1:start_threshold=-38dB')
    kurl='https://kenney.nl/assets/impact-sounds';vurl='https://opengameart.org/content/male-gruntyelling-sounds'
    gurl='https://opengameart.org/content/glass-break';burl=SOURCES[0]['page']
    wood=k('impactWood_heavy_001');metal=k('impactMetal_heavy_000');plate=k('impactPlate_heavy_001')
    light=k('impactMetal_light_001');punch=k('impactPunch_heavy_002');soft=k('impactSoft_heavy_000')
    glass=decode(OLD/'glass.wav')
    SOURCES.extend([{'id':'kenney-v1','page':kurl,'url':kurl,'author':'Kenney','license':'CC0-1.0','sha256':sha(OLD/'kenney.zip')},
                    {'id':'yelling-v1','page':vurl,'url':vurl,'author':'HaelDB and vocalists','license':'CC0-1.0','sha256':sha(OLD/'yelling.zip')},
                    {'id':'glass-v1','page':gurl,'url':gurl,'author':'TinyWorlds','license':'CC0-1.0','sha256':sha(OLD/'glass.wav')}])
    # One actual La Loupe bell stroke, not a synthesized sine replacement.
    night=decode(bell_path,'silenceremove=start_periods=1:start_threshold=-35dB,asetrate=32000,aresample=44100,highpass=f=55,lowpass=f=4200,equalizer=f=120:t=q:w=1.2:g=5')
    dawn=decode(bell_path,'silenceremove=start_periods=1:start_threshold=-35dB,asetrate=40000,aresample=44100,highpass=f=75,lowpass=f=8000,equalizer=f=420:t=q:w=1.2:g=2')
    # A separately lowered *recorded* body supplies the heavy bronze hum note;
    # keeping only the bright 400–500Hz partials sounds like a small handbell.
    night_body=decode(bell_path,'silenceremove=start_periods=1:start_threshold=-35dB,asetrate=10666,aresample=44100,highpass=f=60,lowpass=f=470,equalizer=f=137:t=q:w=1.1:g=6')
    dawn_body=decode(bell_path,'silenceremove=start_periods=1:start_threshold=-35dB,asetrate=12000,aresample=44100,highpass=f=65,lowpass=f=620,equalizer=f=153:t=q:w=1.1:g=4')
    night=mix(5.5,(env(night_body[:round(5.5*RATE)],.005,1.1),0,.8),(night,0,.35))
    dawn=mix(7.4,(env(dawn_body[:round(7.4*RATE)],.005,1.5),0,.6),(dawn,0,.55))
    emit('night-bell',night,['Real recorded bronze strike and 137Hz recorded hum-note body; tense dark balance, 5.5s resonant decay'],[burl],level=-5)
    emit('dawn-bell',dawn,['Real recorded bell and 153Hz recorded hum-note body; warmer dawn balance, 7.4s resonant decay'],[burl],level=-6)
    emit('gun-cock',trim(light,.12),['Kenney metal latch, short crisp mechanical cock'],[kurl],level=-13)
    oldshot=decode(ROOT/'apps/web/public/audio/effects/v1/shot.mp3','highpass=f=80,lowpass=f=10000')
    emit('shot',oldshot[:round(.85*RATE)],['Existing accepted impulse sharpened, no vocal or glass'],[kurl],level=-5)
    emit('glass-hit',glass[:round(.65*RATE)],['Recorded glass initial fracture'],[gurl],level=-7)
    emit('glass-shards',glass[round(.14*RATE):round(1.6*RATE)],['Recorded glass pieces and trailing debris'],[gurl],level=-12)
    for i,name in enumerate(['3grunt3','3grunt4','3grunt6'],1):
        emit('hurt-shot-'+str(i),trim(voice(name),.42),['Distinct recorded sharp male hurt vocal '+name+'; no deep low-pass'],[vurl],level=-9)
    for i,name in enumerate(['1yell3','2yell11','3yell1'],1):
        a=trim(voice(name));a=pitch(a,max(.8,min(1.2,len(a)/(1.35*RATE))))
        emit('hurt-night-'+str(i),a[:round(1.7*RATE)],['Distinct recorded longer night-death vocal '+name], [vurl],level=-11)
    for i,path in enumerate(coughs,1):
        a=trim(decode(path,'highpass=f=140,lowpass=f=7000'),.6)
        if len(a)<round(.3*RATE):a=np.pad(a,(0,round(.3*RATE)-len(a)))
        emit('cough-'+str(i),a,['Recorded single cough; symbolic poisoner-only feedback'],[SOURCES[4+i]['page']],level=-10)
    emit('guillotine-tension',mix(.6,(pitch(wood,1.3),0,.4),(pitch(plate,.8),.12,.2)),['Wood frame stress and rope-wheel tension'],[kurl],level=-17)
    emit('guillotine-unlock',trim(light,.18),['Small metal latch release'],[kurl],level=-13)
    emit('guillotine-blade',mix(.32,(air(.3,.6),0,1),(pitch(light,1.8),.02,.14)),['Fast blade air with steel whisper'],[kurl],level=-13)
    emit('guillotine-impact',mix(.85,(wood,0,.85),(punch,.008,.4),(pitch(plate,.68),.017,.15)),['Hard blade in wood, dry platform punch, no rope strangling'],[kurl],level=-5)
    emit('guillotine-wind',mix(1.3,(air(1.3,.4),0,1),(pitch(wood,1.1),.7,.08)),['Empty platform wind and drifting dust'],[kurl],level=-17)
    emit('poison-bottle',glass[:round(.6*RATE)],['Recorded bottle-like glass fracture'],[gurl],level=-10)
    emit('poison-bubbles',bubbles(1.2),['Authored gurgling liquid bubbles; bounded loop'],level=-15)
    # Real paper foley underlies wing flutter; separate air/root retain layering.
    paper_raw=[trim(decode(p),.8) for p in papers]
    flap=mix(.45,(pitch(paper_raw[0],.62),0,.7),(pitch(soft,.8),.025,.5),(air(.4,.2),.03,.4))
    emit('wing-flap',flap,['Recorded paper/cloth-like feather flutter and soft wing-root thump'],[SOURCES[1]['page'],kurl],level=-10)
    emit('wing-air',air(.65,.4),['Authored broad wing air displacement, no explosive boom'],level=-13)
    emit('wing-root',pitch(soft,.68)[:round(.35*RATE)],['Kenney soft flap body, low root pressure'],[kurl],level=-11)
    for direction,ratio in [('left',1.05),('right',.93)]:
        emit('slash-'+direction,mix(.45,(pitch(paper_raw[2],ratio),0,.6),(air(.3,.3),0,.7)),['Paper fibre rip texture and fast diagonal air, no confirmed kill vocal'],[SOURCES[3]['page']],level=-11)
    emit('blood-impact',mix(.35,(punch,0,.4),(bubbles(.23),.015,.65)),['Authored wet impact and recorded body punch; public death only'],[kurl],level=-13)
    emit('bone-crack',mix(.22,(pitch(wood,1.55),0,.75),(pitch(light,1.7),.02,.15)),['Recorded dry crack and short body resonance; public death only'],[kurl],level=-14)
    # Preserve the existing accepted Zira processing and tempo exactly.
    spoken=decode(OLD/'my-lord-raw.wav','silenceremove=start_periods=1:start_threshold=-45dB,asetrate=16000,aresample=44100,atempo=1.2,highpass=f=75,lowpass=f=3700,equalizer=f=170:t=q:w=1:g=4,aecho=0.7:0.6:48:0.12')
    spoken=trim(spoken,threshold=.003)
    emit('butler-voice',spoken,['Existing accepted My lord. voice; Microsoft Zira Desktop, original v1 processing, unchanged speaking tempo'],level=-9)
    voice_ms=round(len(spoken)/RATE*1000);hold=max(500,voice_ms+100)
    timing={'voiceAt':1450,'spokenDurationMs':voice_ms,'holdStart':1400,'holdMs':hold,'riseAt':1400+hold,
            'durationMs':max(4000,400+333+667+hold+667+167+900)}
    (OUT/'butler-timing.json').write_text(json.dumps(timing,indent=2)+'\n',encoding='utf-8')
    for i,a in enumerate(paper_raw,1):
        # Keep four different physical takes, rather than pitch-shifting noise.
        a=pitch(a,max(1,len(a)/(.58*RATE)))
        emit('paper-turn-'+str(i),a[:round(.6*RATE)],['Actual close-recorded paperback page turn, take '+str(i)], [SOURCES[i]['page']],level=-12)
    for i,a in enumerate(paper_raw[:2],1):emit('paper-lift-'+str(i),a[:round(.12*RATE)],['First lift of real paper'],[SOURCES[i]['page']],level=-27)
    uis=[('press',.05,soft,1.8),('select',.065,light,2.2),('open',.095,paper_raw[0],1.6),('close',.09,wood,1.8),
         ('success',.12,plate,2.4),('error',.14,soft,.8)]
    for name,d,a,p in uis:emit('ui-'+name,trim(pitch(a,p),d),['Short semantic '+name+' foley, not a nomination or preparation impact'],[kurl],level=-25)
    emit('nomination',trim(wood,.13),['Dry wooden gavel announcement'],[kurl],level=-18)
    emit('vote-stamp',mix(.16,(paper_raw[0][:round(.09*RATE)],0,.6),(soft,.035,.4)),['Paper stamp seal, distinct from nomination'],[SOURCES[1]['page'],kurl],level=-21)
    emit('shield',decode(ROOT/'apps/web/public/audio/effects/v1/shield.mp3'),['Recorded steel shield with established protection resonance'],[kurl],level=-12)
    for id in ['good','evil']:emit(id,decode(ROOT/f'apps/web/public/audio/effects/v1/{id}.mp3'),['Existing original '+id+' victory composition, separately mastered'],[kurl,vurl,gurl],level=-9)
    # The roles share real materials but have individually authored rhythms and tone.
    role_layers={
      'washerwoman':[(paper_raw[0],.65,.28),(bubbles(1.4),.72,.2),(soft,1.9,.2)],
      'librarian':[(wood,.65,.15),(paper_raw[1],.95,.4),(paper_raw[3],1.8,.3)],
      'investigator':[(paper_raw[2],.65,.3),(light,1.2,.2),(soft,1.9,.3)],
      'chef':[(wood,.65,.6),(pitch(wood,1.15),1,.55),(pitch(wood,.95),1.35,.65)],
      'empath':[(tone(.24,70,12,.6),.65,1),(tone(.22,80,13,.4),.88,1),(tone(.24,70,12,.6),1.45,1),(tone(1.2,220,2,.08),1.9,1)],
      'fortune_teller':[(glass[:round(.3*RATE)],.7,.14),(tone(2.2,293.66,1.1,.18),.95,1),(tone(1.1,440,2,.1),2.2,1)],
      'undertaker':[(pitch(wood,.82),.6,.45),(pitch(plate,.7),1.3,.2),(soft,1.9,.3)],
      'monk':[(air(.65),.5,1),(metal,.7,.55),(plate,1.25,.4)],
      'ravenkeeper':[(flap,.6,.6),(pitch(flap,1.3),1.1,.3),(paper_raw[3],1.9,.3)],
      'virgin':[(paper_raw[0],.65,.2),(soft,1.7,.2),(tone(1.4,523.25,3,.05),1.5,1)],
      'slayer':[(light,.65,.35),(wood,1.35,.15)],
      'soldier':[(metal,.75,.3),(plate,1.7,.35)],
      'mayor':[(wood,.65,.45),(light,1.7,.25)],
      'butler':[(paper_raw[3],.65,.15),(soft,1.6,.12)],
      'drunk':[(glass[:round(.25*RATE)],.65,.2),(bubbles(.6),1.4,.25)],
      'recluse':[(air(1.5),.65,.5),(paper_raw[1],1.4,.13)],
      'saint':[(soft,.65,.15),(tone(1.5,392,2,.06),1.1,1),(tone(1.4,523.25,2,.05),1.6,1)],
      'poisoner':[(glass[:round(.3*RATE)],.75,.25),(bubbles(1.2),1.1,.45)],
      'spy':[(light,.8,.22),(paper_raw[2],1.6,.35),(paper_raw[3],2.2,.25)],
      'scarlet_woman':[(tone(1.3,70,4,.15),.7,1),(flap,1.6,.3),(tone(1.3,110,2,.1),2.2,1)],
      'baron':[(pitch(wood,.9),.6,.25),(wood,.95,.2),(paper_raw[3],1.7,.3)],
      'imp':[(flap,.6,.55),(flap,.85,.65),(flap,1.1,.75),(air(.3),1.45,.8),(air(.3),1.75,.8)]}
    for role,parts in role_layers.items():emit('role-'+role,mix(2.6,*[(a,at-.5,gain)for a,at,gain in parts]),['Role '+role+' individually timed material choreography, scheduled at scene500ms; no hidden result or target voice'],[kurl,gurl,*[s['page'] for s in SOURCES[1:5]]],level=-8)
    manifest={'version':2,'builtAt':'2026-11-12','sources':SOURCES,'voice':{'text':'My lord.','generator':'Microsoft Zira Desktop; unchanged accepted v1 processing','originalSha256':sha(OLD/'my-lord-raw.wav')},
              'butlerTiming':timing,'files':RECORDS,'totalBytes':sum(x['bytes'] for x in RECORDS)}
    assert manifest['totalBytes']<8*1024*1024
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'count':len(RECORDS),'bytes':manifest['totalBytes'],'butlerTiming':timing,'sources':len(SOURCES)},indent=2),flush=True)

RECORDS=[];AUDIO={}
if __name__=='__main__':main()
