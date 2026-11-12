import {expect,test} from 'vitest';
import {fractureGeometry} from './SharpEffects.js';
test('glass geometry is deterministic per event, irregular and differs across events',()=>{const a=fractureGeometry('a');expect(a).toEqual(fractureGeometry('a'));expect(a).not.toEqual(fractureGeometry('b'));expect(new Set(a.paths).size).toBe(a.paths.length);expect(a.shards).toHaveLength(32);expect(new Set(a.shards.map(s=>s.angle)).size).toBe(32);});
