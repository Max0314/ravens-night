import {expect,test} from 'vitest';
import {obliqueCoffinMouth,obliqueCoffinPose} from './coffin-motion.js';

test('large diagonal coffin opens about both hinge endpoints with visible raised lining and real slab edge',()=>{for(const t of [0,600,1000,1600,1750,2200]){const p=obliqueCoffinPose(t);expect(p.quad[0].x).toBeCloseTo(obliqueCoffinMouth[0].x);expect(p.quad[0].y).toBeCloseTo(obliqueCoffinMouth[0].y);expect(p.quad[1].x).toBeCloseTo(obliqueCoffinMouth[1].x);expect(p.quad[1].y).toBeCloseTo(obliqueCoffinMouth[1].y);expect(p.quad.every(q=>q.y>=0&&q.y<=500)).toBe(true);expect(p.edge[3].y-p.edge[0].y).toBe(8);}expect(obliqueCoffinPose(0).back).toBe(false);expect(obliqueCoffinPose(1600).back).toBe(true);expect(obliqueCoffinPose(0,true)).toEqual(obliqueCoffinPose(4000,true));});

