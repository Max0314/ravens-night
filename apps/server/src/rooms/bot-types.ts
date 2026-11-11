import {createHmac,randomUUID} from 'node:crypto';
import type {RoomTimeline} from '@ravens/contracts';
import type {RoomRecord,ParticipantRecord} from './service.js';
export type BotKind='READY'|'TUTORIAL_COMPLETE'|'CONFIRM_ROLE'|'NIGHT_ACTION'|'NOMINATE'|'VOTE'|'DAY_READY'|'SLAYER'|'WHISPER_ACCEPT'|'WHISPER_REPLY';
export interface BotTask {id:string;botId:string;sequence:number;controlGeneration:string;roomInstanceId:string;setupId:string;gameId?:string;contextId?:string;ballotId?:string;expectedBotCommandVersion:number;kind:BotKind;args:{targets?:number[];raised?:boolean;whisperId?:string;messageId?:string};dueGameAt:number;latestGameAt?:number}
export interface BotMemory {gameId?:string;knownTeamSeats:number[];ackedHumanMessageIds:string[];ballot?:{ballotId:string;initialSubmitted:boolean;correctionCount:0|1;lastRaised?:boolean;lastMasterRaised?:boolean}}
export interface BotControl {mode:'RUNNING'|'PAUSED';pace:'NORMAL'|'SLOW';attentionRequired:boolean;version:number;generation:string;nextSequence:number;seed:string;pending:BotTask[];memory:Record<string,BotMemory>}
export const MAX_BOTS=128;
export function newBotControl():BotControl{return{mode:'RUNNING',pace:'NORMAL',attentionRequired:false,version:0,generation:randomUUID(),nextSequence:1,seed:randomUUID(),pending:[],memory:{}};}
export const activePlayers=(room:RoomRecord)=>room.participants.filter(p=>p.mode==='PLAYER'&&!p.left);
export const humans=(room:RoomRecord)=>activePlayers(room).filter(p=>p.controller==='HUMAN');
export const bots=(room:RoomRecord)=>activePlayers(room).filter(p=>p.controller==='BOT');
export function botToken(secret:string,room:RoomRecord,bot:ParticipantRecord){return createHmac('sha256',secret).update(JSON.stringify(['rvn:bot:v1',room.roomInstanceId,bot.id])).digest('base64url');}
export function gameNow(room:Pick<RoomRecord,'timeline'>,wall:number){return room.timeline.mode==='MANUAL'?room.timeline.manualNowMs!:wall-room.timeline.offsetMs;}
export function setTimeline(room:RoomRecord,mode:RoomTimeline['mode'],wall:number){const current=gameNow(room,wall);if(mode===room.timeline.mode)return false;room.timeline=mode==='MANUAL'?{...room.timeline,mode,manualNowMs:current,epoch:room.timeline.epoch+1}:{mode,offsetMs:wall-current,epoch:room.timeline.epoch+1};return true;}
export function invalidateBots(room:RoomRecord){room.botControl.generation=randomUUID();room.botControl.pending=[];room.botControl.version++;}
export function exitIneligibleRehearsal(room:RoomRecord,wall:number){if(room.timeline.mode==='MANUAL'&&(humans(room).length!==1||!bots(room).length)){setTimeline(room,'WALL',wall);room.botControl.mode='RUNNING';}}
export function upgradeBotRoom(room:RoomRecord,wall:number){
  const legacy=(room.schemaVersion as number)!==3;
  if(legacy){
    room.lastHumanActivityAt=Number.isFinite(Date.parse(room.lastActivityAt))?Date.parse(room.lastActivityAt):wall;
    room.botControl=newBotControl();room.timeline={mode:'WALL',offsetMs:0,epoch:0};
    for(const p of room.participants)p.controller='HUMAN';
    if(!activePlayers(room).length&&room.state==='LOBBY')room.metadata={...room.metadata,pendingFirstJoin:true};
    if(room.game){room.game.hadBots=false;room.game.rehearsalUsed=false;}
    if(room.lastResult){room.lastResult.hadBots=false;room.lastResult.rehearsalUsed=false;room.lastResult.releasedWallAt=room.lastResult.releasedAt;for(const p of room.lastResult.participants)p.controller='HUMAN';}
    room.schemaVersion=3;
  }
  const fail=(category:string):never=>{throw new Error(`Room ${room.code}: invalid ${category}`);};
  if(!room.botControl||!room.timeline||!['WALL','MANUAL'].includes(room.timeline.mode)||!Number.isFinite(room.timeline.offsetMs)||!Number.isInteger(room.timeline.epoch)||!Number.isFinite(room.lastHumanActivityAt))fail('timeline or bot control');
  const control=room.botControl;
  if(!['RUNNING','PAUSED'].includes(control.mode)||!['NORMAL','SLOW'].includes(control.pace)||!Number.isInteger(control.version)||!Number.isInteger(control.nextSequence)||!control.seed||!control.generation||!control.memory||!Array.isArray(control.pending))fail('bot control');
  if(room.participants.some(p=>!['HUMAN','BOT'].includes(p.controller)||p.controller==='BOT'&&(p.mode!=='PLAYER'||!!p.accountId||!!p.joinTicket)))fail('controllers');
  const people=humans(room),machines=bots(room),players=activePlayers(room);
  if(machines.length&&!people.length)fail('missing human');
  if(players.length&&!people.some(p=>p.id===room.organizerParticipantId))fail('human host');
  if(!players.length&&(room.state!=='LOBBY'||room.game||!room.metadata?.pendingFirstJoin))fail('empty room');
  if(room.timeline.mode==='MANUAL'&&(people.length!==1||!machines.length||control.mode!=='PAUSED'||!Number.isFinite(room.timeline.manualNowMs)))fail('manual clock');
  const integer=(v:unknown)=>Number.isSafeInteger(v);
  const text=(v:unknown)=>typeof v==='string'&&v.length>0;
  const kinds:BotKind[]=['READY','TUTORIAL_COMPLETE','CONFIRM_ROLE','NIGHT_ACTION','NOMINATE','VOTE','DAY_READY','SLAYER','WHISPER_ACCEPT','WHISPER_REPLY'];
  const validTask=(t:BotTask)=>{
    if(!t||!text(t.id)||!text(t.botId)||!text(t.controlGeneration)||!text(t.roomInstanceId)||!text(t.setupId)||!integer(t.sequence)||t.sequence<1||!integer(t.expectedBotCommandVersion)||t.expectedBotCommandVersion<0||!integer(t.dueGameAt)||t.latestGameAt!==undefined&&!integer(t.latestGameAt)||!kinds.includes(t.kind)||!t.args||typeof t.args!=='object'||Array.isArray(t.args)||Buffer.byteLength(JSON.stringify(t.args),'utf8')>2048)return false;
    if([t.gameId,t.contextId,t.ballotId].some(v=>v!==undefined&&!text(v)))return false;
    const keys=Object.keys(t.args),targets=t.args.targets;
    if(['NIGHT_ACTION','NOMINATE','SLAYER'].includes(t.kind))return keys.length===1&&Array.isArray(targets)&&targets.length>=1&&targets.length<=2&&new Set(targets).size===targets.length&&targets.every(v=>integer(v)&&v>=1&&v<=12)&&(t.kind==='NIGHT_ACTION'||targets.length===1);
    if(t.kind==='VOTE')return keys.length===1&&typeof t.args.raised==='boolean'&&text(t.ballotId);
    if(t.kind==='WHISPER_ACCEPT')return keys.length===1&&text(t.args.whisperId);
    if(t.kind==='WHISPER_REPLY')return keys.length===2&&text(t.args.whisperId)&&text(t.args.messageId);
    return keys.length===0;
  };
  if(control.pending.length>machines.length||new Set(control.pending.map(t=>t.botId)).size!==control.pending.length||control.pending.some(t=>!validTask(t)||!machines.some(p=>p.id===t.botId)))fail('bot tasks');
  if(typeof control.memory!=='object'||Array.isArray(control.memory)||Object.entries(control.memory).some(([id,m])=>!machines.some(p=>p.id===id)||!m||!Array.isArray(m.knownTeamSeats)||m.knownTeamSeats.length>12||m.knownTeamSeats.some(v=>!integer(v)||v<1||v>12)||!Array.isArray(m.ackedHumanMessageIds)||m.ackedHumanMessageIds.length>80||m.ackedHumanMessageIds.some(v=>!text(v))||m.gameId!==undefined&&!text(m.gameId)||m.ballot&&(!text(m.ballot.ballotId)||typeof m.ballot.initialSubmitted!=='boolean'||![0,1].includes(m.ballot.correctionCount)||m.ballot.lastRaised!==undefined&&typeof m.ballot.lastRaised!=='boolean'||m.ballot.lastMasterRaised!==undefined&&typeof m.ballot.lastMasterRaised!=='boolean')))fail('bot memory');
  if(room.game?.publicProjection){if(legacy)room.game.publicProjection.publishedPhaseStartedAt??=gameNow(room,wall);if(!integer(room.game.publicProjection.publishedPhaseStartedAt))fail('published phase start');}
}
