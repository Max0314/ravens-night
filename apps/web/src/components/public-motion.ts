import {cinematicTiming,unit,smooth} from './cinematic-timing.js';

export function transformPoint(x:number,y:number,pivot:{x:number;y:number},angle:number,dx=0,dy=0){
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return{x:pivot.x+(x-pivot.x)*c-(y-pivot.y)*s+dx,y:pivot.y+(x-pivot.x)*s+(y-pivot.y)*c+dy};
}
// Tight source ratios and measured alpha anchors; never stretch image layers.
export const rifleGeometry={canvas:{width:600,height:500},image:{x:30,y:185,width:470,height:470*217/1040},pivot:{x:135,y:248},muzzle:{x:30+470*.988,y:185+470*217/1040*.295}} as const;
const bodyWidth=350*419/729,bodyX=(600-bodyWidth)/2,shoulderLeft=bodyX+bodyWidth*.25,shoulderRight=600-shoulderLeft,shoulderY=185.5;
export const demonGeometry={body:{x:bodyX,y:105,width:bodyWidth,height:350},left:{x:shoulderLeft-250*.98,y:shoulderY-250*646/739*.34,width:250,height:250*646/739},right:{x:shoulderRight-250*.02,y:shoulderY-250*646/729*.34,width:250,height:250*646/729},hinges:{left:{x:shoulderLeft,y:shoulderY},right:{x:shoulderRight,y:shoulderY}}} as const;
export const guillotineGeometry={frame:{x:40.61538461538461,y:0,width:218.76923076923077,height:480},blade:{x:106.11681728014106,y:62.307692307692314,width:85.92021159356403,height:91.09896407317612,travel:246.52898391007278},neck:{x:149.30769230769232,y:381.69230769230774,diameter:36}} as const;
export function riflePose(elapsedMs:number,fireAt:number,reduced=false){
 const t=reduced?0:elapsedMs-fireAt,enter=reduced?1:smooth(elapsedMs,0,Math.max(1,fireAt-180));
 const kick=reduced||t<0?0:t<28?t/28:t<65?1:1-smooth(t,65,230);
 const x=-20*kick-35*(1-enter),y=-4*kick+20*(1-enter),angle=-3.6*kick-9*(1-enter);
 return{x,y,angle,opacity:enter,muzzle:transformPoint(rifleGeometry.muzzle.x,rifleGeometry.muzzle.y,rifleGeometry.pivot,angle,x,y),smokeOrigin:transformPoint(rifleGeometry.muzzle.x,rifleGeometry.muzzle.y,rifleGeometry.pivot,-3.6,-20,-4),flash:reduced||t<0?0:Math.max(0,1-t/85),smoke:reduced||t<30?0:unit((t-30)/95)*Math.max(0,1-(t-125)/1400),smokeAge:Math.max(0,t-30)};
}
export function guillotinePose(elapsedMs:number,resultAt:number,empty:boolean,reduced=false){
 const hit=elapsedMs-resultAt,p=empty?0:reduced?(hit>=0?1:0):unit((hit+300)/300);
 return{drop:p**3.4,shake:empty||reduced||hit<0||hit>=140?0:Math.sin(hit*.19)*(1-hit/140)*5,dust:empty||reduced||hit<0?0:Math.max(0,1-hit/650),wind:empty&&!reduced?Math.sin(elapsedMs/600)*12:0};
}
export function demonPose(elapsedMs:number,defeated=false,reduced=false){
 const sceneTime=reduced?(defeated?3200:1100):elapsedMs;
 const open=defeated||reduced?1:smooth(elapsedMs,150,cinematicTiming.demon.open);
 const flutter=reduced||defeated?0:[cinematicTiming.demon.flap,cinematicTiming.demon.air,cinematicTiming.demon.open].reduce((v,at)=>v+Math.max(0,1-Math.abs(elapsedMs-at)/140),0);
 const fall=defeated?smooth(sceneTime,120,2100):0;
 return{open,leftAngle:-(1-open)*52-flutter*4+fall*24,rightAngle:(1-open)*52+flutter*4-fall*19,wingScale:.2+.8*open,bodyY:defeated?fall*85:10*(1-open),bodyOpacity:defeated?1-fall*.72:1,fall};
}
