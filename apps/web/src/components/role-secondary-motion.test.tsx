import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {armorMaterialPoint,shieldMaterialPoint,chefDetailPose,wineDetailPose,mayorDocumentStrips,materialMesh,cloakMaterialPoint} from './role-detail-motion.js';
import {chefPose,polygonArea} from './private-prop-motion.js';

test('wine keeps its volume and a world-horizontal surface while the cup leans and returns',()=>{
 const volume=wineDetailPose(0).volume;
 for(let t=0;t<=4200;t+=100){const p=wineDetailPose(t);expect(polygonArea(p.liquid)).toBeCloseTo(volume,2);expect(p.liquid.every(q=>q.y>=p.level-.001)).toBe(true);expect(Math.abs(p.angle)).toBeLessThanOrEqual(7.1);}
 expect(wineDetailPose(900).angle).toBe(-7);expect(wineDetailPose(2600).angle).toBeCloseTo(0);expect(wineDetailPose(0,true)).toEqual(wineDetailPose(4000,true));
});
test('armor receives force locally while the pedestal stays fixed and the shield has its own vibration',()=>{
 for(const t of [0,700,725,800,1100,1600])expect(armorMaterialPoint({x:300,y:460},t)).toEqual({x:300,y:460});
 const face={x:300,y:250};expect(armorMaterialPoint(face,725)).not.toEqual(face);expect(armorMaterialPoint(face,1600)).toEqual(face);expect(shieldMaterialPoint(face,725)).not.toEqual(armorMaterialPoint(face,725));expect(shieldMaterialPoint(face,725,true)).toEqual(face);
});
test('each chop advances to its actual cut while the original contact hold and sound times remain intact',()=>{
 for(const [i,t] of [650,1000,1350].entries()){expect(chefDetailPose(t).x).toBe(10-i*18);expect(chefDetailPose(t).rebound).toBe(0);expect(chefPose(t+55).contact).toBe(true);expect(chefPose(t+55).angle).toBe(0);}
 expect(Math.abs(chefDetailPose(675).board)).toBeGreaterThan(.1);expect(Math.abs(chefDetailPose(2000).board)).toBeLessThan(.01);expect(chefDetailPose(0,true)).toEqual(chefDetailPose(3000,true));
});
test('the council document unrolls as a connected sheet below the fixed existing scroll',()=>{
 const early=mayorDocumentStrips(1050),late=mayorDocumentStrips(1650);expect(early.every(s=>s.target.every(p=>p.y===323))).toBe(true);
 for(let i=1;i<late.length;i++){expect(late[i]!.target[0]).toEqual(late[i-1]!.target[3]);expect(late[i]!.target[1]).toEqual(late[i-1]!.target[2]);}
 expect(late.at(-1)!.target[2].y).toBe(463);
});
test('material reactions create no semantic result without an authorized imprint',()=>{
 for(const role of ['soldier','monk','drunk','scarlet_woman','mayor','chef']){const markup=renderToStaticMarkup(<LayeredSceneArt role={role} kind="IDENTITY" elapsedMs={1100}/>);expect(markup).not.toContain('data-projection');expect(markup).not.toContain('成功');}
});

test('cloak panels keep their collar fixed, separate at the hem and share every interior material vertex',()=>{for(const side of [-1,1] as const){for(const t of [0,900,1400,2200]){expect(cloakMaterialPoint({x:300,y:85},side,t)).toEqual({x:300,y:85});const pieces=materialMesh(side<0?[108,180,240,300]:[300,360,420,492],[40,85,170,270,370,460],p=>cloakMaterialPoint(p,side,t)),vertices=new Map<string,{x:number;y:number}>();for(const piece of pieces)piece.source.forEach((p,i)=>{const key=p.x+','+p.y;if(vertices.has(key))expect(piece.target[i]).toEqual(vertices.get(key));else vertices.set(key,piece.target[i]!);});}const hem=cloakMaterialPoint({x:300,y:460},side,2200);expect(Math.sign(hem.x-300)).toBe(side);}expect(cloakMaterialPoint({x:108,y:460},-1,0,true)).toEqual(cloakMaterialPoint({x:108,y:460},-1,3000,true));});
