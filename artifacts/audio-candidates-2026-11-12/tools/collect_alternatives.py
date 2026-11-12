"""Collect available author-published CC0 music after the archive rate limit."""
import concurrent.futures, json, pathlib, shutil, subprocess, urllib.parse
from collect_sources import ROOT,CACHE,download,sha

CHOICES=[
 ('M13','home-mystery','mysterious',0,'迷雾与弦影','首页／身份揭幕','弦乐与合唱音色的神秘主题；作者描述带一点诡异嘉年华感，需要比较是否适合严肃气质。'),
 ('M14','night-ritual','ancient-mysteries',0,'古老的谜','首夜／情报揭晓','作者为谜境创作的持续旋律，带空间回声；作者提供循环版本，本文件取循环版。'),
 ('M15','vote-investigation','unsolved-investigation',0,'未解的调查','提名／投票／讨论升级','暗色、悬疑的电影配乐候选；用于比较张力和讨论可听性。'),
 ('M16','day-haunting-piano','haunting-piano',0,'萦绕的钢琴','白天讨论／黎明／死亡之后','钢琴主题候选，适合安静悬疑或回顾；需要人工确认旋律情绪与重复耐听程度。'),
 ('M17','evil-nightmare','a-wonderful-nightmare',0,'美妙的噩梦','邪恶胜利／夜晚备选','幽异主题候选，保留旋律辨识度；作为戏剧性邪恶气氛的对照。'),
 ('M18','night-shrine','dark-shrine-loop',2,'暗色圣所','夜晚等待／僧侣仪式','qubodup对yd的Shrine所做的暗色循环变奏；适合宗教建筑与秘密仪式。'),
 ('M19','ritual-latin-voice','breves-dies-hominis',0,'短暂的人世','身份仪式／终局回顾备选','Magdalen Kadel演唱中世纪拉丁文作品的独唱录音；含可辨歌词，不宜作为普通讨论底乐。'),
 ('M21','night-prowler','night-prowler',0,'暗夜潜行','夜晚／紧张等待','暗夜主题音乐候选；通过模型与实际试听再判断节奏是否过强。'),
]

def main():
    sources={r['slug']:r for r in json.loads((ROOT/'research-music-alternatives.json').read_text(encoding='utf8'))}
    catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf8'))
    by_id={r['id']:r for r in catalog['assets']}
    def run(choice):
        id,scene,slug,index,zh,usage,description=choice;s=sources[slug]
        if not any('publicdomain/zero' in u for u in s['license_urls']):raise ValueError('Expected CC0')
        url=s['files'][index];original=download(url,CACHE/urllib.parse.unquote(url.rsplit('/',1)[-1]))
        ext=original.suffix.lower();author=s['author'][0]
        if slug=='breves-dies-hominis':author='Magdalen Kadel (Makemi); submitted by ceninan'
        if slug=='dark-shrine-loop':author='qubodup; original composition by yd'
        file=f'music/{id}__music_{scene}__{slug}__full-v01'+('.mp3' if ext=='.wav' else ext)
        target=ROOT/file;target.parent.mkdir(exist_ok=True)
        if ext=='.wav':
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-c:a','libmp3lame','-q:a','2',str(target)],check=True)
        else:shutil.copyfile(original,target)
        print('SAVED',id,target.name,flush=True)
        return {'id':id,'kind':'music','file':file,'title':slug,'name_zh':zh,'usage':usage,'description':description,
                'author':author,'license':'CC0-1.0','license_url':'https://creativecommons.org/publicdomain/zero/1.0/',
                'source_page':s['page'],'download_url':url,'source_sha256':sha(original),'bytes':target.stat().st_size,
                'sha256':sha(target),'processing':'完整WAV转MP3（libmp3lame q2），未改编／归一化。' if ext=='.wav' else '原始完整录音，仅重命名。'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for row in pool.map(run,CHOICES):by_id[row['id']]=row
    catalog['assets']=sorted(by_id.values(),key=lambda r:r['id'])
    (ROOT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

if __name__=='__main__':main()
