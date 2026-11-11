import {playerLabel} from '@ravens/ui';
import {useEffect,useState} from 'react';
import type {BotTestCommand,ControlResult} from '@ravens/contracts';
import {hasPendingCommand,retryPendingCommand,runBotCommand,type PrivateView,type RoomView} from '../api.js';
import {useGameClock} from '../use-game-clock.js';
import {RoomSheet} from './RoomPage.js';

export interface BotCommandReceipt {gameId?:string;result:ControlResult}

export function BotRehearsalCommands({room,view,busy,run,error,receipt}:{room:RoomView;view:PrivateView;busy:boolean;run:(action:()=>Promise<unknown>)=>Promise<void>;error?:string|undefined;receipt?:BotCommandReceipt|undefined}){
 const[target,setTarget]=useState<number>(),[pending,setPending]=useState<BotTestCommand>(),[notice,setNotice]=useState('');
 const game=room.game??view.game,now=useGameClock(game,room),scope=[room.roomInstanceId,game?.gameId,game?.contextId,game?.nomination?.ballotId].join(':');
 useEffect(()=>{setTarget(undefined);setPending(undefined);},[scope]);
 useEffect(()=>{setNotice('');},[room.roomInstanceId,game?.gameId]);
 const day=!!game&&['DAY_DISCUSSION','NOMINATION'].includes(game.phase),hasBots=(room.botCount??0)>0,locked=(game?.presentationUntil??0)>now;
 const shootPhase=!!game&&['DAY_DISCUSSION','NOMINATION','VOTING'].includes(game.phase);
 const queuePending=hasPendingCommand(room.code);
 const available=day&&hasBots&&!locked&&!busy,shootAvailable=shootPhase&&hasBots&&!locked&&!busy;
 const canExecute=(command:BotTestCommand)=>command==='SHOOT_ONCE'?shootAvailable:available;
 const reason=!hasBots?'先在大厅添加人机':!shootPhase?'白天阶段可执行':!day?'表决期间仅可发起枪击':locked?'当前演出结束后可执行':'';
 function accept(result:ControlResult|undefined){if(!result)return;setPending(undefined);setNotice(result.message??(result.actorSeat?`已由 ${playerLabel(result.actorSeat,result.actorNickname??'人机')} 执行`:result.status==='WAITING'?'当前没有符合条件的人机':result.status==='UNCHANGED'?'人机已全部同意结束今天':`已让 ${result.executedCount??0} 个人机执行`));}
 useEffect(()=>{if(receipt&&receipt.gameId===game?.gameId)accept(receipt.result);},[receipt]);
 const selected=game?.seats.find(p=>p.seat===target),selectedLabel=selected?playerLabel(selected.seat,selected.nickname):'所选玩家';
 async function apply(command:BotTestCommand){setNotice('');await run(async()=>{const result=await runBotCommand(room.code,command,command==='END_DAY'?undefined:target);accept(result.controlResult);return result;});}
 async function retry(){await run(async()=>{const result=await retryPendingCommand(room.code) as PrivateView;accept(result.controlResult);return result;});}
 return <section className="bot-rehearsal-commands" aria-label="人机测试命令"><h4>本局测试</h4><p>由符合规则的人机执行，结果显示执行者。</p><label>目标玩家<select aria-label="人机测试目标" value={target??''} disabled={!shootAvailable||queuePending} onChange={e=>setTarget(e.target.value?Number(e.target.value):undefined)}><option value="">请选择玩家</option>{game?.seats.map(p=><option key={p.seat} value={p.seat}>{playerLabel(p.seat,p.nickname)}{p.alive?'':'（已死亡）'}</option>)}</select></label><div className="bot-rehearsal-actions"><button type="button" disabled={!available||queuePending} onClick={()=>setPending('END_DAY')}>结束本天</button><button type="button" disabled={!available||queuePending||!selected} onClick={()=>setPending('NOMINATE_ONCE')}>提名一次</button><button type="button" disabled={!shootAvailable||queuePending||!selected} onClick={()=>setPending('SHOOT_ONCE')}>发起枪击</button></div>{reason?<p className="bot-command-reason">{reason}</p>:null}{notice?<p role="status" className="bot-command-result">{notice}</p>:null}
 {pending?<RoomSheet title="执行人机测试" confirmation onClose={()=>{if(!busy)setPending(undefined);}} actions={<><button type="button" disabled={queuePending?busy:!canExecute(pending)||(pending!=='END_DAY'&&!selected)} onClick={()=>void (queuePending?retry():apply(pending))}>{queuePending?'重试原操作':'确认执行'}</button><button type="button" disabled={busy} onClick={()=>setPending(undefined)}>取消</button></>}><p>{pending==='END_DAY'?'让所有存活人机同意结束今天；真人仍自行决定。':pending==='NOMINATE_ONCE'?`让一名合法人机提名 ${selectedLabel}。`:`让一名合法人机向 ${selectedLabel} 公开宣称射击。`}</p>{error?<p role="alert">{error}</p>:null}</RoomSheet>:null}</section>;
}
