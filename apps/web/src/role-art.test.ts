import {expect,test} from 'vitest';
import {beginnerRoles} from '@ravens/content';
import {roleArt,roleFrame} from './role-art.js';

test('only public role taxonomy selects a frame and unknown identities stay neutral',()=>{
  for(const role of beginnerRoles){
    expect(roleArt(role.id).frameUrl).toBe(roleFrame(role.type).frameUrl);
    expect(roleArt(role.id).frameThumbnailUrl).toMatch(/-small\.webp$/);
  }
  for(const id of ['unknown','concealed','']){
    expect(roleArt(id).frameUrl).toBeUndefined();
    expect(roleArt(id).portraitUrl).toMatch(/concealed\.svg$/);
  }
  expect(roleFrame('GOOD')).toEqual({});
});
