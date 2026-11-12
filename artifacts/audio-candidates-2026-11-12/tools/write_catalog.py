"""Write the Chinese listening notes, attribution sheet and offline audition page."""
import collections, hashlib, html, json, pathlib, shutil
from collect_sources import ROOT,CACHE

KINDS={'music':'连续音乐','ambience':'环境与长氛围','long-effects':'悠长重音与转场','voice':'人声','foley':'道具与接触材质','designed':'动作组合试听','reference':'已认可参考'}
NOTES={
 'M01':'优先用于善良终局对照；模型更接近明亮胜利，不能仅因曲名就定为阴暗首页。',
 'M03':'优先讨论底乐候选；电钢琴与温暖感需与哥特画面一起试听。',
 'M13':'优先首页／大厅对照；模型偏温暖，严肃感需人工确认。',
 'M14':'保留作身份仪式／首页对照；模型同时提示圆舞曲与电子节奏，不能当作纯古典。',
 'M15':'优先投票／夜间低声层；模型提示合唱、钟声，需确认是否有明显人声纹理。',
 'M16':'优先黎明／死亡之后／白天，钢琴标签较一致。',
 'M17':'风格对照，降低优先级：模型偏强电子节奏，可能偏离优雅古典。',
 'M18':'优先夜晚／仪式，模型提示合唱、古乐弓弦、悠长氛围。',
 'M19':'特殊仪式备选：真实拉丁文独唱，模型的“合唱”不能据此认定多人合唱。',
 'M21':'风格对照，降低优先级：明显偏电子节奏的模型提示，需判断是否太现代。',
 'M22':'优先首页／善良终局旋律候选；模型偏古典、温暖与钢琴，拍号仍需人工判断。',
 'M23':'优先首页／大厅候选；原始响度较低，比较时不要把较轻误判为缺乏品质。',
 'A01':'完整120秒持续氛围；作者注明可循环，本轮未在游戏内验收接缝。',
 'A02':'一分钟合成风底，模型识别一致；不能称作真实钟楼录音。',
 'A03':'8秒时钟素材，可作节奏层；当前文件不是一分钟环境录音。',
 'A04':'仅约3.55秒原始火声；长版本请比较A07。',
 'A05':'约9秒乌鸦录音，适合稀疏点缀。',
 'A06':'优先试听90秒夜景：模型仍偏洞穴幽鸣，需决定钟楼是否应更开阔。',
 'A07':'优先试听90秒大厅：炉火、滴答、淡风；短原录音重复感需人工确认。',
 'D01':'需要重点试听：真实布料撕开已加入，但混合后模型仍偏湿润拍击；尚未认定撕裂质感达标。',
 'D02':'需要重点试听：右侧另一抓，模型同时提示湿润、碎裂、撕开；与D01一起比较。',
 'D03':'男声重击对照：模型对痛哼与惨叫的匹配接近，尚不能认定足够凶狠。',
 'D04':'优先死亡候选：短人声爆发与接触，模型明确偏女性惨叫；是否有决定感由人工试听。',
 'D05':'处刑接触对照：模型仍提示湿润／玻璃感，不能认定已像沉重钢刃；可拆听F04和S01。',
 'D06':'展翼材质对照：模型偏重击与衣料，是否像大型膜翼仍需试听。',
 'D07':'投毒对照：瓶体／液体仍有湿润拍击提示，尚未认定瓶体精致度达标。',
 'F13':'优先与旧撕裂比较：真实布料撕开前段摘录，模型也偏撕开；完整源录音尚未下载成功。',
 'R01':'用户已认可的钟声，只作音色和空间参照；游戏文件未修改。',
}
FIRST=['M22','M23','M18','M16','M03','A06','A07','L02','L03','D04','D03','F13','D01','D02','R01']

def clock(seconds):
    return f'{int(seconds)//60}:{int(seconds)%60:02d}' if seconds>=60 else f'{seconds:.2f}秒'

