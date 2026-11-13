import {cinematicTiming as timing,smooth} from './cinematic-timing.js';
import type {Point,Quad} from './private-prop-motion.js';

export const obliqueCoffinMouth:Quad=[{x:75,y:190},{x:445,y:90},{x:515,y:240},{x:140,y:355}];
const signedArea=(points:readonly Point[])=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length]!;return sum+p.x*q.y-q.x*p.y;},0)/2;
/** A raised slab is projected in 3D about its actual diagonal long-side hinge. */
export function obliqueCoffinPose(t:number,reduced=false){const p=reduced?1:smooth(t,timing.coffin.start,timing.coffin.open),age=Math.max(0,t-timing.coffin.open),settle=reduced||t<timing.coffin.open?0:Math.sin(age/65)*Math.exp(-age/180)*1.8,angle=100*p+settle,theta=angle*Math.PI/180,[a,b]=obliqueCoffinMouth,length=Math.hypot(b.x-a.x,b.y-a.y),u={x:(b.x-a.x)/length,y:(b.y-a.y)/length},n={x:-u.y,y:u.x};const project=(point:Point):Point=>{const x=point.x-a.x,y=point.y-a.y,along=x*u.x+y*u.y,depth=x*n.x+y*n.y;return{x:a.x+along*u.x+depth*Math.cos(theta)*n.x,y:a.y+along*u.y+depth*Math.cos(theta)*n.y-depth*Math.sin(theta)*.3};},quad=obliqueCoffinMouth.map(project) as unknown as Quad,edge:Quad=[quad[3],quad[2],{x:quad[2].x,y:quad[2].y+8},{x:quad[3].x,y:quad[3].y+8}];return{angle,quad,edge,back:signedArea(quad)*signedArea(obliqueCoffinMouth)<0};}
