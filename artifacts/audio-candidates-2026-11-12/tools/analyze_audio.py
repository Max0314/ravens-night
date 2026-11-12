"""CPU CLAP semantic matching + librosa features + full-file FFmpeg loudness.

Scores are cosine similarities against disclosed prompts, never aesthetic ratings.
Long files are sampled at three recorded positions, not described as fully listened.
"""
import argparse, hashlib, importlib.metadata, json, math, pathlib, re, subprocess
import numpy as np
import librosa
import torch
from transformers import ClapModel, ClapProcessor

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEFAULT_MODEL=ROOT.parents[1]/'outputs/audio-tools/models/clap-htsat-unfused'
REVISION='8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a'
PROMPTS=[
 ('哥特管弦乐','Dark gothic orchestral music with dramatic strings and woodwinds.'),
 ('古典圆舞曲','Elegant classical waltz music with piano, strings and a dancing rhythm.'),
 ('稀疏钢琴','Slow sparse mysterious piano music with quiet pauses.'),
 ('古乐弓弦','Solemn medieval bowed string music with a continuous drone.'),
 ('弦乐张力','Suspenseful tense orchestral string music with trembling low notes.'),
 ('悠长暗色氛围','Dark eerie ambient music with long sustained drones.'),
 ('温暖抒情','Warm peaceful emotional instrumental music.'),
 ('明亮胜利','Triumphant uplifting orchestral victory music with brass and strings.'),
 ('强烈电子节奏','Electronic music with a strong pulsing beat and synthesizers.'),
 ('吉他氛围','Quiet mysterious guitar music with atmospheric synthesizers.'),
 ('钟琴水琴悬疑','Eerie slow music with vibraphone, waterphone and metallic resonances.'),
 ('人声合唱','Music with human singing or a choir.'),
 ('风声','The sound of wind blowing and gusting.'),
 ('洞穴幽鸣','An eerie cavern ambience with distant ghostly howls and rumbling.'),
 ('时钟滴答','A mechanical clock ticking rhythmically.'),
 ('炉火','The sound of a fire crackling and popping in a fireplace.'),
 ('群鸦','The sound of crows cawing outside.'),
 ('女性惨叫','A woman screaming loudly in pain and fear.'),
 ('男性惨叫','A man screaming loudly in pain and fear.'),
 ('痛苦闷哼','A person grunting and groaning in pain.'),
 ('身体重击','A heavy body being hit with a hard thud.'),
 ('湿润拍击','A wet squishing and splattering impact.'),
 ('碎裂','A sharp cracking and crunching sound.'),
 ('撕开','A rough ripping and tearing sound.'),
 ('挥击风声','A fast whooshing swishing sound of a weapon swinging through air.'),
 ('衣料摩擦','Cloth and fabric rustling and flapping.'),
 ('金属机关','Metal clinking, rattling, scraping and a mechanical latch clicking.'),
 ('剑刃','A metallic sword being drawn and striking.'),
 ('玻璃','Glass rattling, clinking and breaking.'),
 ('液体气泡','Liquid bubbling and gurgling.'),
 ('木头敲击','A wooden object being knocked and creaking.'),
 ('低沉长重音','A deep cinematic booming impact with a long ominous reverberant tail.'),
 ('钟声','A deep bronze church bell ringing with a long resonant decay.'),
 ('枪声','A loud gunshot with a sharp explosive attack.'),
 ('普通说话','A person speaking words in a normal conversational voice.'),
]

def ff(cmd):
    return subprocess.run(cmd,check=True,capture_output=True)

def decode(path,start=0,duration=None):
    cmd=['ffmpeg','-v','error','-ss',str(start),'-i',str(path)]
    if duration is not None:cmd+=['-t',str(duration)]
    return np.frombuffer(ff(cmd+['-ac','1','-ar','48000','-f','f32le','-']).stdout,dtype='<f4').copy()

def finite(value):
    f=float(value)
    return round(f,3) if math.isfinite(f) else None

