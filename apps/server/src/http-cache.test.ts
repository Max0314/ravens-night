import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApp} from './app.js';
let directory:string,app:ReturnType<typeof buildApp>;
beforeEach(async()=>{
 directory=await mkdtemp(join(tmpdir(),'ravens-cache-'));
 for(const dir of ['assets','art/effects/v9'])await mkdir(join(directory,dir),{recursive:true});
 await Promise.all([writeFile(join(directory,'index.html'),'<h1>Ravens</h1>'),writeFile(join(directory,'assets/index-aBcD1234.js'),'export default 1'),writeFile(join(directory,'art/effects/v9/mist.webp'),'public-media')]);
 vi.stubEnv('STATIC_DIR',directory);app=buildApp({timers:false});await app.ready();
});
afterEach(async()=>{await app?.close();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
test('fingerprinted bundles cache while HTML, API and an HTML asset fallback never do',async()=>{
 const bundle=await app.inject('/assets/index-aBcD1234.js');expect(bundle.headers['cache-control']).toBe('public, max-age=31536000, immutable');
 for(const url of ['/','/api/account','/art/effects/v9/missing.webp']){const response=await app.inject(url);expect(response.headers['cache-control'],url).toBe('no-store');}
});
test('stable media validates with ETag and returns no duplicate body without freezing a changed asset',async()=>{
 const url='/art/effects/v9/mist.webp',first=await app.inject(url);expect(first.headers['cache-control']).toBe('public, max-age=0, must-revalidate');expect(first.headers.etag).toBeTruthy();
 const same=await app.inject({url,headers:{'if-none-match':String(first.headers.etag)}});expect(same.statusCode).toBe(304);expect(same.body).toBe('');expect(same.headers['cache-control']).toBe(first.headers['cache-control']);
 await writeFile(join(directory,'art/effects/v9/mist.webp'),'changed-public-media');const changed=await app.inject({url,headers:{'if-none-match':String(first.headers.etag)}});expect(changed.statusCode).toBe(200);expect(changed.body).toBe('changed-public-media');
});

test('conditional missing-resource requests keep their actual HTML fallback uncached',async()=>{
 const home=await app.inject('/');expect(home.headers.etag).toBeTruthy();
 for(const url of ['/assets/missing-abcdefgh.js','/art/missing.webp']){
  const response=await app.inject({url,headers:{'if-none-match':String(home.headers.etag)}});
  expect(response.statusCode).toBe(304);expect(response.headers['cache-control']).toBe('no-store');
 }
});
