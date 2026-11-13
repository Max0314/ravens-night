import type {roundTableLayout} from './round-table.js';
type Layout=ReturnType<typeof roundTableLayout>;
export interface MarkerRect {x:number;y:number;width:number;height:number}
export interface SeatMarkerPlacement extends MarkerRect {seat:number;lines:string[]}
export const markerOverlap=(a:MarkerRect,b:MarkerRect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const glyph=(c:string)=>/[ -~]/.test(c)?4.8:8;
function linesFor(text:string,maxWidth=48){text=text.replace(/^① /,'');const parts=text.split(' · '),candidate=parts.find(p=>p.includes('可能是'));if(candidate&&parts.length>1)text=candidate+` +${parts.length-1}`;const lines:string[]=[];let line='',width=0;for(const c of text){const size=glyph(c);if(width+size>maxWidth&&line){lines.push(line);line='';width=0;}line+=c;width+=size;}if(line)lines.push(line);return lines;}
/** Places only nearby private badges; portrait centers/radii and font sizes are inputs, never outputs. */
export function layoutSeatMarkers(layout:Layout,seats:readonly {seat:number;caged?:boolean|undefined;execution?:boolean|undefined}[],marks:Readonly<Record<number,string>>,extraNameLine=false,compact=false){
 const avatarOffset=extraNameLine?12:6,half=layout.portrait/2,obstacles:MarkerRect[]=[],portraits:{x:number;y:number;r:number}[]=[];
 layout.points.forEach((p,index)=>{const top=p.y-avatarOffset-half,left=p.x-half;portraits.push({x:p.x,y:p.y-avatarOffset,r:half+4});if(seats[index]?.caged)obstacles.push({x:left-layout.portrait*.14,y:top-layout.portrait*.14,width:layout.portrait*1.28,height:layout.portrait*1.28});if(seats[index]?.execution)obstacles.push({x:p.x-19,y:p.y+layout.seatSize/2-1,width:38,height:14});obstacles.push({x:p.x-layout.seatSize/2,y:top+layout.portrait,width:layout.seatSize,height:extraNameLine?24:12},{x:left-3,y:top-23,width:17,height:15});});
 const center={x:layout.diameter*.30,y:layout.diameter*.30,width:layout.diameter*.40,height:layout.diameter*.40};
 const items=seats.flatMap((seat,index)=>{const text=marks[seat.seat];if(!text)return[];const p=layout.points[index]!,cy=p.y-avatarOffset,candidates:(MarkerRect&{lines:string[]})[]=[];
  for(const wrapWidth of [48,32,24]){const lines=linesFor(text,wrapWidth),width=Math.ceil(Math.max(...lines.map(line=>[...line].reduce((sum,c)=>sum+glyph(c),0)))+8),height=lines.length*11+6;
   for(let dx=-72;dx<=72;dx+=4)for(let dy=-72;dy<=72;dy+=4){
    const box={x:p.x+dx-width/2,y:cy+dy-height/2,width,height};
    if(Math.hypot(dx,dy)>84||box.x<2||box.y<2||box.x+width>layout.diameter-2||box.y+height>layout.diameter-2||obstacles.some(o=>markerOverlap(box,o))||portraits.some(p=>Math.hypot(p.x-Math.max(box.x,Math.min(box.x+box.width,p.x)),p.y-Math.max(box.y,Math.min(box.y+box.height,p.y)))<p.r)||markerOverlap(box,center))continue;
    candidates.push({...box,lines});
   }
  }
  candidates.sort((a,b)=>Math.hypot(a.x+a.width/2-p.x,a.y+a.height/2-cy)+a.height*.25-Math.hypot(b.x+b.width/2-p.x,b.y+b.height/2-cy)-b.height*.25);
  return [{seat:seat.seat,candidates:[...new Map(candidates.map(c=>[[c.x,c.y,c.width,c.height].join(','),c])).values()].slice(0,120)}];
 });
 const placed=new Map<number,SeatMarkerPlacement>();let attempts=0;
 function visit(todo:typeof items):boolean{if(!todo.length)return true;if(++attempts>12000)return false;
  const options=todo.map(item=>({item,free:item.candidates.filter(c=>![...placed.values()].some(p=>markerOverlap(c,p)))})).sort((a,b)=>a.free.length-b.free.length),next=options[0]!;
  for(const candidate of next.free){placed.set(next.item.seat,{...candidate,seat:next.item.seat,lines:candidate.lines});if(visit(todo.filter(item=>item!==next.item)))return true;placed.delete(next.item.seat);}return false;
 }
 if(!visit(items)){
  if(!compact)return layoutSeatMarkers(layout,seats,Object.fromEntries(Object.entries(marks).map(([seat,text])=>[seat,text.includes('可能是')?'可能是':text.split(/[ ·]+/)[0]!])),extraNameLine,true);
  // Keep every badge next to its owner and clear of faces even in an overfull legacy snapshot.
  placed.clear();for(const item of items){const candidate=item.candidates.find(c=>![...placed.values()].some(p=>markerOverlap(c,p)))??item.candidates[0];if(candidate)placed.set(item.seat,{...candidate,seat:item.seat,lines:candidate.lines});}
 }
 return [...placed.values()];
}