def main():
    args=argparse.ArgumentParser();args.add_argument('--model',type=pathlib.Path,default=DEFAULT_MODEL)
    args.add_argument('--ids',nargs='*');options=args.parse_args()
    torch.set_num_threads(4);torch.manual_seed(20261112);np.random.seed(20261112)
    model=ClapModel.from_pretrained(options.model,local_files_only=True).eval()
    processor=ClapProcessor.from_pretrained(options.model,local_files_only=True)
    with torch.inference_mode():
        text=model.get_text_features(**processor(text=[x[1] for x in PROMPTS],padding=True,return_tensors='pt'))
        text=torch.nn.functional.normalize(text,dim=-1)
    assets=json.loads((ROOT/'catalog.json').read_text(encoding='utf8'))['assets']
    report_path=ROOT/'analysis.json'
    report=json.loads(report_path.read_text(encoding='utf8')) if report_path.exists() else {}
    results=report.get('assets',{})
    report.update(model='laion/clap-htsat-unfused',model_revision=REVISION,
                  method='Mean cosine similarity of L2-normalized audio/text embeddings; no softmax; top labels are relative to this prompt list.',
                  prompts=PROMPTS,versions={x:importlib.metadata.version(x) for x in ['torch','transformers','librosa','numpy','soundfile']},assets=results)
    for row in assets:
        if options.ids and row['id'] not in options.ids:continue
        path=ROOT/row['file'];digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if results.get(row['id'],{}).get('sha256')==digest:
            print('REUSE',row['id'],flush=True);continue
        probe=json.loads(ff(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]).stdout)
        stream=next(s for s in probe['streams'] if s['codec_type']=='audio');duration=float(probe['format']['duration'])
        if duration>35:offsets=[min(15,duration/10),max(0,duration/2-5),max(0,duration-20)]
        elif duration>12:offsets=[0,max(0,duration/2-5),max(0,duration-10)]
        else:offsets=[0]
        excerpts=[decode(path,at,min(10,duration-at)) for at in offsets]
        if any(len(x)==0 for x in excerpts):raise ValueError('Empty decoded audio: '+row['id'])
        with torch.inference_mode():
            features=model.get_audio_features(**processor(audio=excerpts,sampling_rate=48000,return_tensors='pt'))
            features=torch.nn.functional.normalize(features,dim=-1)
            per_segment=(features@text.T).cpu().numpy();scores=per_segment.mean(axis=0)
        top=np.argsort(scores)[::-1][:5]
        sample=librosa.resample(np.concatenate(excerpts),orig_sr=48000,target_sr=22050)
        centroid=float(np.mean(librosa.feature.spectral_centroid(y=sample,sr=22050)))
        flatness=float(np.mean(librosa.feature.spectral_flatness(y=sample)))
        rms=librosa.feature.rms(y=sample)[0]
        tempo=None
        if row['kind']=='music':
            envelope=librosa.onset.onset_strength(y=sample,sr=22050)
            tempo=float(librosa.feature.tempo(onset_envelope=envelope,sr=22050)[0])
        loud=ff(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af',
                 'loudnorm=I=-23:TP=-2:LRA=11:print_format=json','-f','null','-']).stderr.decode(errors='replace')
        matches=re.findall(r'\{\s*"input_i".*?\}',loud,re.S)
        if not matches:raise ValueError('No loudness measurements: '+row['id'])
        loudness=json.loads(matches[-1])
        results[row['id']]={'file':row['file'],'sha256':digest,'decoded':True,'duration_seconds':round(duration,3),
            'sample_rate':int(stream['sample_rate']),'channels':stream['channels'],'codec':stream['codec_name'],
            'integrated_lufs':finite(loudness['input_i']),'true_peak_dbtp':finite(loudness['input_tp']),
            'loudness_range_lu':finite(loudness['input_lra']),
            'sampled_feature_offsets_seconds':[round(x,3) for x in offsets],
            'sampled_excerpt_length_max_seconds':10,
            'spectral_centroid_hz_sampled':round(centroid,1),'spectral_flatness_sampled':round(flatness,5),
            'rms_p90_p10_ratio_sampled':round(float(np.percentile(rms,90)/max(np.percentile(rms,10),1e-8)),3),
            'tempo_bpm_estimate_sampled':round(tempo,1) if tempo else None,
            'clap_top5':[{'label_zh':PROMPTS[i][0],'prompt_en':PROMPTS[i][1],'cosine':round(float(scores[i]),4)} for i in top],
            'clap_segment_top1':[{'offset_seconds':round(at,3),'label_zh':PROMPTS[int(np.argmax(s))][0]} for at,s in zip(offsets,per_segment)]}
        report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print('ANALYZED',row['id'],round(duration,2),results[row['id']]['clap_top5'][:2],flush=True)

if __name__=='__main__':main()
