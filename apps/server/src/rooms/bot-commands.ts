import type {BotTestCommand,ControlResult,RoomCommandContext} from '@ravens/contracts';
import type {RoomService,ParticipantRecord} from './service.js';
import {bots} from './bot-types.js';
import {RoomError} from './errors.js';

/** Host-directed tests still submit ordinary, legal bot actions; no role-based actor selection. */
export function runBotCommand(service:RoomService,code:string,hostToken:string,command:BotTestCommand,targetSeat?:number):ControlResult {
  service.assertHost(code,hostToken);
  const room=service.find(code),game=room.game,phase=game?.publicProjection?.phase;
  if(!['END_DAY','NOMINATE_ONCE','SHOOT_ONCE'].includes(command))throw new RoomError('INVALID_REQUEST','请选择有效的人机命令',400,false);
  if(command==='END_DAY'&&targetSeat!==undefined)throw new RoomError('INVALID_REQUEST','结束白天无需选择目标',400,false);
  if(!game||!['DAY_DISCUSSION','NOMINATION','VOTING'].includes(phase??''))throw new RoomError('BOT_COMMAND_UNAVAILABLE','当前不是可操作的白天阶段',409,false);
  if(service.gameNow(room)<game.presentationUntil)throw new RoomError('BOT_COMMAND_UNAVAILABLE','公开演出正在进行，请稍后操作',409,false);
  const players=bots(room).sort((a,b)=>a.seat!-b.seat!);
  if(!players.length)throw new RoomError('BOT_COMMAND_UNAVAILABLE','房内没有人机玩家',409,false);
  const view=(bot:ParticipantRecord)=>service.privateView(code,service.internalBotToken(room,bot));
  const apply=(bot:ParticipantRecord,operation:(token:string)=>void)=>{
    const token=service.internalBotToken(room,bot),privateView=view(bot);
    const context:RoomCommandContext={roomInstanceId:room.roomInstanceId,setupId:room.setupId,expectedCommandVersion:bot.commandVersion,gameId:privateView.game!.gameId,contextId:privateView.contextId!};
    service.validateCommand(code,token,context,'GAME');
    operation(token);
    service.completeCommand(code,bot.id);
    room.botControl.pending=room.botControl.pending.filter(task=>task.botId!==bot.id);
  };
  if(command==='END_DAY'){
    if(!['DAY_DISCUSSION','NOMINATION'].includes(phase!))throw new RoomError('BOT_COMMAND_UNAVAILABLE','请先完成当前表决，再结束白天',409,false);
    const eligible=players.filter(bot=>{const v=view(bot);return v.canEndDay&&!v.dayReady;});
    for(const bot of eligible)apply(bot,token=>service.readyToEndDay(code,token,true));
    if(eligible.length)room.botControl.version++;
    return {status:eligible.length?'APPLIED':'UNCHANGED',executedCount:eligible.length,message:eligible.length?`已让 ${eligible.length} 名存活人机同意结束今天`:'存活人机已全部同意结束今天'};
  }
  const candidates=players.map(bot=>({bot,v:view(bot)})).filter(({v})=>command==='NOMINATE_ONCE'?v.canNominate:v.canClaimSlayer);
  if(!candidates.length)throw new RoomError('BOT_COMMAND_UNAVAILABLE',command==='NOMINATE_ONCE'?'当前没有具备提名资格的人机':'当前没有能再次公开宣称射击的人机',409,false);
  const picked=candidates.map(({bot,v})=>({bot,legal:(command==='NOMINATE_ONCE'?v.nominationTargets:v.dayAbilityTargets)??[]})).find(({legal})=>targetSeat===undefined?legal.length>0:legal.includes(targetSeat));
  if(!picked)throw new RoomError('BOT_TARGET_UNAVAILABLE','该目标当前不可用于这项操作，请重新选择',409,false);
  const target=targetSeat??picked.legal.find(seat=>seat!==picked.bot.seat&&game.publicProjection!.aliveSeats.includes(seat))??picked.legal[0]!;
  apply(picked.bot,token=>command==='NOMINATE_ONCE'?service.nominate(code,token,target):service.useDayAbility(code,token,target));
  room.botControl.version++;
  return {status:'APPLIED',executedCount:1,actorSeat:picked.bot.seat!,actorNickname:picked.bot.nickname,message:`[${picked.bot.nickname}]已提交${command==='NOMINATE_ONCE'?'提名':'公开射击宣称'}`};
}
