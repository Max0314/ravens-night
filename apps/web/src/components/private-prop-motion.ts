import {cinematicTiming as timing,smooth,unit} from './cinematic-timing.js';

export type Point={x:number;y:number};
export const propGeometry={book:{spine:{x:300,y:100},width:250,height:310},coffin:{x:110,y:240,width:380,height:120},bottle:{pivot:{x:300,y:210},mouth:{x:300,y:128.1},landing:{x:475,y:405}},water:{x:300,y:318,rx:167,ry:53}} as const;
export function rotatePoint(p:Point,pivot:Point,degrees:number):Point{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return{x:pivot.x+(p.x-pivot.x)*c-(p.y-pivot.y)*s,y:pivot.y+(p.x-pivot.x)*s+(p.y-pivot.y)*c};}
export const rotation=(degrees:number,pivot:Point)=>`rotate(${degrees} ${pivot.x} ${pivot.y})`;
/** The shell, page hinge and material all share the same oblique book plane.
 * A lifted leaf has independent height above that plane, rather than rotating
 * a front-facing rectangle over a flat illustration. */
export const bookPlaneMatrix='matrix(.8 -.11 .16 .55 20 150)';
export function bookProject(x:number,y:number,z=0):Point{return{x:20+.8*x+.16*y+.07*z,y:150-.11*x+.55*y-.45*z};}
export function bookStrips(elapsed:number){
 const p=smooth(elapsed,timing.book.start,timing.book.end),yaw=p*Math.PI,curve=Math.sin(p*Math.PI)*.38,w=250/16;
 let x=300,z=0;
 return Array.from({length:16},(_,i)=>{
  const a=yaw+curve*Math.sin((i+.5)/16*Math.PI),nx=x+Math.cos(a)*w,nz=z+Math.sin(a)*w;
  const leftTop=bookProject(x,100,z),leftBottom=bookProject(x,410,z),rightTop=bookProject(nx,100,nz),rightBottom=bookProject(nx,410,nz);
  const left={x:leftTop.x,top:leftTop.y,height:leftBottom.y-leftTop.y,depth:z,bottomX:leftBottom.x},right={x:rightTop.x,top:rightTop.y,height:rightBottom.y-rightTop.y,depth:nz,bottomX:rightBottom.x};
  x=nx;z=nz;
  return{index:i,sourceX:i*(220/16),sourceWidth:220/16,back:Math.cos(a)<0,left,right,quad:[leftTop,rightTop,rightBottom,leftBottom] as Quad,shade:.72+.28*Math.abs(Math.cos(a))};
 });
}
/** Project the lid's real upward lift as well as its receding depth.
 * A 90-degree lid is vertical and fully visible, not a collapsed line. */
