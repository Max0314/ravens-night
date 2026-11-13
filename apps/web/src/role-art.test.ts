import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {beginnerRoles} from '@ravens/content';
import {roleArt,roleFrame} from './role-art.js';

test('all public role previews share one SVG while unknown identities stay neutral',()=>{
  for(const role of beginnerRoles){
    expect(roleArt(role.id).frameUrl).toBe(roleFrame(role.type).frameUrl);
    expect(roleArt(role.id).frameThumbnailUrl).toMatch(/\.svg$/);
    expect(roleArt(role.id).frameThumbnailUrl).toBe(roleArt(role.id).frameUrl);
    expect(roleArt(role.id).frameSrcSet).toBeUndefined();
  }
  const urls=new Set(beginnerRoles.map(role=>roleArt(role.id).frameThumbnailUrl!));expect(urls.size).toBe(1);
  for(const url of urls){
    expect(readFileSync(new URL('../public'+url,import.meta.url),'utf8')).toContain('<svg ');
  }
  for(const id of ['unknown','concealed','']){
    expect(roleArt(id).frameUrl).toBeUndefined();
    expect(roleArt(id).portraitUrl).toMatch(/concealed\.svg$/);
  }
  expect(roleFrame('GOOD')).toEqual({});
});
