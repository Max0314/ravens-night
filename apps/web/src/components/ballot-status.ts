import type {GameView,RoomView} from '../api.js';

/** Presentation pauses shift the server anchors atomically; never start a local ballot clock. */
export function simultaneousBallotStatus(game:GameView,room:RoomView|undefined,now:number){
 const ballot=game.phase==='VOTING'?game.nomination:undefined;
 if(ballot?.mode!=='SIMULTANEOUS')return undefined;
 const at=Math.max(now,game.presentationUntil??0);
 const started=ballot.countdownStarted===true||ballot.voteStartsAt!==undefined&&at>=ballot.voteStartsAt;
 const locked=ballot.voteEndsAt!==undefined&&at>=ballot.voteEndsAt;
 const end=ballot.voteEndsAt;
 const seconds=end===undefined?undefined:Math.max(0,Math.ceil((end-at)/1000));
 const paused=room?.timeline?.mode==='MANUAL'||(game.presentationUntil??0)>now;
 const timeLabel=locked?'等待结算':seconds===undefined?'等待表决':`剩余 ${seconds}秒${paused?' · 暂停':''}`;
 return {started,locked,paused,seconds,timeLabel,total:ballot.votersRequired??game.seats.length};
}
