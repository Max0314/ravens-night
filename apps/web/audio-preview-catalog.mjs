import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const href = path => '/' + relative(publicRoot, path).split(sep).join('/');
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.startsWith('https://')))];
const allFiles = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? allFiles(join(path, entry.name)) : [join(path, entry.name)]);
const runtimeCategory = file => /^(ui-|paper-)/.test(file) ? '按钮与翻页' : /^(role-|coffin|washer|raven|crystal|investigator|cup-|flower-|cloak-|empath-|carriage-|envelope-|scepter|mayor|soldier)/.test(file) ? '角色' : /bell|nomination|vote|door/.test(file) ? '提示与环境' : '动作';

export function buildAudioPreviewCatalog() {
  const paths = ['audio','audio-candidates'].flatMap(dir => allFiles(join(publicRoot, dir)));
  const labels = new Map(), catalog = new Map();
  const verifyTrack = (track, path) => {
    if (!paths.includes(path) || catalog.has(href(path))) throw new Error(`Invalid or duplicate audio track ${href(path)}`);
    catalog.set(href(path), track);
  };
  const usedCandidates = new Set(paths.filter(path => href(path).includes('/nomination/') && basename(path) === 'manifest.json').flatMap(path => read(path).files.map(file => file.url)));
  for (const path of paths.filter(path => basename(path) === 'catalog.json')) {
    for (const item of read(path).assets) {
      labels.set(item.id, item.name_zh);
      const media = join(dirname(path), item.file);
      verifyTrack({url:href(media), id:item.id, title:item.name_zh, group:'candidate', channel:item.kind==='music'?'music':'effects', label:usedCandidates.has(href(media))?'已用 · 候选目录':'候选', detail:item.usage, author:item.author, license:item.license, licenseUrl:item.license_url, sources:unique(item.sources??[])},media);
    }
  }
  for (const path of paths.filter(path => basename(path) === 'manifest.json' && !href(path).includes('/nomination/'))) {
    const manifest=read(path),version=basename(dirname(path));
    const assets=Array.isArray(manifest.files)?manifest.files:manifest.file?[manifest]:Object.values(manifest.files??{});
    for (const item of assets) {
      const media = join(dirname(path), item.file);
      const group = href(media).startsWith('/audio/music/') ? 'music' : 'effects';
      const id = item.id ?? basename(media,'.mp3');
      const used = group==='music'||href(media).includes('/ambience/')||!['v1','v3'].includes(version)||id==='shield';
      const sharedSources=Array.isArray(manifest.sources)?manifest.sources.filter(value=>typeof value==='object').flatMap(value=>[value.page,value.sourcePage]):[];
      verifyTrack({url:href(media), id, title:labels.get(id)??item.originalTitle??item.name??id,
        group, channel:group, label:`${used?'已用':'历史'} · ${version}`, detail:group==='effects'?runtimeCategory(id):'背景与主题',
        author:item.author,license:item.license??manifest.license,licenseUrl:item.licenseUrl??item.license_url,
        sources:unique([...(item.sourcePages??[]),item.sourcePage,...(item.sources??[]),item.source,...sharedSources]),
        metadata:href(path)},media);
    }
  }
  const missing = paths.filter(path => path.endsWith('.mp3') && !catalog.has(href(path)));
  if (missing.length) throw new Error(`Audio preview entries missing: ${missing.map(href).join(', ')}`);
  return [...catalog.values()].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})||a.url.localeCompare(b.url));
}

export function audioPreviewCatalog() {
  const id='virtual:ravens-audio-preview-catalog';
  return {name:'ravens-audio-preview-catalog',resolveId:source=>source===id?'\0'+id:null,
    load:source=>source==='\0'+id?`export default ${JSON.stringify(buildAudioPreviewCatalog())}`:null};
}
