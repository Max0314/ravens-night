import {roundTableLayout} from '@ravens/ui';

/** Television seats grow with the measured circle; phone geometry keeps its original caps. */
export function displayTableLayout(count:number,diameter:number){
 const base=roundTableLayout(count,diameter),padding=diameter*.035,gap=diameter*.01;
 const unit=base.points.map(point=>{const radius=Math.hypot(point.x-diameter/2,point.y-diameter/2);return radius?{x:(point.x-diameter/2)/radius,y:(point.y-diameter/2)/radius}:{x:0,y:0};});
 let separation=2;
 for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)separation=Math.min(separation,Math.max(Math.abs(unit[i]!.x-unit[j]!.x),Math.abs(unit[i]!.y-unit[j]!.y)));
 const seatSize=(separation*(diameter-2*padding)-2*gap)/(separation+2),portrait=Math.min(diameter*.135,seatSize*.72),radius=(diameter-seatSize-2*padding)/2;
 return{diameter,minimum:0,seatSize,portrait,points:unit.map(point=>({x:diameter/2+point.x*radius,y:diameter/2+point.y*radius}))};
}
