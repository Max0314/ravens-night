import {describe,expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {washerClothMesh,washerWaterPose,crystalPose,envelopePose,envelopeGeometry,magnifierPose,bookProject,quadTriangles,triangleMatrix,flowerMesh,poisonStreamPath,bookStrips,chefPose,poisonPose,polygonArea,streamPoint,washerPose} from './private-prop-motion.js';

describe('deterministic prop joints',()=>{
 test('all sixteen strips share continuous edges and a fixed spine across both faces',()=>{for(const time of [650,850,1150,1450,1850]){const strips=bookStrips(time);expect(strips).toHaveLength(16);expect(strips[0]!.quad[0]).toEqual(bookProject(300,100));expect(strips[0]!.quad[3]).toEqual(bookProject(300,410));for(let i=1;i<16;i++)expect(strips[i]!.left).toEqual(strips[i-1]!.right);}expect(bookStrips(650).at(-1)!.right.x).toBeCloseTo(bookProject(550,100).x);expect(bookStrips(1850).at(-1)!.right.x).toBeCloseTo(bookProject(50,100).x);expect(bookStrips(1850).every(s=>s.back)).toBe(true);});
 test('liquid has a world-horizontal surface, conserved polygon volume, and a physically wet outlet',()=>{let flowing=0;for(let t=0;t<=2200;t+=25){const p=poisonPose(t);expect(polygonArea(p.liquid)).toBeCloseTo(p.volume,1);if(p.flow){flowing++;expect(p.mouth.y).toBeGreaterThanOrEqual(p.level-2);expect(streamPoint(t,0)).toEqual(p.mouth);expect(streamPoint(t,160)).toEqual({x:475,y:405});}}expect(flowing).toBeGreaterThan(0);expect(poisonPose(2200).flow).toBe(false);expect(poisonPose(2200).volume).toBeLessThan(poisonPose(0).volume);expect(poisonPose(1000)).toEqual(poisonPose(1000));});
 test('knife holds contact and cloth physically sinks before it is lifted',()=>{for(const t of [650,1000,1350]){expect(chefPose(t).contact).toBe(true);expect(chefPose(t+55).angle).toBe(0);expect(chefPose(t+61).contact).toBe(false);}expect(washerPose(1100).y).toBeGreaterThan(washerPose(600).y);expect(washerPose(2100).y).toBeLessThan(washerPose(1100).y);});

});
test('the exported SVG is the runtime art and absent projections do not create semantic marks',()=>{const props={role:'undertaker',kind:'INFORMATION' as const,elapsedMs:1600};const early=renderToStaticMarkup(<LayeredSceneArt {...props}/>);expect(early).toContain('viewBox="0 0 600 500"');expect(early).not.toContain('data-projection');const revealed=renderToStaticMarkup(<LayeredSceneArt {...props} elapsedMs={1900} imprint={{label:'你看到的身份：士兵',marks:[{label:'玩家3-甲',avatar:'/avatar.webp'}]}}/>);expect(revealed).toContain('data-projection');expect(revealed).toContain('/avatar.webp');expect(early).not.toContain('foreignObject');});

test('a connected liquid jet leaves the wet mouth, then its airborne tail expires',()=>{const active=poisonPose(1100);expect(active.flow).toBe(true);expect(poisonStreamPath(1100)).toMatch(new RegExp('^M'+active.mouth.x.toFixed(2)));expect(poisonStreamPath(1650)).not.toBe('');expect(poisonStreamPath(1800)).toBe('');});
test('the fine flower surface stays connected and its surrounding canvas never changes',()=>{for(const t of [0,1000,1750]){const vertices=new Map<string,{x:number;y:number}>();for(const piece of flowerMesh(t))piece.source.forEach((p,i)=>{const target=piece.target[i]!,key=p.x+','+p.y;if(vertices.has(key))expect(target).toEqual(vertices.get(key));else vertices.set(key,target);if(p.x===0||p.x===600||p.y===0||p.y===500||t===1750)expect(target).toEqual(p);});}});

test('book texture triangles map all four physical corners, including the variable-height bottom edge',()=>{const strip=bookStrips(1250)[0]!,source=[{x:strip.sourceX,y:0},{x:strip.sourceX+strip.sourceWidth,y:0},{x:strip.sourceX+strip.sourceWidth,y:310},{x:strip.sourceX,y:310}] as const,target=strip.quad;for(const piece of quadTriangles(source,target)){const [a,b,c,d,e,f]=triangleMatrix(piece.source,piece.target).slice(7,-1).split(' ').map(Number);piece.source.forEach((p,i)=>{expect(a!*p.x+c!*p.y+e!).toBeCloseTo(piece.target[i]!.x,5);expect(b!*p.x+d!*p.y+f!).toBeCloseTo(piece.target[i]!.y,5);});}});

test('completed book projections remain clipped to the page and are not duplicated',()=>{
 const markup=renderToStaticMarkup(<LayeredSceneArt role="spy" kind="INFORMATION" elapsedMs={2300} imprint={{label:'极长线索'.repeat(8),marks:[{label:'长昵称'.repeat(8)}]}}/>);
 expect(markup.match(/data-projection="authorized"/g)).toHaveLength(1);
 expect(markup).toMatch(/data-book-ink="moving-leaf"[^>]+clip-path="url\(#[^"]+-leaf-ink\)"/);
});

