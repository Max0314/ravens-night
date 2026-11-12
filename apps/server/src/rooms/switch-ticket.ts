import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {hashOpaqueToken} from '../auth/session.js';
import type {RoomRecord,ParticipantRecord,RoomService} from './service.js';
import {RoomError} from './errors.js';

const TICKET_MS=5*60_000;
export const TRANSFER_RECEIPT_MS=24*60*60_000;
export const TRANSFER_RECEIPT_LIMIT=256;
export interface SwitchTicket {
  version:1;sourceCode:string;sourceInstance:string;hostId:string;hostHash:string;sourceAccountDigest:string;
  targetCode:string;targetInstance:string;actorDigest:string;issuedAt:number;expiresAt:number;nonce:string;
}
export interface JoinTransferReceipt {
  sourceCode:string;sourceInstance:string;targetInstance:string;sourceActorHash:string;
  participantId:string;credentialKind:'NEW_GUEST_TICKET'|'EXISTING_GUEST_COOKIE'|'ACCOUNT';
  targetCredentialHash:string;accountId?:string;fingerprint:string;expiresAt:number;
}
const mac=(secret:string,parts:unknown[])=>createHmac('sha256',secret).update(JSON.stringify(parts)).digest('base64url');
export const switchActorDigest=(secret:string,sub?:string)=>sub?mac(secret,['ravens-switch-actor-v1',sub]):'GUEST';
export function issueSwitchTicket(secret:string,source:RoomRecord,host:ParticipantRecord,target:RoomRecord,sub:string|undefined,now:number){
  const payload:SwitchTicket={version:1,sourceCode:source.code,sourceInstance:source.roomInstanceId,hostId:host.id,hostHash:host.tokenHash,sourceAccountDigest:switchActorDigest(secret,host.accountId),targetCode:target.code,targetInstance:target.roomInstanceId,actorDigest:switchActorDigest(secret,sub),issuedAt:now,expiresAt:now+TICKET_MS,nonce:randomBytes(32).toString('base64url')};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return{switchTicket:encoded+'.'+mac(secret,['ravens-switch-ticket-v1',encoded]),expiresAt:payload.expiresAt,source:{code:source.code,roomInstanceId:source.roomInstanceId,state:source.state,activeHumanCount:source.participants.filter(p=>p.mode==='PLAYER'&&!p.left&&p.controller==='HUMAN').length,playerCount:source.playerCount}};
}
export function parseSwitchTicket(secret:string,raw:unknown):SwitchTicket{
  try{
    if(typeof raw!=='string'||raw.length>2000)throw Error();
    const[encoded,signature,...extra]=raw.split('.');if(!encoded||!signature||extra.length)throw Error();
    const expected=Buffer.from(mac(secret,['ravens-switch-ticket-v1',encoded])),actual=Buffer.from(signature);
    if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error();
    const v=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')) as SwitchTicket;
    if(v.version!==1||!['sourceCode','sourceInstance','hostId','hostHash','sourceAccountDigest','targetCode','targetInstance','actorDigest','nonce'].every(k=>typeof v[k as keyof SwitchTicket]==='string'&&String(v[k as keyof SwitchTicket]).length>0)||!/^[A-Z2-9]{6}$/.test(v.sourceCode)||!/^[A-Z2-9]{6}$/.test(v.targetCode)||v.sourceCode===v.targetCode||!Number.isFinite(v.issuedAt)||v.expiresAt!==v.issuedAt+TICKET_MS)throw Error();
    return v;
  }catch{throw new RoomError('SWITCH_TICKET_INVALID','换房确认凭据无效，请重新确认',400);}
}
export function validateSwitchSource(service:RoomService,ticket:SwitchTicket,secret:string,sub:string|undefined,now:number){
  if(ticket.actorDigest!==switchActorDigest(secret,sub))throw new RoomError('ACCOUNT_MISMATCH','登录身份已变化，请重新确认换房',403);
  if(ticket.issuedAt>now||ticket.expiresAt<=now)throw new RoomError('SWITCH_TICKET_EXPIRED','换房确认已过期，请重新确认');
  let source:RoomRecord;try{source=service.find(ticket.sourceCode);}catch{throw new RoomError('SOURCE_ROOM_GONE','原房间已结束，请确认后正常加入新房间');}
  if(source.roomInstanceId!==ticket.sourceInstance)throw new RoomError('ROOM_INSTANCE_CHANGED','原房间已变化，请重新确认');
  const host=source.participants.find(p=>p.id===ticket.hostId&&!p.left&&p.mode==='PLAYER'&&p.controller==='HUMAN');
  if(!host||source.organizerParticipantId!==host.id||host.tokenHash!==ticket.hostHash||switchActorDigest(secret,host.accountId)!==ticket.sourceAccountDigest)throw new RoomError('HOST_CHANGED','房主或原座位授权已变化，请重新确认');
  return{source,host};
}
export const transferKey=(switchTicket:string,joinTicket:string)=>hashOpaqueToken(JSON.stringify([switchTicket,joinTicket]));
export function transferReceipts(room:RoomRecord){return(room.metadata?.joinTransfers??{}) as Record<string,JoinTransferReceipt>;}
export function availableTransferReceipts(room:RoomRecord,now:number){
  const receipts=Object.fromEntries(Object.entries(transferReceipts(room)).filter(([,r])=>r.expiresAt>now));
  if(Object.keys(receipts).length>=TRANSFER_RECEIPT_LIMIT)throw new RoomError('JOIN_TRANSFER_CAPACITY','换房恢复操作较多，请稍后再试',429);
  return receipts;
}
