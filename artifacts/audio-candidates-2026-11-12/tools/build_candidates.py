"""Extract new source takes and render audition mixes, without runtime integration."""
import hashlib, json, math, pathlib, shutil, subprocess
import numpy as np
from scipy.signal import butter, sosfilt
from collect_sources import ROOT,CACHE,sha

SR=48000
def decode(path,start=0,duration=None):
    cmd=['ffmpeg','-v','error','-ss',str(start),'-i',str(path)]
    if duration:cmd+=['-t',str(duration)]
    return np.frombuffer(subprocess.check_output(cmd+['-ac','1','-ar',str(SR),'-f','f32le','-']),dtype='<f4').copy()

def edge(a,attack=.003,release=.04):
    a=a.copy();n=min(len(a)//2,round(attack*SR));r=min(len(a)//2,round(release*SR))
    if n:a[:n]*=np.linspace(0,1,n).reshape((-1,)+(1,)*(a.ndim-1))
    if r:a[-r:]*=np.linspace(1,0,r).reshape((-1,)+(1,)*(a.ndim-1))
    return a

def trim(a):
    active=np.flatnonzero(np.abs(a)>max(.001,np.max(np.abs(a))*.012))
    return edge(a[max(0,active[0]-240):min(len(a),active[-1]+2000)]) if len(active) else a

def normalized(a,peak=.707):
    return a*(peak/max(float(np.max(np.abs(a))),1e-8))

def mix(seconds,parts,stereo=False):
    out=np.zeros((round(seconds*SR),2) if stereo else round(seconds*SR),np.float32)
    for a,at,gain,pan in parts:
        start=round(at*SR);a=a[:len(out)-start]
        if stereo:
            angle=(pan+1)*math.pi/4
            out[start:start+len(a),0]+=a*gain*math.cos(angle)
            out[start:start+len(a),1]+=a*gain*math.sin(angle)
        else:out[start:start+len(a)]+=a*gain
    return out

def repeat(a,seconds,overlap=.15):
    out=np.zeros(round(seconds*SR),np.float32);fade=min(round(overlap*SR),len(a)//5)
    a=edge(a,fade/SR,fade/SR);step=len(a)-fade
    for at in range(0,len(out),step):out[at:at+min(len(a),len(out)-at)]+=a[:min(len(a),len(out)-at)]
    return out

def main():
    catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf8'));rows={r['id']:r for r in catalog['assets']}
    archives={r['slug']:r for r in json.loads((ROOT/'source-archives.json').read_text(encoding='utf8'))}
    def register(id,kind,slug,zh,usage,description,a,parents,processing,license=None):
        file=f'{kind}/{id}__{kind}_{slug}__candidate-v01.mp3';target=ROOT/file;target.parent.mkdir(exist_ok=True)
        a=normalized(a);channels=2 if a.ndim==2 else 1
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(channels),'-i','-',
                        '-c:a','libmp3lame','-b:a','192k',str(target)],input=a.astype('<f4').tobytes(),check=True)
        licenses=sorted(set(p['license'] for p in parents))
        row={'id':id,'kind':kind,'file':file,'title':slug,'name_zh':zh,'usage':usage,'description':description,
             'author':'Ravens audition edit; sources: '+'; '.join(dict.fromkeys(p['author'] for p in parents)),
             'license':license or ('CC0-1.0' if licenses==['CC0-1.0'] else 'CC-BY-3.0'),
             'license_url':'https://creativecommons.org/publicdomain/zero/1.0/' if licenses==['CC0-1.0'] else 'https://creativecommons.org/licenses/by/3.0/',
             'source_pages':list(dict.fromkeys(url for p in parents for url in p.get('source_pages',[p.get('source_page','')]) if url)),
             'source_ids':[p['id'] for p in parents], 'processing':processing,
             'bytes':target.stat().st_size,'sha256':sha(target)}
        rows[id]=row;print('BUILT',id,round(len(a)/SR,2),flush=True);return row
    def extract(id,slug,archive,member,zh,usage,description):
        src=archives[archive];base=pathlib.Path(src['extracted_to']) if 'extracted_to' in src else CACHE/'wet-towel'
        original=base/member
        parent={'id':archive+':'+member,'author':src['author'],'license':src['license'],'source_page':src['source_page']}
        a=trim(decode(original))
        row=register(id,'foley',slug,zh,usage,description,a,[parent],
                     '从源包提取 '+member+'；去首尾静音，3ms/40ms淡入淡出，峰值-3dBFS，192kbps MP3。')
        row.update(source_archive_sha256=src['sha256'],source_member=member,source_member_sha256=sha(original))
        return row
    # Six independent recorded pain takes from a new performer.
    voice=archives['pain-sounds-by-emopreben']
    for i,member in enumerate(voice['members'],3):
        source=pathlib.Path(voice['extracted_to'])/member
        parent={'id':'pain-sounds-by-emopreben:'+member,'author':voice['author'],'license':'CC0-1.0','source_page':voice['source_page']}
        row=register(f'V{i:02}','voice',f'male-pain-take-{i-2:02}','男声痛叫 '+str(i-2),'枪击／处刑死亡人声候选',
                     'EmoPreben的独立痛苦表演录音；保留不同发声方式，须比较是否足够爆发而非闷哼。',trim(decode(source)),[parent],
                     '去首尾静音，保持原音高与速度，峰值-3dBFS，192kbps MP3。')
        row.update(source_archive_sha256=voice['sha256'],source_member=member,source_member_sha256=sha(source))
    specs=[
      ('F01','weapon-swish-short','swishes-sound-pack','swishes/swish-1.wav','短促挥击','恶魔挥爪／刀刃空气','独立挥击空气材质；与接触和撕裂分开试听。'),
      ('F02','weapon-swish-heavy','swishes-sound-pack','swishes/swish-7.wav','重挥击','恶魔第二抓／处刑下落','另一条真实素材，用于区分两次动作。'),
      ('F03','heavy-cloth','rpg-sound-pack','RPG Sound Pack/inventory/cloth-heavy.wav','厚衣料','展翼／管家','重衣料摩擦材质，作为翼膜和服装候选。'),
      ('F04','steel-draw','rpg-sound-pack','RPG Sound Pack/battle/sword-unsheathe2.wav','钢刃出鞘','处刑／猎手准备','钢铁抽动材质候选，适合动作准备阶段。'),
      ('F05','metal-ring','rpg-sound-pack','RPG Sound Pack/inventory/metal-ringing.wav','金属余鸣','护盾／机关','金属持续共鸣，作为精致余音材料。'),
      ('F06','glass-bottle','rpg-sound-pack','RPG Sound Pack/inventory/bottle.wav','瓶体接触','投毒／酒鬼','独立瓶体材质，避免把所有瓶子都做成玻璃破碎。'),
      ('F07','liquid-bubbles','rpg-sound-pack','RPG Sound Pack/inventory/bubble2.wav','液体冒泡','投毒／药液','另一组液体气泡素材候选。'),
      ('F08','wood-knock','rpg-sound-pack','RPG Sound Pack/inventory/wood-small.wav','木质落点','提名／砧板／投票','短木质接触，可比较机关与道具的实体感。'),
      ('F09','wet-impact-a','40-wet-towel-clubpoundhitattack-sounds','wet_towel_on_body/wet_towel_on_body-04.flac','湿润冲击 A','死亡／挥爪接触','湿毛巾接触身体的拟音，作为湿润接触材质。'),
      ('F10','wet-impact-b','40-wet-towel-clubpoundhitattack-sounds','wet_towel_on_body/wet_towel_on_body-15.flac','湿润冲击 B','死亡／挥爪接触','同套录音的另一条独立拍击。'),
      ('F11','wet-impact-c','40-wet-towel-clubpoundhitattack-sounds','wet_towel_on_body/wet_towel_on_body-30.flac','湿润冲击 C','死亡／挥爪接触','第三条独立拍击，避免完全重复。'),
      ('F12','chainmail','rpg-sound-pack','RPG Sound Pack/inventory/chainmail1.wav','甲片与链甲','士兵／护盾','细碎金属活动材质，不与主重击争抢起音。'),
    ]
    for spec in specs:extract(*spec)
    rip_source=CACHE/'bigsoundbank-0013-cloth-rip.mp3'
    if not rip_source.exists():rip_source=rip_source.with_suffix('.mp3.part')
    rip_parent={'id':'bigsoundbank-0013','author':'Joseph SARDIN','license':'CC0-1.0','source_page':'https://bigsoundbank.com/tissu-s0013.html'}
    row=register('F13','foley','real-cloth-rip-excerpt','真实布料撕开·摘录','恶魔撕裂／翼膜',
                 '录音棚真实布料短撕与长撕的前4.5秒摘录；原始10秒下载未完整保存，当前摘录已重新编码为完整可播放文件。',
                 edge(decode(rip_source,0,4.5),.003,.03),[rip_parent],
                 '从已下载前段解码摘录4.5s，3/30ms首尾淡化，峰值-3dBFS；完整源页提供10s原录音。')
    row.update(download_url='https://bigsoundbank.com/UPLOAD/mp3/0013.mp3',downloaded_source_complete=rip_source.suffix!='.part',
               downloaded_source_bytes=rip_source.stat().st_size,downloaded_source_sha256=sha(rip_source))
    def asset(id,start=0,duration=None):return decode(ROOT/rows[id]['file'],start,duration)
    body=normalized(trim(asset('S01',.46,.32)));bone=trim(asset('S02',.60,.95));cloth=trim(asset('S03',1.07,.66))
    rip_a=normalized(trim(asset('F13',.8,.3)));rip_b=normalized(trim(asset('F13',2.17,.5)))
    a=mix(.95,[(asset('F01'),0,.3,-.45),(rip_a,.08,1.,-.5),(asset('F09'),.11,.35,-.4),(bone,.13,.08,-.5)],True)
    register('D01','designed','claw-left-dry-impact','左抓·干脆接触','恶魔提交动作试听',
             '挥击风声后接真实布料撕开、湿润拍击与少量粗粝碎裂，声像偏左；未使用旧版撕裂轨。',a,[rows[x] for x in ['F01','F13','F09','S02']],
             '空气0ms、布料80ms、湿润110ms、碎裂130ms；左侧声像约-0.45；峰值-3dBFS。')
    a=mix(1.05,[(asset('F02'),0,.3,.45),(rip_b,.1,1.,.5),(asset('F10'),.14,.35,.4),(bone,.12,.08,.5)],True)
    register('D02','designed','claw-right-wet-impact','右抓·湿润重击','恶魔提交动作试听',
             '另一条挥击接不同段落的真实布料撕开与湿润撞击，声像偏右。',a,[rows[x] for x in ['F02','F13','F10','S02']],
             '空气0ms、布料100ms、碎裂120ms、湿润140ms；右侧声像约+0.45；峰值-3dBFS。')
    for id,voice_id,zh in [('D03','V04','死亡·男声直接冲击'),('D04','V01','死亡·女声直接冲击')]:
        vocal=trim(asset(voice_id));vocal=edge(vocal[:round(1.2*SR)],.002,.035)
        a=mix(max(1.15,len(vocal)/SR+.1),[(body,0,.45,0),(vocal,.015,.95,0),(asset('F11'),.025,.16,0)])
        register(id,'designed','death-'+('male' if id=='D03' else 'female')+'-direct-impact',zh,'公开死亡音效试听',
                 '重击与短促人声几乎同时爆发，保留突然结束的决定感；仅为死亡配音候选，未接入任何游戏事件。',a,[rows[x] for x in ['S01',voice_id,'F11']],
                 '身体0ms、人声15ms、湿润25ms；人声最多1.2s，短尾；整体峰值-3dBFS。')
    a=mix(1.35,[(asset('F04'),0,.22,0),(body,.26,.9,0),(bone,.265,.25,0)])
    register('D05','designed','execution-steel-body-impact','处刑·钢刃与沉重落点','处刑接触试听',
             '钢铁准备声接身体重击和短碎裂；不含人声，方便单独选择惨叫。',a,[rows[x] for x in ['F04','S01','S02']],
             '钢铁0ms，落点260ms，碎裂265ms；整体峰值-3dBFS。')
    a=mix(2.0,[(cloth,0,.6,-.2),(asset('F03'),.25,.5,.2),(asset('F02'),.45,.22,0)],True)
    register('D06','designed','wing-membrane-unfold','展翼·膜翼展开','恶魔展翼试听',
             '两种衣料与挥动空气组合成翼膜活动的候选；听感需人工确认，不声称是真实蝙蝠录音。',a,[rows[x] for x in ['S03','F03','F02']],
             '衣料0/250ms，空气450ms，轻度声像分布；整体峰值-3dBFS。')
    a=mix(2.4,[(asset('F06'),0,.45,0),(asset('F07'),.35,.5,0),(asset('F07'),.95,.3,0)])
    register('D07','designed','poison-glass-liquid-ritual','投毒·瓶体与药液','投毒提交试听',
             '清楚的瓶体接触后出现两次液体活动，不加入咳嗽或成功暗示。',a,[rows[x] for x in ['F06','F07']],
             '瓶体0ms，液体350/950ms；整体峰值-3dBFS。')
    for id,start,duration,zh in [('L02',0,15,'暗色长重音·第一式'),('L03',22,16,'暗色长重音·第二式'),('L04',44,20,'暗色长重音·第三式')]:
        register(id,'long-effects','dark-resonance-'+id.lower(),zh,'身份揭幕／继任／终局转场',
                 '从Marcelo Fernandez长重音合集单独截出一式，保留悠长衰减，方便与连续配乐分开比较。',edge(asset('L01',start,duration),.003,.3),[rows['L01']],
                 f'源文件{start}s起截取{duration}s，300ms收尾，峰值-3dBFS。')
    wind=repeat(asset('A02'),90,.8);fire=repeat(asset('A04'),90,.15);clock=repeat(asset('A03'),90,0)
    lowfire=sosfilt(butter(2,4000,fs=SR,output='sos'),fire).astype(np.float32)
    a=mix(90,[(wind,0,.18,-.2),(asset('A01',0,90),0,.38,.15),(asset('A05'),37,.065,.5)],True)
    register('A06','ambience','night-tower-soundscape-90s','钟楼之夜·90秒氛围','夜晚／首页暗景',
             '风底、暗穴持续层与一次远鸦组成长氛围；以空间感为主，没有新增旋律，首尾淡化，尚非无缝循环定稿。',edge(a,1,2),[rows[x] for x in ['A02','A01','A05']],
             '风0.18、暗穴0.38、37s远鸦0.065；90s立体声，1s/2s淡入淡出，峰值-3dBFS。')
    a=mix(90,[(lowfire,0,.5,.1),(clock,0,.065,-.3),(wind,0,.035,.2)],True)
    register('A07','ambience','hall-hearth-clock-90s','古宅厅堂·90秒氛围','大厅／白天室内',
             '近处炉火、轻机械滴答与极淡风底；短炉火录音做交叠延展，可能听出重复，供试听判断。',edge(a,1,2),[rows[x] for x in ['A04','A03','A02']],
             '炉火4kHz低通、150ms交叠；滴答8s整段重复；90s立体声，1s/2s首尾淡化，峰值-3dBFS。')
    # Keep the user's accepted bell byte-for-byte as a reference only.
    source=ROOT.parents[1]/'apps/web/public/audio/effects/v2/night-bell.mp3'
    target=ROOT/'reference/R01__reference_accepted-night-bell__unchanged.mp3';target.parent.mkdir(exist_ok=True);shutil.copyfile(source,target)
    rows['R01']={'id':'R01','kind':'reference','file':target.relative_to(ROOT).as_posix(),'title':'accepted-night-bell','name_zh':'已认可钟声·参考',
                 'usage':'音色与空间参考','description':'用户满意的现有入夜钟声，逐字节复制作为听感基准。','author':'Joseph SARDIN & Axeline T.; existing Ravens mix',
                 'license':'CC0-1.0','license_url':'https://creativecommons.org/publicdomain/zero/1.0/',
                 'source_page':'https://bigsoundbank.com/cloche-1h-s3446.html','processing':'从现有v2原样复制，不改动游戏文件。',
                 'bytes':target.stat().st_size,'sha256':sha(target)}
    rows['S01']['description']='厚书包裹毛巾模拟身体落地，用Zoom H4N录制，多次动作；并非真实伤害录音。'
    catalog['assets']=sorted(rows.values(),key=lambda r:r['id'])
    (ROOT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':main()
