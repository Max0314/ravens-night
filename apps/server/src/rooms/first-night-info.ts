import { randomUUID } from 'node:crypto';
import { ROLE_CATALOG, shuffled } from '@ravens/game-engine';
import type { RoomRecord } from './service.js';
export interface StartInfo {
  mode: 'REQUIRED' | 'NONE' | 'LEGACY';
  stage: 'WAIT_NIGHTFALL' | 'WAIT_ACK' | 'COMPLETE' | 'CANCELLED';
  releasedAt?: number;
  initial?: { demonSeat: number; minionSeats: number[]; excludedBluffRoleIds: string[] };
  entries: Record<number, { infoId: string; team: Array<{seat:number;nickname:string;avatar?:string;kind:'DEMON'|'MINION'}>; bluffRoleIds:string[];acknowledged:boolean }>;
}
export function createStartInfo(room: RoomRecord, seed: string): StartInfo {
  if (room.playerCount < 7) return { mode:'NONE',stage:'WAIT_NIGHTFALL',entries:{} };
  const demon = room.assignments.find(p => p.roleType === 'DEMON')!;
  const minions = room.assignments.filter(p => p.roleType === 'MINION');
  const excluded = [...new Set(room.assignments.flatMap(p => [p.roleId,p.perceivedRoleId]))];
  const bluffs = shuffled(ROLE_CATALOG.filter(r => ['TOWNSFOLK','OUTSIDER'].includes(r.type) && !excluded.includes(r.id)),`${seed}:bluffs`).slice(0,3).map(r => r.id);
  const evil = [demon,...minions];
  const entries = Object.fromEntries(evil.map(own => [own.seat, { infoId:randomUUID(),acknowledged:false,bluffRoleIds:own===demon?bluffs:[],team:evil.filter(p=>p!==own).map(p=>{
    const player=room.participants.find(player=>player.mode==='PLAYER'&&player.seat===p.seat)!;
    return {seat:p.seat,nickname:player.nickname,...(player.avatarSnapshot?{avatar:player.avatarSnapshot}:{}),kind:p===demon?'DEMON' as const:'MINION' as const};
  }) }]));
  return {mode:'REQUIRED',stage:'WAIT_NIGHTFALL',entries,initial:{demonSeat:demon.seat,minionSeats:minions.map(p=>p.seat),excludedBluffRoleIds:excluded}};
}
export function validateStartInfo(room:RoomRecord) {
  const g=room.game;if(!g)return;
  const fail=():never=>{throw new Error(`Room ${room.code}: invalid start information`);};
  const s=g.startInfo;
  if(![1,2,3].includes(g.presentationVersion)||!s||!['REQUIRED','NONE','LEGACY'].includes(s.mode)||!['WAIT_NIGHTFALL','WAIT_ACK','COMPLETE','CANCELLED'].includes(s.stage)||!s.entries||Array.isArray(s.entries))fail();
  if(s.stage==='CANCELLED'&&g.phase!=='ABORTED'||s.stage==='WAIT_ACK'&&g.phase!=='FIRST_NIGHT'||s.stage==='WAIT_NIGHTFALL'&&!['ROLE_REVEAL','FIRST_NIGHT'].includes(g.phase))fail();
  if(s.releasedAt!==undefined&&!Number.isSafeInteger(s.releasedAt)||s.stage==='WAIT_NIGHTFALL'&&s.releasedAt!==undefined||s.stage==='WAIT_ACK'&&s.releasedAt===undefined)fail();
  if(s.mode!=='REQUIRED') {
    if(Object.keys(s.entries).length||s.initial||s.mode==='LEGACY'&&!['COMPLETE','CANCELLED'].includes(s.stage)||s.mode==='NONE'&&(room.playerCount>=7||s.stage==='WAIT_ACK'))fail();
    return;
  }
  const i=s.initial;
  const seat=(v:number)=>Number.isInteger(v)&&v>=1&&v<=room.playerCount;
  if(room.playerCount<7||!i||!seat(i.demonSeat)||!Array.isArray(i.minionSeats)||i.minionSeats.length!==(room.playerCount<10?1:2)||i.minionSeats.some(v=>!seat(v)||v===i.demonSeat)||new Set(i.minionSeats).size!==i.minionSeats.length||!Array.isArray(i.excludedBluffRoleIds)||i.excludedBluffRoleIds.some(id=>!ROLE_CATALOG.some(r=>r.id===id)))fail();
  const all=[i!.demonSeat,...i!.minionSeats], ids=new Set<string>();
  if(Object.keys(s.entries).length!==all.length)fail();
  for(const own of all){
    const entry=s.entries[own];
    if(!entry||typeof entry.infoId!=='string'||!/^[-a-f0-9]{36}$/i.test(entry.infoId)||ids.has(entry.infoId)||typeof entry.acknowledged!=='boolean'||!Array.isArray(entry.team)||entry.team.length!==all.length-1||!Array.isArray(entry.bluffRoleIds))fail();
    ids.add(entry!.infoId);
    const team=entry!.team;
    if(new Set(team.map(p=>p.seat)).size!==team.length||team.some(p=>p.seat===own||!all.includes(p.seat)||p.kind!==(p.seat===i!.demonSeat?'DEMON':'MINION')||typeof p.nickname!=='string'))fail();
    if(entry!.bluffRoleIds.length!==(own===i!.demonSeat?3:0)||new Set(entry!.bluffRoleIds).size!==entry!.bluffRoleIds.length||entry!.bluffRoleIds.some(id=>i!.excludedBluffRoleIds.includes(id)||!ROLE_CATALOG.some(r=>r.id===id&&['TOWNSFOLK','OUTSIDER'].includes(r.type))))fail();
    if(s.stage==='COMPLETE'&&!entry!.acknowledged)fail();
  }
}
