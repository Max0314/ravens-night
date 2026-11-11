import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {RoomError} from './errors.js';
export interface CreationTicket {version:1;nonce:string;actorKind:'ACCOUNT'|'GUEST';actorDigest:string;issuedAt:number;expiresAt:number}
export interface CreationRequest {key:string;actorDigest:string;fingerprint:string;payload:{actorKind:'ACCOUNT'|'GUEST';code:string;roomInstanceId:string;createdAt:number};expiresAt:number}
const mac=(secret:string,parts:unknown[])=>createHmac('sha256',secret).update(JSON.stringify(parts)).digest('base64url');
export const creationOwner=(secret:string,kind:CreationTicket['actorKind'],value:string)=>mac(secret,['rvn:create-owner:v1',kind,value]);
export const creationKey=(secret:string,owner:string,id:string)=>mac(secret,['rvn:create-key:v1',owner,id]);
export const creationOrganizer=(secret:string,key:string,instance:string)=>mac(secret,['rvn:organizer:v1',key,instance]);
export function issueCreationTicket(secret:string,actorKind:CreationTicket['actorKind'],actorDigest:string,now:number){const payload:CreationTicket={version:1,nonce:randomBytes(32).toString('base64url'),actorKind,actorDigest,issuedAt:now,expiresAt:now+600000};const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return{createTicket:`${encoded}.${mac(secret,['rvn:create-ticket:v1',encoded])}`,expiresAt:payload.expiresAt};}
export function parseCreationTicket(secret:string,ticket:unknown):CreationTicket{
  try{if(typeof ticket!=='string'||ticket.length>2000)throw Error();const [encoded,signature,extra]=ticket.split('.');if(!encoded||!signature||extra)throw Error();const expected=Buffer.from(mac(secret,['rvn:create-ticket:v1',encoded])),actual=Buffer.from(signature);if(actual.length!==expected.length||!timingSafeEqual(expected,actual))throw Error();const value=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')) as CreationTicket;if(value.version!==1||!['ACCOUNT','GUEST'].includes(value.actorKind)||typeof value.actorDigest!=='string'||typeof value.nonce!=='string'||!Number.isFinite(value.issuedAt)||value.expiresAt!==value.issuedAt+600000)throw Error();return value;}catch{throw new RoomError('CREATE_TICKET_INVALID','创建凭据已失效，请重新发起创建',400);}
}
