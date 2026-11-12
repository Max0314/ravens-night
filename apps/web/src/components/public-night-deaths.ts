import {experienceTiming} from '@ravens/contracts';
import type {GameView} from '../api.js';

/** Public dawn announcements only; a mark never asserts who caused the death. */
export function publicNightDeathSeats(game:GameView):number[]{
 const announced=new Set<number>();
 for(const event of game.events){
  if(event.kind!=='DAWN'||event.outcome!=='DEATH'||event.startsAt===undefined)continue;
  if((game.serverNow??0)<event.startsAt+experienceTiming('DAWN',event.timingVersion??1).resultOffset)continue;
  for(const seat of event.seats??[])announced.add(seat);
 }
 return game.seats.filter(p=>!p.alive&&announced.has(p.seat)).map(p=>p.seat);
}