export function coffinPose(t:number){const angle=105*smooth(t,timing.coffin.start,timing.coffin.open),a=angle*Math.PI/180,depth=Math.cos(a),dy=119*depth-135*Math.sin(a),scaleY=dy/119;return{angle,scaleY,quad:[{x:110,y:240},{x:490,y:240},{x:490+16*depth,y:240+dy},{x:110-17*depth,y:240+dy}] as Quad,back:dy<0,matrix:`matrix(1 0 0 ${scaleY} 110 240)`};}
export const cavity:Point[]=[{x:279.1,y:137.9},{x:320.9,y:137.9},{x:320.9,y:209.6},{x:340,y:224.5},{x:376,y:269.4},{x:380,y:305},{x:365,y:345},{x:340,y:371},{x:260,y:371},{x:235,y:345},{x:220,y:305},{x:224,y:269.4},{x:260,y:224.5},{x:279.1,y:209.6}];
export function polygonArea(points:readonly Point[]):number{return Math.abs(points.reduce((a,p,i)=>{const n=points[(i+1)%points.length]!;return a+p.x*n.y-n.x*p.y;},0))/2;}
export function belowWater(points:readonly Point[],level:number):Point[]{const out:Point[]=[];for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!,inside=a.y>=level,next=b.y>=level;if(inside)out.push(a);if(inside!==next){const p=(level-a.y)/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*p,y:level});}}return out;}
export function liquidLevel(points:readonly Point[],volume:number):number{let low=Math.min(...points.map(p=>p.y))-1,high=Math.max(...points.map(p=>p.y))+1;for(let i=0;i<24;i++){const mid=(low+high)/2;if(polygonArea(belowWater(points,mid))>volume)low=mid;else high=mid;}return(low+high)/2;}
export function poisonAngle(t:number){return t<timing.poison.stopPour?115*smooth(t,timing.poison.tiltStart,1100):115*(1-smooth(t,timing.poison.stopPour,timing.poison.upright));}
const capacity=polygonArea(cavity),initialVolume=capacity*.64;
function fluidAt(t:number,volume:number){const angle=poisonAngle(t),polygon=cavity.map(p=>rotatePoint(p,propGeometry.bottle.pivot,angle)),level=liquidLevel(polygon,volume),mouth=rotatePoint(propGeometry.bottle.mouth,propGeometry.bottle.pivot,angle);return{angle,polygon,level,mouth,flow:t>=timing.poison.pour&&t<timing.poison.stopPour&&angle>80&&mouth.y>=level-2&&volume>0};}
// Integrate once in fixed steps, so a seek has exactly the same volume as uninterrupted playback.
const volumeTable:number[]=[initialVolume];for(let t=0;t<2200;t+=5){const v=volumeTable[volumeTable.length-1]!;volumeTable.push(Math.max(0,v-(fluidAt(t,v).flow?initialVolume*.0014*5:0)));}
export function poisonPose(t:number){const at=Math.max(0,Math.min(2200,t)),i=Math.floor(at/5),v=volumeTable[i]??volumeTable[volumeTable.length-1]!;return{...fluidAt(t,v),volume:v,liquid:belowWater(fluidAt(t,v).polygon,fluidAt(t,v).level),corkLift:45*smooth(t,400,700)*(1-smooth(t,2050,2350))};}
export function streamPoint(emittedAt:number,age:number):Point|undefined{const pose=poisonPose(emittedAt);if(!pose.flow||age<0||age>160)return;const p=unit(age/160),end=propGeometry.bottle.landing;return{x:pose.mouth.x+(end.x-pose.mouth.x)*p,y:pose.mouth.y+(end.y-pose.mouth.y)*p*p};}
export function chefPose(t:number){const hits=timing.chef,prior=[0,...hits].filter(x=>x<=t).at(-1)??0,next=hits.find(x=>x>t);if(hits.some(x=>t>=x&&t<=x+60))return{angle:0,contact:true};if(!next)return{angle:28*smooth(t,1410,1630),contact:false};const liftEnd=prior?prior+160:400,up=smooth(t,prior?prior+60:120,liftEnd),down=smooth(t,next-130,next);return{angle:28*up*(1-down),contact:false};}
export function washerPose(t:number){const sink=90*smooth(t,600,1100),lift=145*smooth(t,1650,2100),scrub=smooth(t,1100,1200)*(1-smooth(t,1550,1650));return{y:75+sink-lift,scrub,dripping:t>=1700&&t<2900};}

