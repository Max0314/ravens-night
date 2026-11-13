import {AtmosphericSky} from './AtmosphericSky.js';
// @vitest-environment jsdom
import {afterEach,expect,test} from 'vitest';
import {cleanup,render} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HuntingRifleScene,DemonLayers} from './CinematicPublicArt.js';
import {GuillotineScene} from './SharpEffects.js';
import {rifleGeometry,riflePose,guillotinePose,demonPose,transformPoint} from './public-motion.js';
import {VictoryArt} from './effects-art.js';
afterEach(cleanup);

test('rifle flash stays attached to the recoiling muzzle, and a seek is deterministic',()=>{
 const recoil=riflePose(878,850),base=rifleGeometry;
 expect(recoil.muzzle).toEqual(transformPoint(base.muzzle.x,base.muzzle.y,base.pivot,recoil.angle,recoil.x,recoil.y));expect(recoil.muzzle.x).toBeLessThan(base.muzzle.x);
 expect(riflePose(1100,850).smokeOrigin).toEqual(riflePose(1600,850).smokeOrigin);
 const ui=render(<HuntingRifleScene elapsedMs={878} fireAt={850}/>),flash=ui.container.querySelector('[data-testid="muzzle-flash"]')!;
 expect(flash.parentElement?.querySelector('image')?.getAttribute('href')).toMatch(/short-shotgun/);expect(flash.parentElement?.getAttribute('transform')).toContain('rotate(');
 expect(renderToStaticMarkup(<HuntingRifleScene elapsedMs={900} fireAt={850}/>)).toBe(renderToStaticMarkup(<HuntingRifleScene elapsedMs={900} fireAt={850}/>));
 ui.rerender(<HuntingRifleScene elapsedMs={849} fireAt={850}/>);expect(ui.container.querySelector('[data-testid="muzzle-flash"]')).toBeNull();
});

test('empty executions never drop, shake or impact, and absence is announced only after the public result',()=>{
 for(const reduced of [false,true])for(const t of [-100,0,899,900,1199,1200,1260,3200]){const p=guillotinePose(t,1200,true,reduced);expect([p.drop,p.shake,p.dust]).toEqual([0,0,0]);}
 const ui=render(<GuillotineScene elapsedMs={1500} resultAt={1200} empty death={false}/>);expect(ui.container.textContent).not.toContain('无人被处决');
 ui.rerender(<GuillotineScene elapsedMs={1500} resultAt={1200} empty death={false} resultVisible/>);expect(ui.container.textContent).toContain('无人被处决');expect(ui.container.querySelector('.guillotine-blade')?.getAttribute('data-drop')).toBe('0');
 const falling=guillotinePose(1199,1200,false);expect(falling.drop).toBeLessThan(1);expect(guillotinePose(1200,1200,false).drop).toBe(1);
});

test('demon wing hinges move independently while the body never inherits their horizontal scaling',()=>{
 const ui=render(<DemonLayers elapsedMs={500}/>),body=ui.container.querySelector('[data-demon-body]')!;
 expect(ui.container.querySelectorAll('[data-wing]')).toHaveLength(2);expect(body.parentElement?.getAttribute('transform')).not.toContain('scale');
 const folded=ui.container.querySelector('[data-wing="left"]')?.getAttribute('transform');ui.rerender(<DemonLayers elapsedMs={1100}/>);expect(ui.container.querySelector('[data-wing="left"]')?.getAttribute('transform')).not.toBe(folded);
 expect(demonPose(1100).wingScale).toBe(1);expect(demonPose(350,true).bodyY).toBeLessThan(demonPose(2000,true).bodyY);
 ui.rerender(<DemonLayers elapsedMs={1800} defeated/>);expect(ui.container.querySelector('.demon-shatter')).toBeNull();expect(ui.container.querySelector('mask')).not.toBeNull();
});

test('non-demon victories keep their actual cause, with no fabricated defeated demon',()=>{
 const ui=render(<VictoryArt winner="GOOD" cause="MAYOR" elapsedMs={1000}/>);expect(ui.container.querySelector('.cinematic-demon')).toBeNull();expect(ui.container.querySelector('[data-victory-symbol] image')?.getAttribute('href')).toMatch(/mayor/);
 ui.rerender(<VictoryArt winner="GOOD" cause="OTHER" elapsedMs={1000}/>);expect(ui.container.querySelector('.cinematic-demon')).toBeNull();expect(ui.container.querySelector('[data-victory-symbol] image')).toBeNull();
 ui.rerender(<VictoryArt winner="GOOD" cause="DEMON" elapsedMs={1000}/>);expect(ui.container.querySelector('[data-defeated="true"]')).not.toBeNull();
});

test('reduced rifle and defeated demon keep one fixed key pose across elapsed times',()=>{
 expect(riflePose(0,850,true)).toEqual(riflePose(5000,850,true));expect(demonPose(0,true,true)).toEqual(demonPose(5000,true,true));
 const ui=render(<DemonLayers elapsedMs={0} defeated reduced/>),before=ui.container.innerHTML;ui.rerender(<DemonLayers elapsedMs={5000} defeated reduced/>);expect(ui.container.innerHTML).toBe(before);
});

test('celestial rise is independent of town crops and reduced mode stays fixed',()=>{
 const ui=render(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={0} durationMs={5000}/>),disc=()=>ui.container.querySelector<SVGSVGElement>('.atmospheric-sky__disc')!;
 const initial=parseFloat(disc().style.top);ui.rerender(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={4250} durationMs={5000}/>);
 expect(parseFloat(disc().style.top)).toBeLessThan(initial);expect(ui.container.querySelector('image')?.getAttribute('href')).toMatch(/v5\/moon/);
 ui.rerender(<AtmosphericSky phase="DAWN" elapsedMs={0} durationMs={5000} reduced/>);const fixed=disc().style.top;
 ui.rerender(<AtmosphericSky phase="DAWN" elapsedMs={5000} durationMs={5000} reduced/>);expect(disc().style.top).toBe(fixed);expect(ui.container.querySelector('image')).toBeNull();
});
test('victory separates viewport atmosphere from the undistorted central subject',()=>{
 const ui=render(<VictoryArt winner="EVIL" elapsedMs={1200}/>),root=ui.container.querySelector('svg')!;
 expect(root.hasAttribute('viewBox')).toBe(false);
 expect(ui.container.querySelector('[data-victory-layer="town"]')?.getAttribute('href')).toBe('/art/effects/v5/burning-town.webp');
 expect(ui.container.querySelector('[data-victory-layer="atmosphere"]')?.getAttribute('preserveAspectRatio')).toBe('none');
 expect(ui.container.querySelector('[data-victory-layer="subject"]')?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
 expect(ui.container.querySelectorAll('[data-wing]')).toHaveLength(2);
});

