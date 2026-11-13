import {cinematicTiming as timing,smooth} from './cinematic-timing.js';
import type {Point,Quad} from './private-prop-motion.js';

export function carriageDetailPose(t:number,reduced=false){const b=timing.baron,age=Math.max(0,t-b.stop),arrival=reduced?1:smooth(t,b.arrive,b.stop);return{x:16*(1-arrival),travel:16*arrival,y:reduced||t<b.stop?0:Math.sin(age/35)*Math.exp(-age/150)*1.8*(1-smooth(t,b.settle-200,b.settle)),doorAngle:-68*(reduced?1:smooth(t,b.doorStart,b.doorOpen)),lampAngle:reduced||t<b.stop?0:Math.sin(age/170)*Math.exp(-age/700)*4*(1-smooth(t,b.settle-200,b.settle)),seals:b.seals.map(at=>({split:reduced?1:smooth(t,at,at+160),opacity:reduced?0:1-smooth(t,at+120,at+550)})),papers:b.paperStart.map((at,i)=>reduced?1:smooth(t,at,b.paperOut[i]!))};}
export const contractResidualCurl=65;
/** The moving roll exposes the sheet while its last turn keeps a natural curled edge. */
export function parchmentPoint(p:Point,rect:{x:number;y:number;width:number;height:number},progress:number):Point{const distance=p.y-rect.y,travel=(rect.height-contractResidualCurl)*progress,flat=Math.min(distance,travel),folded=Math.max(0,distance-travel),angle=folded/28,z=28*(1-Math.cos(angle));return{x:p.x+z*.08,y:rect.y+flat+Math.sin(angle)*28-z*.15};}

export const carriageWheels=[{name:'near-front',pivot:{x:201,y:332},radius:93},{name:'near-rear',pivot:{x:514,y:282},radius:88},{name:'far-front',pivot:{x:126,y:304},radius:59}] as const;
export const carriageDoor:Quad=[{x:350,y:235},{x:425,y:235},{x:425,y:307},{x:350,y:307}];
export const carriageLamps=[{x:273,y:160},{x:183,y:161},{x:388,y:128}] as const;
export const contractPlanes:readonly Quad[]=[[{x:282,y:349},{x:412,y:344},{x:427,y:478},{x:290,y:486}],[{x:424,y:335},{x:553,y:354},{x:526,y:482},{x:402,y:462}]];
const projectPaper=(quad:Quad,u:number,v:number):Point=>({x:(quad[0].x*(1-u)+quad[1].x*u)*(1-v)+(quad[3].x*(1-u)+quad[2].x*u)*v,y:(quad[0].y*(1-u)+quad[1].y*u)*(1-v)+(quad[3].y*(1-u)+quad[2].y*u)*v});
export function carriageDoorPose(t:number,reduced=false):Quad{const theta=-carriageDetailPose(t,reduced).doorAngle*Math.PI/180;return carriageDoor.map(p=>{const distance=425-p.x;return{x:425-distance*Math.cos(theta)+distance*Math.sin(theta)*.12,y:p.y+distance*Math.sin(theta)*.2};}) as unknown as Quad;}
export function carriageLampAngle(t:number,index:number,reduced=false){const b=timing.baron,age=t-b.stop;return reduced||age<0?0:Math.sin(age/[170,155,135][index]!)*Math.exp(-age/700)*[4,3.6,2.8][index]!*(1-smooth(t,b.settle-200,b.settle));}
export function carriagePaperStrips(t:number,index:number,reduced=false){const progress=carriageDetailPose(t,reduced).papers[index]!,quad=contractPlanes[index]!,rect={x:0,y:0,width:220,height:310};return Array.from({length:24},(_,i)=>{const y=i*310/24,next=(i+1)*310/24,source:Quad=[{x:0,y},{x:220,y},{x:220,y:next},{x:0,y:next}],angle=Math.max(0,(y+next)/2-(310-contractResidualCurl)*progress)/28;return{source,target:source.map(p=>{const q=parchmentPoint(p,rect,progress);return projectPaper(quad,q.x/220,q.y/310);}) as unknown as Quad,depth:28*(1-Math.cos(angle)),back:Math.cos(angle)<0};}).sort((a,b)=>a.depth-b.depth);}
export function contractSealPoint(index:number):Point{const q=contractPlanes[index]!;return{x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2+6};}
