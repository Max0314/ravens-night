import {expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {RoomService} from './service.js';
import {protocolApp} from '../test-fixtures/protocol-app.js';
function table(count=6,enabled=false){
 let now=1800000000000;const service=new RoomService({now:()=>now,presentation:true}),code=service.create(count,'房主','IN_PERSON',undefined,enabled).room.code;
 const players=Array.from({length:count},(_,i)=>service.join(code,`玩家${i+1}`,'PLAYER'));
 const ready=()=>players.forEach(p=>service.setReady(code,p.token,true));
 const start=()=>{ready();service.startTutorial(code,players[0]!.token,'SKIP');now+=6450;service.advanceTime(now);players.forEach(p=>service.confirmRole(code,p.token));};
 return{service,code,players,ready,start};
}
test('six-player cooperation gives only evil players the normal private starting info and keeps the ACK gate',()=>{
 const t=table(6,true);t.start();const room=t.service.find(t.code),game=room.game!;
 expect(game.sixPlayerEvilCooperation).toBe(true);expect(game.startInfo).toMatchObject({mode:'REQUIRED',stage:'WAIT_ACK'});expect(game.nightOrder).toBeUndefined();
 const excluded=new Set(room.assignments.flatMap(a=>[a.roleId,a.perceivedRoleId]));
 for(const p of t.players){const a=room.assignments.find(a=>a.seat===p.participant.seat)!,view=t.service.privateView(t.code,p.token);
  if(a.alignment==='GOOD'){expect(view.startInfo).toBeUndefined();continue;}
  expect(view.startInfo?.team).toHaveLength(1);expect(view.startInfo?.team[0]!.seat).not.toBe(a.seat);
  const entry=game.startInfo.entries[a.seat]!;expect(entry.bluffRoleIds).toHaveLength(a.roleType==='DEMON'?3:0);entry.bluffRoleIds.forEach(id=>expect(excluded.has(id)).toBe(false));
 }
 expect(JSON.stringify(t.service.publicView(t.code))).not.toMatch(/infoId|bluffRoleIds|startInfo/);
 expect(t.service.publicView(t.code).rulesSummary).toContain('自定义增强');
 const restored=new RoomService();restored.restore([t.service.snapshot(t.code)]);expect(restored.snapshot(t.code).game!.startInfo).toEqual(game.startInfo);
 for(const[seat,entry]of Object.entries(game.startInfo.entries))t.service.acknowledgeStartInfo(t.code,t.players[Number(seat)-1]!.token,entry.infoId);
 expect(game.startInfo.stage).toBe('COMPLETE');expect(game.nightOrder!==undefined||game.phase!=='FIRST_NIGHT').toBe(true);
 t.service.abort(t.code,t.players[0]!.token);t.service.reset(t.code,t.players[0]!.token);expect(t.service.publicView(t.code).sixPlayerEvilCooperation).toBe(true);
});
test.each([5,6,7])('default %i-player rules remain unchanged and legacy absent flags restore as off',count=>{
 const t=table(count);t.start();expect(t.service.find(t.code).game!.startInfo.mode).toBe(count<7?'NONE':'REQUIRED');
 const s=t.service.snapshot(t.code);expect(s.game!.sixPlayerEvilCooperation).toBeUndefined();const next=new RoomService();next.restore([s]);expect(next.publicView(t.code).sixPlayerEvilCooperation).toBe(false);
});
test('only the host may change lobby rules, choices reset readiness/setup, and tutorial/start locks the choice',()=>{
 const t=table();t.ready();const before=t.service.snapshot(t.code);
 expect(()=>t.service.setSixPlayerEvilCooperation(t.code,t.players[1]!.token,true)).toThrow(/房主/);
 t.service.setSixPlayerEvilCooperation(t.code,t.players[0]!.token,true);const room=t.service.find(t.code);expect(room.setupId).not.toBe(before.setupId);expect(room.participants.every(p=>!p.ready)).toBe(true);
 const setup=room.setupId;t.service.setSixPlayerEvilCooperation(t.code,t.players[0]!.token,true);expect(room.setupId).toBe(setup);
 t.ready();t.service.startTutorial(t.code,t.players[0]!.token,'OPTIONAL');expect(()=>t.service.setSixPlayerEvilCooperation(t.code,t.players[0]!.token,false)).toThrow(/开局/);
 const plain=table(5);expect(()=>plain.service.setSixPlayerEvilCooperation(plain.code,plain.players[0]!.token,true)).toThrow(/6人/);
});
test('restore rejects malformed rules, a non-six enabled table, or an unfrozen REQUIRED six-player game',()=>{
 const t=table(6,true);t.start();const snapshot=t.service.snapshot(t.code);
 const missing=structuredClone(snapshot);delete missing.game!.sixPlayerEvilCooperation;
 for(const bad of [{...snapshot,metadata:{...snapshot.metadata,sixPlayerEvilCooperation:'true'}},{...snapshot,playerCount:7},missing])expect(()=>new RoomService().restore([bad])).toThrow();
});
test('HTTP creation stays idempotent for absent/false, and rules commands are host-only, room-bound and lock after start',async()=>{
 const app=protocolApp({timers:false,presentation:false});try{
  const ticket=await app.inject({url:'/api/room-create-ticket'}),cookie=ticket.cookies.map(c=>`${c.name}=${c.value}`).join('; '),id=randomUUID();
  const payload={creationVersion:2,playerCount:6,organizerName:'房主',createTicket:ticket.json().createTicket};
  const request={method:'POST' as const,url:'/api/rooms',headers:{cookie,'x-command-id':id},payload};const created=await app.inject(request);expect(created.statusCode).toBe(201);const code=created.json().code;
  expect((await app.inject({...request,payload:{...payload,sixPlayerEvilCooperation:false}})).json().code).toBe(code);
  expect((await app.inject({...request,payload:{...payload,sixPlayerEvilCooperation:true}})).statusCode).toBe(409);
  const enhanced=await app.inject({...request,headers:{...request.headers,'x-command-id':randomUUID()},payload:{...payload,sixPlayerEvilCooperation:true}});expect(enhanced.statusCode).toBe(201);expect((await app.inject({url:`/api/rooms/${enhanced.json().code}`})).json().sixPlayerEvilCooperation).toBe(true);
  expect((await app.inject({...request,headers:{...request.headers,'x-command-id':randomUUID()},payload:{...payload,playerCount:7,sixPlayerEvilCooperation:true}})).statusCode).toBe(400);
  const join=async(nickname:string)=>(await app.inject({method:'POST',url:`/api/rooms/${code}/join`,payload:{nickname,mode:'PLAYER'}})).json().token as string;
  const host=await join('房主'),other=await join('玩家');
  const change=async(token:string,enabled:unknown,extra:object={})=>app.inject({method:'POST',url:`/api/rooms/${code}/rules`,payload:{token,sixPlayerEvilCooperation:enabled,...extra}});
  expect((await change(other,true)).statusCode).toBe(403);expect((await change(host,'true')).statusCode).toBe(400);
  const before=(await app.inject({url:`/api/rooms/${code}`})).json(),headers={'x-command-id':randomUUID()};
  const applied=await app.inject({method:'POST',url:`/api/rooms/${code}/rules`,headers,payload:{token:host,sixPlayerEvilCooperation:true}});expect(applied.statusCode).toBe(200);expect(applied.json().sixPlayerEvilCooperation).toBe(true);
  expect((await app.inject({method:'POST',url:`/api/rooms/${code}/rules`,headers,payload:{token:host,sixPlayerEvilCooperation:true}})).statusCode).toBe(200);
  expect((await change(host,false,{setupId:before.setupId})).statusCode).toBe(409);
  expect((await app.inject({url:`/api/rooms/${code}/summary`})).json()).toMatchObject({sixPlayerEvilCooperation:true});
  const tokens=[host,other];for(let i=0;i<4;i++)tokens.push(await join(`补位${i}`));
  for(const token of tokens)expect((await app.inject({method:'POST',url:`/api/rooms/${code}/ready`,payload:{token,ready:true}})).statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:`/api/rooms/${code}/start`,payload:{token:host,tutorialMode:'SKIP'}})).statusCode).toBe(200);
  expect((await change(host,false)).json().errorCode).toBe('RULES_LOCKED');
 }finally{await app.close();}
});
