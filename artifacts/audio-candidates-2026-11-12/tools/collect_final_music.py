"""Two additional cinematic/clocktower candidates, preserving author attribution."""
import json, pathlib, shutil, urllib.parse
from collect_sources import ROOT,CACHE,download,sha

CHOICES=[
 ('M22','cinematic-resolution','no-more-magic','魔法散去','首页备选／黎明／善良终局','HorrorPen创作的电影场景管弦配乐，作为更完整旋律与戏剧发展的候选。'),
 ('M23','clocktower','forgotten-clocktower','被遗忘的钟楼','首页／夜晚／长场景参照','PetterTheSturgeon发布的钟楼主题长曲；名称与场景相关，具体配器与情绪仍以模型提示和人工试听判断。'),
]
if __name__=='__main__':
    sources={r['slug']:r for r in json.loads((ROOT/'research-music-final.json').read_text(encoding='utf8'))}
    catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf8'));rows={r['id']:r for r in catalog['assets']}
    for id,scene,slug,zh,usage,description in CHOICES:
        s=sources[slug];url=s['files'][0]
        src=download(url,CACHE/urllib.parse.unquote(url.rsplit('/',1)[-1]))
        file=f'music/{id}__music_{scene}__{slug}__full-v01.mp3';target=ROOT/file;shutil.copyfile(src,target)
        rows[id]={'id':id,'kind':'music','file':file,'title':slug,'name_zh':zh,'usage':usage,'description':description,
                  'author':s['author'][0],'license':'CC-BY-3.0','license_url':'https://creativecommons.org/licenses/by/3.0/',
                  'source_page':s['page'],'download_url':url,'bytes':target.stat().st_size,'sha256':sha(target),
                  'processing':'原始完整MP3，仅重命名。'}
        catalog['assets']=sorted(rows.values(),key=lambda r:r['id'])
        (ROOT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        print('SAVED',id,target.stat().st_size,flush=True)
