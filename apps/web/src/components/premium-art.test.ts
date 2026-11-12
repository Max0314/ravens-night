import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test,expect} from 'vitest';
import {beginnerRoles} from '@ravens/content';
import {privateArtFiles} from './PremiumArt.js';
const root=new URL('../../public/art/effects/v3/',import.meta.url);
test('every role and layered prop resolves to published artwork with reproducible hashes',()=>{
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
 for(const file of manifest.files){const data=readFileSync(new URL(file.file,root));expect(createHash('sha256').update(data).digest('hex')).toBe(file.sha256);}
 for(const role of beginnerRoles){for(const kind of ['IDENTITY','ACTION_SUBMITTED'] as const){const files=privateArtFiles({version:1,id:'test',kind,themeRoleId:role.id,shown:{type:'IDENTITY',roleId:role.id,summary:''}});for(const file of files)expect(existsSync(new URL(file+'.webp',root))).toBe(true);}}
});
