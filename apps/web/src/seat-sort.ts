export interface Point {x:number;y:number}
export interface Slot extends Point {width:number;height:number}
export function moveSeat(ids:string[],id:string,index:number){const next=ids.filter(v=>v!==id);next.splice(Math.max(0,Math.min(index,next.length)),0,id);return next;}
export function insertionSlot(slots:Slot[],point:Point,current:number,hysteresis=6){
  if(!slots.length)return 0;
  const rows: Array<{y:number;indices:number[]}>=[];
  slots.forEach((slot,i)=>{let row=rows.find(r=>Math.abs(r.y-slot.y)<2);if(!row){row={y:slot.y,indices:[]};rows.push(row);}row.indices.push(i);});
  const row=rows.reduce((best,r)=>Math.abs(point.y-(r.y+slots[r.indices[0]!]!.height/2))<Math.abs(point.y-(best.y+slots[best.indices[0]!]!.height/2))?r:best);
  const candidate=row.indices.reduce((best,i)=>Math.abs(point.x-(slots[i]!.x+slots[i]!.width/2))<Math.abs(point.x-(slots[best]!.x+slots[best]!.width/2))?i:best);
  const prior=slots[current],next=slots[candidate]!;
  if(prior&&candidate!==current){const axis=Math.abs(prior.y-next.y)>2?'y':'x',dimension=axis==='x'?'width':'height',a=prior[axis]+prior[dimension]/2,b=next[axis]+next[dimension]/2,middle=(a+b)/2;if(b>a?point[axis]<middle+hysteresis:point[axis]>middle-hysteresis)return current;}
  return candidate;
}
export function spring(position:number,velocity:number,target:number,dt:number){
  // Substeps keep the specified spring stable after a dropped mobile frame.
  let remaining=Math.min(.032,Math.max(0,dt));while(remaining>0){const h=Math.min(.008,remaining);velocity+=(420*(target-position)-36*velocity)*h;position+=velocity*h;remaining-=h;}
  return Math.abs(target-position)<.5&&Math.abs(velocity)<5?{position:target,velocity:0}:{position,velocity};
}