def main():
    catalog=json.loads((ROOT/'catalog.json').read_text(encoding='utf8'));assets=catalog['assets']
    analysis=json.loads((ROOT/'analysis.json').read_text(encoding='utf8'));results=analysis['assets']
    counts=collections.Counter(r['kind'] for r in assets)
    for row in assets:
        a=results[row['id']]
        if hashlib.sha256((ROOT/row['file']).read_bytes()).hexdigest()!=a['sha256']:raise ValueError('Stale analysis '+row['id'])
        row['review_note']=NOTES.get(row['id'],'原始材料／独立录音候选；短音的模型标签易混淆，结合来源说明和实际试听判断。')
        row['duration_seconds']=a['duration_seconds'];row['integrated_lufs']=a['integrated_lufs']
        row['clap_top3']=[x['label_zh'] for x in a['clap_top5'][:3]]
    (ROOT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    readme='''# 鸦钟夜话：声音候选包 · 2026-11-12

状态：**已保存并完成机器辅助分析，未接入游戏，未部署，待人工艺术试听。**

本轮按用户要求收集音乐、悠长氛围、死亡人声、撕裂及道具材质，并安装开源分析工具。钟声保留作为基准；其余均为候选，不能将“技术可播放”理解为用户已认可。

## 开始试听

打开 [试听目录.html](试听目录.html)，可按分类筛选、搜索并逐条播放。页面在本地打开即可使用，不联网、不自动播放。默认开启“统一试听响度”：仅降低较响素材，避免原始音量差影响比较；不会修改音频文件。若Codex预览面板限制本地音频，直接在系统浏览器打开此HTML文件。

逐条内容、场景、时长、分析、来源、授权与改编说明见 [CATALOG.md](CATALOG.md)。署名见 [CREDITS.md](CREDITS.md)，工具安装和实际分析方法见 [TOOLING.md](TOOLING.md)。

建议先比较：M22/M23（旋律与首页）、M18（夜晚仪式）、M16/M03（钢琴与讨论）、A06/A07（90秒场景氛围）、L02/L03（悠长重音）、D04/D03（直接死亡）、F13/D01/D02（真实撕开与两抓）。

## 本包内容

'''
    for kind in KINDS:readme+=f'- {KINDS[kind]}：{counts[kind]} 份。\n'
    readme+=f'\n合计 **{len(assets)}份，{sum(r["bytes"] for r in assets)/1048576:.1f} MiB**。文件名包含类别、场景／声音内容和版本，中文名与ID逐一对应。参考钟声R01是旧素材的原样副本，其余是本轮新收集、提取或混合的候选。\n'
    readme+='''
## 已发现的取舍

- M17/M21偏电子，作为风格对照保留，优先级较低；M01更接近明亮终局。不能用同一套情绪标签强行归为“哥特”。
- 女声V01/D04的人声识别比较明确；男声V03–V08中多条仍偏痛哼，D03也需继续比较冲击力。
- D01/D02已经使用新下载的真实布料撕开，混合后模型仍偏湿润接触；不将其写成已达到最终撕裂质感。
- F13保存的是可正常播放的4.5秒摘录；完整10秒源录音下载超时，未伪装为完整原件。
- 原始配乐保留原响度，个别原件真峰值高于0dBTP，未来接入时需要另行制作播放母带。此包没有修改游戏的混音或触发点。
- 完整音乐以原曲／原作者发布版本保存，尚未形成一套原创统一主题；A06/A07是长氛围试听组合，也没有宣称无缝循环已验收。

## 验证与项目边界

55份声音均有SHA256、ffprobe格式信息、FFmpeg全文件响度分析、librosa抽样特征及CLAP抽样语义对比；相同哈希的结果已复用。完整结果见analysis.json。本地试听HTML已通过Chromium的55条展示、12首音乐分类、搜索，以及F13/D04/M23/M18四份MP3与OGG的元数据加载检查，页面无脚本错误；记录见preview-verification.json。模型结果是对公开候选描述的相似度，不是艺术分、正确率或用户认可。

未改动apps/、packages/、游戏配置或部署。现有阶段文档描述的游戏实现保持有效，本轮正式记录在本候选包内；未运行与素材收集无关的游戏构建或测试。读取Fribench公共规范SHA：964c0ba2357810506ba4d9e883d217f377ea0615。

下载失败、限流及未纳入候选的曲目留在research-*.json与download-errors.json，仅是研究记录，不计入55份已保存声音。原始包与模型缓存不放入Git资源目录，脚本仅记录本轮素材流程，不能作为运行时构建脚本调用。
'''
    (ROOT/'README.md').write_text(readme,encoding='utf8')
    doc=['# 声音候选逐条说明','', '内容说明结合作者发布信息、已执行的信号分析与CLAP提示；本轮没有人工逐条听审。场景用途是设计建议，尚未改动游戏。',
         '', 'CLAP标签仅表示与给定文字的相对匹配。尤其短声、拍号、演奏人数和审美不能只依赖标签判断。长文件取三个10秒位置，具体位置逐条列出；未声称整曲由模型完整理解。', '']
    credits=['# 素材来源与署名','', '本文件应随候选包保存。若未来把某项接入游戏，需将对应署名和许可带入游戏的资源说明／制作人员页。作品版权属于原作者；本项目只作标明的剪辑或混音。',
             '', '衍生文件的CC-BY-3.0表示本轮混音按该许可提供，同时保留各原始层的署名与许可；CC0原始层仍为CC0。', '']
    for kind,label in KINDS.items():
        doc+=['## '+label,'']
        for row in [r for r in assets if r['kind']==kind]:
            a=results[row['id']];peaks=a['true_peak_dbtp'];lufs=a['integrated_lufs']
            doc += [f'### {row["id"]} · {row["name_zh"]}', '',f'- 文件：[{pathlib.PurePosixPath(row["file"]).name}]({row["file"]})',
                    f'- 时长：{clock(a["duration_seconds"])}；{a["sample_rate"]}Hz，{a["channels"]}声道。',
                    f'- 内容：{row["description"]}',f'- 建议场景：{row["usage"]}。',f'- 试听重点：{row["review_note"]}',
                    '- 模型提示：'+'、'.join(f'{x["label_zh"]}（余弦{x["cosine"]:.3f}）' for x in a['clap_top5'][:3])+'。',
                    '- 抽样起点：'+', '.join(f'{x:g}s' for x in a['sampled_feature_offsets_seconds'])+'；每段最多10秒。',
                    f'- 信号：综合响度 {lufs if lufs is not None else "过短／无法稳定测量"} LUFS；真峰值 {peaks} dBTP。'+(' 原件真峰值超0，保留作候选；不直接当作游戏母带。' if peaks is not None and peaks>0 else ''),
                    f'- 加工：{row["processing"]}',f'- 作者：{row["author"]}。',f'- 许可：[{row["license"]}]({row["license_url"]})。']
            pages=row.get('source_pages',[row.get('source_page','')]);pages=[p for p in pages if p]
            doc+=['- 来源：'+'；'.join(f'[原始发布页{i+1}]({p})' for i,p in enumerate(pages))+'。']
            if row.get('mirror_page'):doc += [f'- 下载存档：[Wikimedia Commons]({row["mirror_page"]})；按该副本的CC-BY-3.0记录。']
            doc+=['']
            credits += [f'## {row["id"]} · {row["name_zh"]}', '', f'{row["title"]} — {row["author"]}',
                        f'License: [{row["license"]}]({row["license_url"]})',
                        'Source: '+'; '.join(pages), 'Changes: '+row['processing'], '']
    (ROOT/'CATALOG.md').write_text('\n'.join(doc)+'\n',encoding='utf8')
    (ROOT/'CREDITS.md').write_text('\n'.join(credits)+'\n',encoding='utf8')
    license_dir=ROOT/'licenses';license_dir.mkdir(exist_ok=True)
    shutil.copyfile(CACHE/'wet-towel/wet_towel_on_body/wet_towel_on_body-info.txt',license_dir/'wet-towel-original-license.txt')
    (license_dir/'README.md').write_text('''# 许可证据说明

每项素材的原始发布页、作者、下载地址、许可链接和加工记录见catalog.json及CREDITS.md。OpenGameArt页面的已读取许可信息见research-effects.json、research-music-alternatives.json及research-music-final.json。

湿毛巾拟音包：当前作者发布页提供CC0；原包保留较早的MIT/ZLIB/newBSD/ZWorks多许可说明。本包保留该原始说明，不删除旧通知，候选采用作者当前页面公开的CC0许可。作者为Iwan Gabovitch（qubodup）。

BigSoundBank #0013：Joseph SARDIN，Cloth，CC0，录音棚布料短撕两次与长撕两次。页面：https://bigsoundbank.com/tissu-s0013.html 。本包只交付前4.5秒摘录，完整源文件下载未完成。

参考钟声：沿用项目v2/SOURCES.md已记录的Joseph SARDIN与Axeline T.录音来源与CC0许可。

音乐M01/M03从Wikimedia Commons存档获取，使用存档明确列出的CC BY 3.0；作者当前站点为新下载显示CC BY 4.0，不将两者混写。其余音乐按各自原始发布页的许可记录。
''',encoding='utf8')
    evidence={'ops_policy_sha':'964c0ba2357810506ba4d9e883d217f377ea0615','model_revision':analysis['model_revision'],
              'model_weight_sha256':hashlib.sha256((ROOT.parents[1]/'outputs/audio-tools/models/clap-htsat-unfused/pytorch_model.bin').read_bytes()).hexdigest(),
              'asset_count':len(assets),'asset_bytes':sum(r['bytes'] for r in assets),'all_have_current_analysis':True,
              'artistic_listening_approval':False,'runtime_integration':False}
    if (ROOT/'preview-verification.json').exists():
        evidence['browser_preview_check']=json.loads((ROOT/'preview-verification.json').read_text(encoding='utf8'))
    (ROOT/'verification.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    # Inline metadata: works from file:// without fetch/CORS or any server.
    payload=json.dumps(assets,ensure_ascii=False).replace('<','\\u003c')
    template='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>鸦钟夜话 · 声音候选</title>
<style>body{margin:0;background:#10110f;color:#e9dfca;font:15px/1.65 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:30px 22px 80px}h1{font-family:serif;color:#dfc384}p{color:#bdb7a8}.controls{position:sticky;top:0;background:#10110ff5;padding:14px 0;border-bottom:1px solid #655638;z-index:2;display:flex;gap:12px;flex-wrap:wrap;align-items:center}input,select,button{font:inherit;padding:9px;color:#e9dfca;background:#22231d;border:1px solid #6e603f;border-radius:5px}input[type=search]{flex:1;min-width:170px}input[type=checkbox]{accent-color:#d1b16e}article{border:1px solid #54492f;border-radius:10px;padding:18px;margin:16px 0;background:#191b16}article h2{font-size:18px;margin:0 0 9px;color:#ddc48c}article p{margin:7px 0}.meta{font-size:13px;color:#a6aa99}audio{width:100%;margin:12px 0 0}a{color:#d5b771}.name{font:11px monospace;overflow-wrap:anywhere;color:#989f91}.pill{font-size:12px;border:1px solid #8b7442;padding:2px 6px;border-radius:4px;margin-left:9px}#count{color:#c6ad78}details{font-size:13px;margin-top:9px}label{font-size:13px}</style>
<main><h1>鸦钟夜话 · 声音候选</h1><p>55份已保存素材 · 钟声保留基准 · 其余待试听。音乐、长氛围、直接死亡与真实布料撕开。模型标签辅助核对内容，艺术选择由试听决定。</p>
<p><a href="CATALOG.md">逐条文字说明</a> · <a href="CREDITS.md">来源与许可</a> · <a href="TOOLING.md">开源分析工具</a></p>
<div class="controls"><input id="search" type="search" aria-label="搜索声音" placeholder="搜索：死亡、夜晚、钢琴、撕开…"><select id="kind" aria-label="声音分类"><option value="">全部分类</option></select><label><input id="first" type="checkbox" checked>先看建议试听</label><label><input id="level" type="checkbox" checked>统一试听响度（仅降低较响素材）</label><button id="stop">全部暂停</button><span id="count"></span></div><section id="list"></section></main>
<script id="data" type="application/json">__DATA__</script><script>
const assets=JSON.parse(document.querySelector('#data').textContent),kinds=__KINDS__,first=__FIRST__;
const e=s=>document.querySelector(s),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [key,label]of Object.entries(kinds))e('#kind').add(new Option(label,key));
function volume(row){return .65*(e('#level').checked&&Number.isFinite(row.integrated_lufs)?Math.min(1,Math.pow(10,(-25-row.integrated_lufs)/20)):1)}
function render(){document.querySelectorAll('audio').forEach(a=>a.pause());const q=e('#search').value.trim().toLowerCase();let rows=assets.filter(r=>(!e('#kind').value||r.kind===e('#kind').value)&&(!e('#first').checked||first.includes(r.id))&&JSON.stringify(r).toLowerCase().includes(q));if(e('#first').checked)rows.sort((a,b)=>first.indexOf(a.id)-first.indexOf(b.id));e('#count').textContent=rows.length+' / '+assets.length;e('#list').innerHTML=rows.map(r=>`<article><h2>${escape(r.id+' · '+r.name_zh)}<span class="pill">${escape(kinds[r.kind])}</span></h2><div class="meta">${r.duration_seconds.toFixed(2)}秒 · ${escape(r.usage)} · ${escape(r.license)}</div><p>${escape(r.description)}</p><p>${escape(r.review_note)}</p><div class="meta">模型提示：${escape(r.clap_top3.join('、'))}（不代表艺术评分）</div><audio controls preload="none" data-id="${escape(r.id)}" src="${escape(r.file)}"></audio><details><summary>文件、来源与加工</summary><div class="name">${escape(r.file)}</div><p>${escape(r.author)}</p><p>${escape(r.processing)}</p>${(r.source_pages||[r.source_page]).filter(Boolean).map(u=>`<a href="${escape(u)}" target="_blank" rel="noreferrer">原始发布页</a>`).join(' · ')} · <a href="${escape(r.file)}" download>保存此文件</a></details></article>`).join('');for(const a of document.querySelectorAll('audio')){const r=assets.find(r=>r.id===a.dataset.id);a.volume=volume(r);a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==a)other.pause()}));}}
for(const id of ['#search','#kind','#first'])e(id).addEventListener(id==='#search'?'input':'change',render);
e('#level').addEventListener('change',()=>document.querySelectorAll('audio').forEach(a=>a.volume=volume(assets.find(r=>r.id===a.dataset.id))));e('#stop').addEventListener('click',()=>document.querySelectorAll('audio').forEach(a=>a.pause()));render();
</script></html>'''
    page=template.replace('__DATA__',payload).replace('__KINDS__',json.dumps(KINDS,ensure_ascii=False)).replace('__FIRST__',json.dumps(FIRST))
    (ROOT/'试听目录.html').write_text(page,encoding='utf8')
    print(json.dumps({'assets':len(assets),'categories':dict(counts),'bytes':evidence['asset_bytes']},ensure_ascii=False))

if __name__=='__main__':main()
