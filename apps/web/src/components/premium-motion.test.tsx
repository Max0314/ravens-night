// @vitest-environment jsdom
import {render,cleanup} from '@testing-library/react';
import {afterEach,expect,test} from 'vitest';
import {FractureLayer,GuillotineScene,ResultBlood} from './SharpEffects.js';
afterEach(cleanup);
test('reduced execution keeps a fixed blade until the actual result, with no wind movement or blood spray',()=>{
 const ui=render(<><GuillotineScene reduced elapsedMs={700} resultAt={1000} death={false} empty/><ResultBlood reduced elapsedMs={700} resultAt={1000}/></>);
 const before=ui.container.querySelector<HTMLImageElement>('.guillotine-blade')!.style.top;expect(ui.container.querySelector('.result-blood')).toBeNull();
 ui.rerender(<><GuillotineScene reduced elapsedMs={950} resultAt={1000} death={false} empty/><ResultBlood reduced elapsedMs={950} resultAt={1000}/></>);expect(ui.container.querySelector<HTMLImageElement>('.guillotine-blade')!.style.top).toBe(before);
 ui.rerender(<><GuillotineScene reduced elapsedMs={1100} resultAt={1000} death empty={false}/><ResultBlood reduced elapsedMs={1100} resultAt={1000}/></>);expect(ui.container.querySelector<HTMLImageElement>('.guillotine-blade')!.style.top).not.toBe(before);expect(ui.container.querySelectorAll('.result-blood>i')).toHaveLength(0);expect(ui.container.querySelector('.guillotine-scene__dust')).toBeNull();
});
test('glass cracks and bitmap impact share the same viewport coordinates',()=>{
 const ui=render(<FractureLayer seed="phone" elapsedMs={1000}/>);expect(ui.container.querySelector('svg')?.getAttribute('preserveAspectRatio')).toBe('none');const hole=ui.container.querySelector<HTMLImageElement>('.glass-hole-art')!,shard=ui.container.querySelector<HTMLElement>('.fracture-v4>i')!;expect(hole.style.left).toBe(shard.style.left);expect(hole.style.top).toBe(shard.style.top);
});