test('new cloth vertices are shared and its candidate ink settles after lifting',()=>{
 for(const t of [800,1300,1950,2300]){const mesh=washerClothMesh(t);for(let i=1;i<mesh.length;i++){expect(mesh[i]!.target[0]).toEqual(mesh[i-1]!.target[3]);expect(mesh[i]!.target[1]).toEqual(mesh[i-1]!.target[2]);}}
 expect(washerWaterPose(800).energy).toBeGreaterThan(0);expect(washerWaterPose(1300).energy).toBeGreaterThan(0);expect(washerWaterPose(3000).energy).toBe(0);
 expect(washerWaterPose(1899).ink).toBe(0);expect(washerWaterPose(2250).ink).toBe(1);expect(washerClothMesh(2300)).toEqual(washerClothMesh(3000));
});
test('crystal smoke stays full-size, rotates slowly and remains after the answer',()=>{
 const a=crystalPose(0),b=crystalPose(1000);expect(Math.abs(b.angles[0]!-a.angles[0]!)).toBeLessThan(10);expect(crystalPose(3000).opacities.every(o=>o>.3)).toBe(true);
 const markup=renderToStaticMarkup(<LayeredSceneArt role="fortune_teller" kind="INFORMATION" elapsedMs={3000} imprint={{label:'已获知',value:'YES'}}/>);
 expect(markup.match(/data-crystal-smoke=/g)).toHaveLength(3);expect(markup).not.toContain('scale(');expect(markup).toContain('data-crystal-reflection');expect(markup).toContain('YES');
});
test('envelope hinge stays fixed, opens before the paper comes out, and the lens stays in scene bounds',()=>{
 expect(envelopePose(600).angle).toBe(0);expect(envelopePose(1450).angle).toBe(175);expect(envelopePose(1450).paperY).toBeCloseTo(0);expect(envelopePose(2150).paperY).toBe(-185);expect(envelopeGeometry.paper.y+envelopePose(2150).paperY).toBeGreaterThan(0);
 for(let t=0;t<4200;t+=100){const p=magnifierPose(t);expect(p.centre.x).toBeGreaterThan(100);expect(p.centre.x).toBeLessThan(500);expect(p.centre.y).toBeGreaterThan(100);expect(p.centre.y).toBeLessThan(400);}
});

test('incomplete envelope and magnifier resources never leave floating optical or letter layers',()=>{
 const envelope=renderToStaticMarkup(<LayeredSceneArt role="sealed-letter" kind="EVIL_START" elapsedMs={2500} imprint={{label:'授权',marks:[{label:'甲'}]}} readyAssets={new Set(['/art/effects/v8/envelope-paper.webp'])}/>);
 expect(envelope).not.toContain('data-envelope-paper');expect(envelope).not.toContain('data-projection');
 const lens=renderToStaticMarkup(<LayeredSceneArt role="investigator" kind="INFORMATION" elapsedMs={2500} readyAssets={new Set(['/art/effects/v8/investigator-evidence.webp'])}/>);
 expect(lens).toContain('investigator-evidence.webp');expect(lens).not.toContain('data-investigator-refraction');expect(lens).not.toContain('data-investigator-magnifier');
});
