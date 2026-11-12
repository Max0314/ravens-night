"""Download attributed candidates and cache source archives outside the repository."""
import concurrent.futures, hashlib, json, pathlib, shutil, urllib.parse, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = pathlib.Path.home()/'.codex/tools/ravens-night-audio/source-cache'
CACHE.mkdir(parents=True, exist_ok=True)
MUSIC = [
 ('M01','home','Moonlight Hall','月下大厅','首页／身份揭幕','管弦乐与木管推动的神秘叙事，后段更活跃；作为有旋律的首页候选，须试听是否偏诙谐。'),
 ('M02','lobby','Darkest Child','暗夜童谣','大厅备选／身份揭幕','钢片琴、竖琴与低弦形成阴暗童谣；旋律辨识度高，需判断是否偏童话恐怖。'),
 ('M03','day-discussion','Comfortable Mystery','安静的疑云','白天讨论','缓慢电钢琴下行分解音，留白较多；作为轻量讨论底乐，复古音色需要与画面核对。'),
 ('M04','first-night','Air Prelude','初夜前奏','身份发放／首夜','长笛与合成纹理构成缓慢的神秘气氛，适合进入秘密的过渡。'),
 ('M05','night','Night of Chaos','混沌之夜','夜晚等待／行动间隙','柔和吉他上覆盖不安的合成器与弦乐；用于比较温柔表层与暗流的效果。'),
 ('M06','vote-tension','Distant Tension','远处的张力','提名／投票／处刑前','弦乐、颤动低音与钟琴交织，适合持续增加不安感。'),
 ('M07','sustained-dread','Long note One','漫长的弦影','长时间等待／夜间氛围','低音弦乐与小提琴的悠长持续层，旋律存在感弱，适合作为长音设计的参照。'),
 ('M08','death-aftermath','Ghost Story','幽灵故事','死亡揭晓之后／记录','颤音琴、水琴与钢琴的稀疏悬疑织体；有两个乐段，不是单一循环。'),
 ('M09','dawn-unease','Lightless Dawn','无光的黎明','黎明／结果揭晓','弦乐、合成器、打击乐和铃声组成的阴暗持续音乐；避免与保留钟声叠得过密。'),
 ('M10','good-finale','Virtutes Instrumenti','古老的光','善良胜利／终局回顾','古乐风格弓弦与持续低音，庄严、缓慢；偏肃穆收束，需试听是否满足胜利感。'),
 ('M11','evil-finale','Gathering Darkness','黑暗聚集','邪恶胜利／终局余波','合成器形成刺耳、碎动的噩梦气氛；作为强压迫备选，可能不够优雅。'),
 ('M12','dark-pulse','Dark Fog','暗雾脉动','投票备选／危机升级','合成器和打击乐的暗色节奏，力度较明确；作为爽感较强的对照候选。'),
]
SINGLE = [
 ('A01','ambience','night-cavern','dark-cavern-ambient',1,'暗穴长氛围','夜晚／恶魔空间','持续的洞穴式黑暗氛围，作者注明此版本为连续循环；需试听是否过于地下城化。'),
 ('A02','ambience','tower-wind','wind1',0,'钟楼风底','夜晚／空刑架','PureData合成的一分钟风声，可作为风底候选；并非现场录音。'),
 ('A03','ambience','clock-mechanism','ticking-clock',0,'机械滴答','大厅／投票等待','机械时钟滴答原始素材，可用于节奏参照；避免持续抢占对话。'),
 ('A04','ambience','hearth-fire','fire-crackling',0,'炉火细响','大厅／白天室内','火焰燃烧的细碎声，用于温暖近处空间。'),
 ('A05','ambience','distant-crows','crows-singing',0,'群鸦远鸣','首页／夜幕转换','乌鸦叫声环境素材，适合稀疏点缀；不建议整段高频重复。'),
 ('V01','voice','female-death-scream','female-scream-1',0,'女声惨叫','死亡人声候选','AuraVoice发布的真实表演录音；用于比较自然爆发与当前泛用惨叫。'),
 ('V02','voice','female-horror-scream-sequence','female-high-pitched-scream-sfx',0,'女声恐惧叫声组','死亡人声备选','四种音高的恐惧喊叫合集；不是四位不同演员，需先分段再判断适配。'),
 ('S01','foley','body-fall-sequence','body-hitting-ground',0,'身体落地声组','死亡落地／身体冲击','身体撞击地面的独立材质，可为死亡补充重量，原文件可能包含多次动作。'),
 ('S02','foley','bone-crunch-sequence','crunching-bones',0,'骨质碎裂声组','死亡／恶魔接触层','干脆的碎裂材质候选；需要控制用量，避免持续咀嚼感。'),
 ('S03','foley','cloth-swing-sequence','cloth-swing-sounds',2,'衣料挥动声组','展翼／管家衣料／挥击','真实录制衣料挥动，可作为翼膜和动作空气层的材料，不能直接声称是翅膀录音。'),
 ('L01','long-effects','dark-long-hits-sequence','dark-long-hits',0,'黑暗长重音组','身份揭晓／继任／终局','有持续余音的暗色重音合集，作为长音效与音乐转场参照。'),
]
ARCHIVES = ['pain-sounds-by-emopreben','hurt-death-sound-effect-for-character',
            'rpg-sound-pack','swishes-sound-pack','40-wet-towel-clubpoundhitattack-sounds']

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def download(url,path,expected_size=None,expected_sha1=None):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.part')
    if tmp.exists() and expected_sha1 and hashlib.sha1(tmp.read_bytes()).hexdigest()==expected_sha1:
        tmp.replace(path)
    if not path.exists():
        req=urllib.request.Request(url,headers={'User-Agent':'RavensNightAudioResearch/1.0'})
        with urllib.request.urlopen(req,timeout=30) as response, tmp.open('wb') as target:
            remaining=expected_size or int(response.headers.get('Content-Length') or 0)
            if remaining:
                while remaining:
                    block=response.read(min(65536,remaining))
                    if not block:raise IOError('Incomplete download')
                    target.write(block);remaining-=len(block)
            else:shutil.copyfileobj(response,target)
        tmp.replace(path)
    if expected_sha1 and hashlib.sha1(path.read_bytes()).hexdigest()!=expected_sha1:
        raise ValueError('Source SHA1 mismatch: '+str(path))
    return path

