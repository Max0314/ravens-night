import type {GameView,RoomView} from './api.js';
import {isOlderSnapshot,type SnapshotOrder} from './snapshot-order.js';

/** Local receipt facts only: no fields are added to HTTP/WS protocol objects. */
export interface RoomAudioDelivery {generation:number;historyThrough:number;historyIds:ReadonlySet<string>;liveIds:ReadonlySet<string>}
export interface RoomAudioObservation {liveKind:'NOMINATION'|'VOTE_RESULT';afterSeq:number}
type View=SnapshotOrder&{game?:GameView;room?:RoomView};
type Recovery={roomInstanceId:string|undefined;gameId:string|undefined;through:number;ids:ReadonlySet<string>;liveIds:Set<string>};
type DeliveryState={generation:number;recovering:boolean;feedLive:boolean;last?:SnapshotOrder;baseline?:Recovery};
const states=new Map<string,DeliveryState>();let receipts=new WeakMap<GameView,RoomAudioDelivery>();
const key=(code:string,mode:string)=>code.toUpperCase()+':'+mode;
function state(code:string,mode:string){const id=key(code,mode);let row=states.get(id);if(!row){row={generation:0,recovering:false,feedLive:false};states.set(id,row);}return row;}
function gap(row:DeliveryState){if(!row.recovering){row.generation++;row.recovering=true;}}
/** Only loss of a feed that really delivered data starts a recovery. Constructor retries do not. */
export function roomAudioFeedLive(code:string,mode:string){state(code,mode).feedLive=true;}
export function roomAudioFeedClosed(code:string,mode:string){const row=state(code,mode);if(row.feedLive)gap(row);row.feedLive=false;}
export function roomAudioFeedStopped(code:string,mode:string){state(code,mode).feedLive=false;}
/** An isolated polling failure cannot reset a healthy WebSocket stream's history. */
export function roomAudioRequestFailed(code:string,mode:string){const row=state(code,mode);if(!row.feedLive)gap(row);}
export function resetRoomAudioDeliveries(){states.clear();receipts=new WeakMap();}
export function roomAudioDelivery(game:GameView){return receipts.get(game);}
export function observeRoomAudioDelivery(code:string,incoming:View,mode:string,observation?:RoomAudioObservation){
 const room=incoming.room??incoming,game=incoming.game??incoming.room?.game;
 // Command acknowledgements without a room snapshot must not consume a pending recovery.
 if(!game&&!incoming.room&&!('participants'in incoming))return;
 const row=state(code,mode),live=observation?(game?.events??[]).filter(event=>event.kind===observation.liveKind&&event.seq>observation.afterSeq).at(-1):undefined;
 const confirm=()=>{const baseline=row.baseline;if(live?.id&&baseline&&baseline.roomInstanceId===room.roomInstanceId&&baseline.gameId===game?.gameId)baseline.liveIds.add(live.id);};
 if(isOlderSnapshot(room,row.last)){confirm();return;}row.last=room;
 if(row.recovering){row.recovering=false;row.baseline={roomInstanceId:room.roomInstanceId,gameId:game?.gameId,through:Math.max(-Infinity,...(game?.events??[]).map(event=>event.seq)),ids:new Set((game?.events??[]).flatMap(event=>event.id?[event.id]:[])),liveIds:new Set()};}
 // A command's broadcast can beat its ACK. Persist this receipt exception across later snapshots.
 confirm();
 const baseline=row.baseline,same=baseline&&baseline.roomInstanceId===room.roomInstanceId&&baseline.gameId===game?.gameId;
 const receipt:RoomAudioDelivery={generation:row.generation,historyThrough:same?baseline.through:-Infinity,historyIds:same?baseline.ids:new Set(),liveIds:same?baseline.liveIds:new Set()};
 // A public/private packet may be observed twice. Both games retain the same immutable baseline.
 for(const value of new Set([incoming.game,incoming.room?.game]))if(value)receipts.set(value,receipt);
}
