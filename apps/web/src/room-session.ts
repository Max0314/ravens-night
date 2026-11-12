import {roomSessionKey} from './account-context.js';

export interface StoredSession {
  avatar?:string|null; expectedProfileRevision?:number; pendingJoin?:boolean;
  nickname?:string; roomCode:string; mode:'PLAYER'|'DISPLAY'; participantId?:string|undefined;
  roomInstanceId?:string|undefined; isHost?:boolean; updatedAt?:number;
}
let memory:{namespace:string;value:StoredSession|null}|undefined;
const cleared=new Set<string>();
const sessionIdentity=(code:string,mode:'PLAYER'|'DISPLAY')=>`${roomSessionKey()}:${code}:${mode}`;
const available=(value:StoredSession|undefined)=>value&&!cleared.has(sessionIdentity(value.roomCode,value.mode))?value:undefined;
const valid=(value:unknown):value is StoredSession=>!!value&&typeof value==='object'&&typeof (value as StoredSession).roomCode==='string'&&['PLAYER','DISPLAY'].includes((value as StoredSession).mode);
function parse(raw:string|null):StoredSession|undefined {try{const value:unknown=JSON.parse(raw??'null');return valid(value)?value:undefined;}catch{return undefined;}}
function warning(){window.dispatchEvent(new Event('ravens:storage-warning'));}
export function readInvitedRoomCode(){return new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/\s/g,'')??'';}
export function clearInvitationUrl(){const url=new URL(window.location.href);url.searchParams.delete('room');url.searchParams.delete('display');window.history.replaceState(window.history.state,'',url);}
export function selectRoomUrl(code:string,mode:'PLAYER'|'DISPLAY'){const url=new URL(window.location.href);url.searchParams.set('room',code);if(mode==='DISPLAY')url.searchParams.set('display','1');else url.searchParams.delete('display');window.history.replaceState(window.history.state,'',url);}
export function saveSession(session:StoredSession){
  const namespace=roomSessionKey(),next={...session,updatedAt:Date.now()},raw=JSON.stringify(next);let persisted=true;cleared.delete(sessionIdentity(session.roomCode,session.mode));
  memory={namespace,value:next};
  try{sessionStorage.setItem(namespace,raw);}catch{persisted=false;}
  try{localStorage.setItem(`${namespace}:${next.roomCode}:${next.mode}`,raw);if(next.mode==='PLAYER')localStorage.setItem(namespace,raw);}catch{persisted=false;}
  if(persisted)memory=undefined;else warning();
}
export function readStoredRoom(code:string,mode:'PLAYER'|'DISPLAY'='PLAYER'){
  try{return available(parse(localStorage.getItem(`${roomSessionKey()}:${code}:${mode}`)));}catch{return undefined;}
}
export function storedRoomSessions():StoredSession[]{
  const namespace=roomSessionKey(),values:StoredSession[]=[];
  if(memory?.namespace===namespace&&memory.value)values.push(memory.value);
  try{const current=parse(sessionStorage.getItem(namespace));if(current)values.push(current);}catch{}
  try{const current=parse(localStorage.getItem(namespace));if(current)values.push(current);for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(namespace+':')){const value=parse(localStorage.getItem(key));if(value&&key===`${namespace}:${value.roomCode}:${value.mode}`)values.push(value);}}}catch{}
  const unique=new Map<string,StoredSession>();for(const value of values){if(!available(value))continue;const key=`${value.roomCode}:${value.mode}`,old=unique.get(key);if(!old||(value.updatedAt??0)>(old.updatedAt??0))unique.set(key,value);}
  return [...unique.values()].sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0));
}
export function readSession():StoredSession|undefined {
  const namespace=roomSessionKey();if(memory?.namespace===namespace)return available(memory.value??undefined);
  const invitation=readInvitedRoomCode(),mode=new URLSearchParams(window.location.search).get('display')==='1'?'DISPLAY':'PLAYER';
  if(invitation){const invited=readStoredRoom(invitation,mode);if(invited)return invited;}
  try{const current=parse(sessionStorage.getItem(namespace));if(available(current))return current;}catch{}
  try{return available(parse(localStorage.getItem(namespace)));}catch{return undefined;}
}
export function clearSessionFor(code:string,mode:'PLAYER'|'DISPLAY'='PLAYER'){
  const namespace=roomSessionKey();cleared.add(sessionIdentity(code,mode));if(memory?.namespace===namespace&&memory.value?.roomCode===code&&memory.value.mode===mode)memory=undefined;
  try{const value=parse(sessionStorage.getItem(namespace));if(value?.roomCode===code&&value.mode===mode)sessionStorage.removeItem(namespace);}catch{}
  try{localStorage.removeItem(`${namespace}:${code}:${mode}`);const value=parse(localStorage.getItem(namespace));if(value?.roomCode===code&&value.mode===mode)localStorage.removeItem(namespace);}catch{}
}
export function clearSession(){const current=readSession();if(current)clearSessionFor(current.roomCode,current.mode);}