def main():
    music={m['title']:m for m in json.loads((CACHE/'pieces.json').read_text(encoding='utf8'))}
    effects={m['slug']:m for m in json.loads((ROOT/'research-effects.json').read_text(encoding='utf8'))}
    jobs=[]
    for id,scene,title,zh,usage,description in MUSIC:
        m=music[title]; slug=title.lower().replace(' ','-')
        file=f'music/{id}__music_{scene}__{slug}__Kevin-MacLeod__full-v01.mp3'
        jobs.append({'id':id,'kind':'music','file':file,'title':title,'name_zh':zh,'usage':usage,
                     'description':description,'author':'Kevin MacLeod','license':'CC-BY-3.0',
                     'license_url':'https://creativecommons.org/licenses/by/3.0/',
                     'source_page':'https://incompetech.com/music/royalty-free/index.html?isrc='+m['isrc'],
                     'download_url':'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'+urllib.parse.quote(m['filename']),
                     'source_instruments':m['instruments'],'source_bpm':m['bpm'],'isrc':m['isrc'],
                     'processing':'原始完整MP3，仅重命名；未归一化，未宣称无缝循环。'})
    for id,kind,slug,source,index,zh,usage,description in SINGLE:
        m=effects[source];url=m['files'][index];extension=pathlib.PurePosixPath(urllib.parse.urlparse(url).path).suffix
        license_url=m['license_urls'][0].replace('http:','https:')
        author=m['author'][0]
        if source=='female-scream-1':author='AuraVoice (Nocturnal_Vanguard)'
        jobs.append({'id':id,'kind':kind,'file':f'{kind}/{id}__{kind}_{slug}__source-v01{extension}',
                     'title':source,'name_zh':zh,'usage':usage,'description':description,'author':author,
                     'license':'CC0-1.0' if 'publicdomain/zero' in license_url else 'CC-BY-3.0',
                     'license_url':license_url,'source_page':m['page'],'download_url':url,
                     'processing':'原始文件，仅重命名。'})
    def run(row):
        if row['kind']=='music':
            # Author downloads timed out locally; use Commons' licensed archival copy,
            # preserving that copy's original CC BY 3.0 license and provenance.
            m=music[row['title']]
            title='File:'+('Long note One' if m['isrc']=='USUAN1100418' else m['filename'][:-4])+' (ISRC '+m['isrc']+').mp3'
            params=urllib.parse.urlencode({'action':'query','titles':title,'prop':'imageinfo','iiprop':'url|extmetadata|size|sha1','format':'json'})
            verified=CACHE/('commons-verified-'+m['isrc']+'.json')
            cached=CACHE/('commons-'+m['isrc']+'.json')
            cached_valid=cached.exists() and 'imageinfo' in next(iter(json.loads(cached.read_text(encoding='utf8'))['query']['pages'].values()))
            metadata_path=verified if verified.exists() else cached if cached_valid else download('https://commons.wikimedia.org/w/api.php?'+params,verified)
            response=json.loads(metadata_path.read_text(encoding='utf8'))
            page=next(iter(response['query']['pages'].values()))
            info=page['imageinfo'][0];metadata=info['extmetadata']
            if metadata['LicenseShortName']['value']!='CC BY 3.0':raise ValueError('Unexpected mirror license: '+title)
            if 'Kevin MacLeod' not in metadata['Artist']['value']:raise ValueError('Unexpected author')
            row['author_download_url']=row['download_url']
            row['download_url']=info['url'].split('?')[0]
            row['mirror_page']=info['descriptionurl']
            if 'sha1' in info:row['source_sha1']=info['sha1']
            if 'size' in info:row['source_size']=info['size']
        path=download(row['download_url'],ROOT/row['file'],row.get('source_size'),row.get('source_sha1'))
        row.update(bytes=path.stat().st_size,sha256=sha(path))
        print('SAVED',row['id'],path.name,row['bytes'],flush=True)
        return row
    def logged(row):
        try:return run(row)
        except Exception as exc:
            print('DOWNLOAD_FAILED',row['id'],str(exc),flush=True)
            return {'id':row['id'],'error':str(exc)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(logged,sorted(jobs,key=lambda x:x['kind']=='music')))
    rows=sorted([r for r in results if 'error' not in r],key=lambda r:r['id'])
    (ROOT/'download-errors.json').write_text(json.dumps([r for r in results if 'error' in r],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (ROOT/'catalog.json').write_text(json.dumps({'version':1,'date':'2026-11-12','status':'候选，未接入游戏，待人工试听','assets':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    archives=[]
    for slug in ARCHIVES:
        m=effects[slug];url=m['files'][0];path=download(url,CACHE/urllib.parse.unquote(url.rsplit('/',1)[-1]))
        row={'slug':slug,'path':str(path),'sha256':sha(path),'source_page':m['page'],
             'download_url':url,'license':'CC0-1.0','license_url':m['license_urls'][0],'author':m['author'][0]}
        if path.suffix=='.zip':
            folder=CACHE/slug;folder.mkdir(exist_ok=True)
            with zipfile.ZipFile(path) as archive:
                for member in archive.infolist():
                    destination=(folder/member.filename).resolve()
                    if not destination.is_relative_to(folder.resolve()):raise ValueError('Unsafe archive member')
                archive.extractall(folder)
            row['extracted_to']=str(folder)
            row['members']=[p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file()]
        archives.append(row)
        print('ARCHIVE',slug,len(row.get('members',[])),flush=True)
    (ROOT/'source-archives.json').write_text(json.dumps(archives,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':main()
