import {createHash} from 'node:crypto';
import type {PrivateView,ControlResult,RoomCommandContext} from '@ravens/contracts';
import type {RoomService,RoomRecord,ParticipantRecord} from './service.js';
import {bots,humans,type BotTask,type BotMemory,invalidateBots} from './bot-types.js';
import {RoomError} from './errors.js';
import {chooseBotAction} from './bot-policy.js';
import {socialView,respondWhisper,sendWhisper} from './social.js';
function memory(room:RoomRecord,bot:ParticipantRecord):BotMemory{return room.botControl.memory[bot.id]??=(room.game?{gameId:room.game.gameId,knownTeamSeats:[],ackedHumanMessageIds:[]}:{knownTeamSeats:[],ackedHumanMessageIds:[]});}
function observe(service:RoomService,room:RoomRecord,bot:ParticipantRecord){const token=service.internalBotToken(room,bot);return{...service.privateView(room.code,token),room:service.publicView(room.code),...socialView(room,token)} as unknown as PrivateView;}
function stale(room:RoomRecord,task:BotTask){
  const p=bots(room).find(p=>p.id===task.botId),projection=room.game?.publicProjection;
  return task.kind==='NOMINATE'&&room.botControl.autoNominate!==true||!p||task.controlGeneration!==room.botControl.generation||task.roomInstanceId!==room.roomInstanceId||task.setupId!==room.setupId||task.expectedBotCommandVersion!==p.commandVersion||task.gameId!==room.game?.gameId||(task.kind==='VOTE'?task.ballotId!==projection?.nomination?.ballotId:task.contextId!==projection?.contextId);
}
function prepare(service:RoomService,room:RoomRecord){
  const c=room.botControl,before=c.pending.length;c.pending=c.pending.filter(t=>!stale(room,t));if(c.pending.length!==before)service.touchScheduling(room);
  for(const bot of bots(room)){
    if(c.pending.some(t=>t.botId===bot.id))continue;
    const m=memory(room,bot),view=observe(service,room,bot),intent=chooseBotAction({view,memory:m,seed:c.seed,now:service.gameNow(room),slow:c.pace==='SLOW'});
    if(!intent)continue;
    const sequence=c.nextSequence++,projection=room.game?.publicProjection;
    const task:BotTask={id:createHash('sha256').update(JSON.stringify([room.roomInstanceId,c.generation,bot.id,sequence])).digest('hex'),botId:bot.id,sequence,controlGeneration:c.generation,roomInstanceId:room.roomInstanceId,setupId:room.setupId,expectedBotCommandVersion:bot.commandVersion,kind:intent.kind,args:intent.args,dueGameAt:service.gameNow(room)+intent.delay,...(room.game?{gameId:room.game.gameId,contextId:projection!.contextId}:{}),...(intent.kind==='VOTE'?{ballotId:projection!.nomination!.ballotId}:{}),...(intent.latest!==undefined?{latestGameAt:intent.latest}:{})};
    c.pending.push(task);service.touchScheduling(room);
  }
}
function execute(service:RoomService,room:RoomRecord,task:BotTask):boolean{
  if(stale(room,task))return false;
  const bot=bots(room).find(p=>p.id===task.botId)!,token=service.internalBotToken(room,bot),view=observe(service,room,bot),m=memory(room,bot);
  if((room.game?.presentationUntil??0)>service.gameNow(room))return false;
  const context:RoomCommandContext={roomInstanceId:task.roomInstanceId,setupId:task.setupId,expectedCommandVersion:task.expectedBotCommandVersion,...(task.gameId?{gameId:task.gameId}:{}),...(task.contextId?{contextId:task.contextId}:{}),...(task.ballotId?{ballotId:task.ballotId}:{})};
  const key=createHash('sha256').update(`${token}:${task.id}`).digest('hex'),fingerprint=createHash('sha256').update(JSON.stringify([task.kind,task.args,context])).digest('hex');
  const receipts=(room.metadata?.commandReceipts??{}) as Record<string,{fingerprint:string;kind:'view'}>;
  if(receipts[key]){if(receipts[key]!.fingerprint!==fingerprint)throw new Error('Bot receipt mismatch');room.botControl.pending=room.botControl.pending.filter(t=>t.id!==task.id);service.touchScheduling(room);return false;}
  service.validateCommand(room.code,token,context,task.kind==='VOTE'?'BALLOT':['READY','TUTORIAL_COMPLETE'].includes(task.kind)?'ROOM':task.kind.startsWith('WHISPER')?'OPTIONAL_GAME':'GAME');
  switch(task.kind){
    case 'READY':service.setReady(room.code,token,true);break;
    case 'TUTORIAL_COMPLETE':service.completeTutorial(room.code,token);break;
    case 'CONFIRM_ROLE':service.confirmRole(room.code,token);break;
    case 'ACK_START_INFO':service.acknowledgeStartInfo(room.code,token,task.args.infoId!);break;
    case 'NIGHT_ACTION':service.submitAction(room.code,token,task.args.targets!);break;
    case 'NOMINATE':service.nominate(room.code,token,task.args.targets![0]!);break;
    case 'VOTE':
      if(!view.canVote||view.role?.roleId==='butler'&&view.game?.seats.find(p=>p.seat===bot.seat)?.alive&&task.args.raised&&!view.butler?.masterRaised)return false;
      service.vote(room.code,token,task.args.raised!);
      const ballotId=task.ballotId!;if(m.ballot?.ballotId!==ballotId)m.ballot={ballotId,initialSubmitted:false,correctionCount:0};
      if(m.ballot.initialSubmitted)m.ballot.correctionCount=1;m.ballot.initialSubmitted=true;m.ballot.lastRaised=task.args.raised!;m.ballot.lastMasterRaised=view.butler?.masterRaised??false;break;
    case 'DAY_READY':if(view.dayReady)return false;service.readyToEndDay(room.code,token);break;
    case 'SLAYER':service.useDayAbility(room.code,token,task.args.targets![0]!);break;
    case 'WHISPER_ACCEPT':{const invite=view.social?.invitations.find(i=>i.id===task.args.whisperId&&i.status.toUpperCase()==='PENDING'&&i.toSeat===bot.seat);if(!invite||!humans(room).some(p=>p.seat===invite.fromSeat))return false;respondWhisper(room,token,task.args.whisperId!,true);break;}
    case 'WHISPER_REPLY':{const active=view.social?.activeWhisper,message=active?.messages.find(m=>m.id===task.args.messageId);if(active?.id!==task.args.whisperId||!message||!humans(room).some(p=>p.seat===message.seat)||m.ackedHumanMessageIds.includes(message.id))return false;sendWhisper(room,token,task.args.whisperId!,'已收到你的消息。');m.ackedHumanMessageIds=[...m.ackedHumanMessageIds,task.args.messageId!].slice(-80);break;}
  }
  service.completeCommand(room.code,bot.id);receipts[key]={fingerprint,kind:'view'};const keys=Object.keys(receipts);for(const old of keys.slice(0,Math.max(0,keys.length-256)))delete receipts[old];room.metadata={...room.metadata,commandReceipts:receipts};room.botControl.pending=room.botControl.pending.filter(t=>t.id!==task.id);service.touchScheduling(room);return true;
}
function attempt(service:RoomService,room:RoomRecord,task:BotTask){const backup=service.snapshot(room.code);try{const applied=execute(service,room,task);if(!applied){room.botControl.pending=room.botControl.pending.filter(t=>t.id!==task.id);service.touchScheduling(room);}return applied;}catch(error){service.restore([backup]);const current=service.find(room.code);current.botControl.pending=current.botControl.pending.filter(t=>t.id!==task.id);if(!(error instanceof RoomError&&error.status===409)){current.botControl.mode='PAUSED';current.botControl.attentionRequired=true;invalidateBots(current);}service.touchScheduling(current);return false;}}
let round=0;
export function runBots(service:RoomService){
  const codes=service.listCodes();if(!codes.length)return;
  const eligible:RoomRecord[]=[],committedTasks=new Set(codes.flatMap(code=>service.find(code).botControl.pending.map(t=>t.id)));
  for(const code of codes){const room=service.find(code);if(bots(room).length&&service.botControlView(room).effectiveMode==='RUNNING'&&room.timeline.mode==='WALL'){prepare(service,room);eligible.push(room);}}
  const ordered=eligible.slice(round%Math.max(1,eligible.length)).concat(eligible.slice(0,round%Math.max(1,eligible.length)));round++;
  const candidates=ordered.map(room=>({room,task:room.botControl.pending.filter(t=>committedTasks.has(t.id)&&t.dueGameAt<=service.gameNow(room)).sort((a,b)=>(a.latestGameAt??Infinity)-(b.latestGameAt??Infinity)||a.sequence-b.sequence)[0]})).filter((x):x is {room:RoomRecord;task:BotTask}=>!!x.task).sort((a,b)=>(a.task.latestGameAt??Infinity)-(b.task.latestGameAt??Infinity));
  for(const {room,task}of candidates.slice(0,8))attempt(service,room,task);
}
export function stepBot(service:RoomService,code:string,token:string):ControlResult{
  service.assertHost(code,token);const room=service.find(code);if(room.botControl.mode!=='PAUSED')throw new RoomError('MODE_CONFLICT','请先暂停人机');
  if((room.game?.presentationUntil??0)>service.gameNow(room))return{status:'WAITING'};
  prepare(service,room);const task=room.botControl.pending.sort((a,b)=>(a.latestGameAt??Infinity)-(b.latestGameAt??Infinity)||a.sequence-b.sequence)[0];
  if(!task)return{status:'WAITING'};if(!attempt(service,room,task))return{status:'WAITING'};
  service.find(code).botControl.version++;return{status:'APPLIED'};
}