/** A connected jet, sampled from actual emission positions; its airborne tail survives uncork/return. */
export function poisonStreamPath(t:number):string {const points=Array.from({length:17},(_,i)=>{const age=i*10;return streamPoint(t-age,age);}).filter((p):p is Point=>!!p);return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');}

export function triangleMatrix(source:readonly [Point,Point,Point],target:readonly [Point,Point,Point]):string {const [a,b,c]=source,[p,q,r]=target,ux=b.x-a.x,uy=b.y-a.y,vx=c.x-a.x,vy=c.y-a.y,det=ux*vy-uy*vx,A=((q.x-p.x)*vy-(r.x-p.x)*uy)/det,C=(-(q.x-p.x)*vx+(r.x-p.x)*ux)/det,B=((q.y-p.y)*vy-(r.y-p.y)*uy)/det,D=(-(q.y-p.y)*vx+(r.y-p.y)*ux)/det;return `matrix(${A} ${B} ${C} ${D} ${p.x-A*a.x-C*a.y} ${p.y-B*a.x-D*a.y})`;}
/** Continuous connected surface: flower tips unfold; remote ribbon, seal and document stay still. */
export function flowerMesh(t:number){const amount=.08*(1-smooth(t,650,1750)),vertex=(x:number,y:number):Point=>{if(x===0||x===600||y===0||y===500)return{x,y};const dx=x-185,dy=y-190,weight=Math.exp(-Math.pow(dx/140,4)-Math.pow(dy/135,4));return{x:x-dx*weight*amount,y:y-dy*weight*amount*.7};};const triangles:{source:[Point,Point,Point];target:[Point,Point,Point]}[]=[];for(let y=0;y<4;y++)for(let x=0;x<6;x++){const a={x:x*100,y:y*125},b={x:(x+1)*100,y:y*125},c={x:x*100,y:(y+1)*125},d={x:(x+1)*100,y:(y+1)*125};for(const source of [[a,b,c],[b,d,c]] as [Point,Point,Point][])triangles.push({source,target:source.map(p=>vertex(p.x,p.y)) as [Point,Point,Point]});}return triangles;}

/** Orthographic fold about an arbitrary image-space seam; both hinge endpoints remain fixed. */
export function hingePlaneMatrix(a:Point,b:Point,angle:number):string {const length=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,vx=-uy,vy=ux,c=Math.cos(angle*Math.PI/180),A=ux*ux+c*vx*vx,B=ux*uy+c*vx*vy,D=uy*uy+c*vy*vy;return `matrix(${A} ${B} ${B} ${D} ${a.x-A*a.x-B*a.y} ${a.y-B*a.x-D*a.y})`;}

export type Quad=readonly [Point,Point,Point,Point];
export function quadTriangles(source:Quad,target:Quad){return [[0,1,3],[1,2,3]].map(indices=>({source:indices.map(i=>source[i]!) as [Point,Point,Point],target:indices.map(i=>target[i]!) as [Point,Point,Point]}));}
/** Subpixel overlap hides antialias seams; the material is still mapped by the exact shared vertices. */
export function overlapTriangle(points:readonly [Point,Point,Point],distance=.55):Point[]{const cross=(points[1].x-points[0].x)*(points[2].y-points[0].y)-(points[1].y-points[0].y)*(points[2].x-points[0].x),sign=cross>=0?1:-1;if(Math.abs(cross)<.000001)return points.map(p=>({...p}));return points.map((p,i)=>{const prev=points[(i+2)%3]!,next=points[(i+1)%3]!,a={x:p.x-prev.x,y:p.y-prev.y},b={x:next.x-p.x,y:next.y-p.y},al=Math.hypot(a.x,a.y),bl=Math.hypot(b.x,b.y),n1={x:sign*a.y/al,y:-sign*a.x/al},n2={x:sign*b.y/bl,y:-sign*b.x/bl},den=Math.max(.01,1+n1.x*n2.x+n1.y*n2.y),dx=(n1.x+n2.x)*distance/den,dy=(n1.y+n2.y)*distance/den,cap=Math.min(1,2/Math.hypot(dx,dy));return{x:p.x+dx*cap,y:p.y+dy*cap};});}

/** Uniform 1.2 scale; the fabric and its printed portraits share every strip. */
export function washerClothStrips(t:number,reduced=false){const p=washerPose(t);return Array.from({length:10},(_,i)=>{const sourceY=i*25,wave=reduced?0:Math.sin(t/85+i*.65)*p.scrub*(3+i*.5);return{sourceY,x:186+wave*1.2,y:p.y+sourceY*1.2,width:228,height:30.6,viewBox:`0 ${sourceY} 190 25.5`};});}
