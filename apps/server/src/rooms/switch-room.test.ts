import {expect,test} from 'vitest';
import {buildApp} from '../app.js';
import type {Account} from '../auth/account.js';
import {hashOpaqueToken} from '../auth/session.js';
import {RoomService,type RoomRecord} from './service.js';
import type {RoomRepository} from '../game/live-runtime.js';
import {avatarChoices} from '@ravens/contracts';

const protocol={'x-ravens-protocol':'6'};
class MemoryRepository implements RoomRepository{
  records=new Map<string,RoomRecord>();fail=false;commits:Array<{changed:string[];deleted:string[]}>=[];
  async initialize(){}async close(){}async loadAll(){return [...this.records.values()].map(r=>structuredClone(r));}
  async commit(changed:RoomRecord[],deleted:string[]){if(this.fail)throw Error('test unavailable');this.commits.push({changed:changed.map(r=>r.code),deleted});for(const r of changed)this.records.set(r.code,structuredClone(r));for(const code of deleted)this.records.delete(code);}
}
async function fixture(options:{account?:boolean;full?:boolean;targetRunning?:boolean;existingAccount?:boolean;capacity?:boolean}={}){
  let now=1_800_000_000_000,actor:Account|null=options.account?{sub:'owner',name:'账号房主',picture:avatarChoices[2]!.url}:null;
  const service=new RoomService({now:()=>now,presentation:true}),source=service.create(5,'原房主').room.code,target=service.create(5,'目标房主').room.code;
  const sourcePlayers=Array.from({length:5},(_,i)=>service.join(source,`原玩家${i+1}`,'PLAYER',avatarChoices[i+5]!.url));
  let sourceToken=sourcePlayers[0]!.token;
  if(options.account){sourceToken='seed-account-source';service.bindAccount(source,sourcePlayers[0]!.token,'owner',sourceToken);}
  for(const p of service.find(source).participants)service.setReady(source,p.id===sourcePlayers[0]!.participant.id?sourceToken:sourcePlayers.find(x=>x.participant.id===p.id)!.token,true);
  service.startTutorial(source,sourceToken,'SKIP');
  const targetHost=service.join(target,'目标房主','PLAYER',avatarChoices[1]!.url);
  if(options.existingAccount)service.bindAccount(target,targetHost.token,'owner','seed-account-target');
  if(options.full||options.targetRunning)for(let i=0;i<4;i++)service.join(target,`目标玩家${i+2}`,'PLAYER',avatarChoices[i+12]!.url);
  if(options.targetRunning){const r=service.find(target);for(const p of r.participants)p.ready=true;service.startTutorial(target,targetHost.token,'SKIP');}
  if(options.capacity)service.find(target).metadata={joinTransfers:Object.fromEntries(Array.from({length:256},(_,i)=>[String(i),{expiresAt:now+86400000}]))};
  const repository=new MemoryRepository();for(const code of service.listCodes())repository.records.set(code,service.snapshot(code));
  let app=buildApp({repository,timers:false,now:()=>now,presentation:true,resolveAccount:async()=>actor});await app.ready();
  const cookie=(token:string)=>`ravens_player=${encodeURIComponent(app.signCookie(token))}`;
  const sourceCookie=cookie(sourceToken),targetCookie=cookie(targetHost.token);
  const ticket=async()=>app.inject({method:'POST',url:`/api/rooms/${source}/switch-ticket`,headers:{...protocol,cookie:sourceCookie},payload:{sourceRoomInstanceId:repository.records.get(source)!.roomInstanceId,targetCode:target,targetRoomInstanceId:repository.records.get(target)!.roomInstanceId}});
  const joinTicket=async()=>(await app.inject({url:`/api/rooms/${target}/join-ticket?mode=PLAYER`,headers:protocol})).json().joinTicket as string;
  const body=async()=>({nickname:'加入者',mode:'PLAYER',avatar:avatarChoices[0]!.url,joinTicket:await joinTicket(),switchTicket:(await ticket()).json().switchTicket});
  const join=(payload:Record<string,unknown>,cookieValue?:string)=>app.inject({method:'POST',url:`/api/rooms/${target}/join`,headers:{...protocol,...(cookieValue?{cookie:cookieValue}:{})},payload});
  return{get app(){return app;},repository,source,target,sourceCookie,targetCookie,sourcePlayers,cookie,ticket,joinTicket,body,join,advance(ms:number){now+=ms;},setActor(value:Account|null){actor=value;},async restart(){await app.close();app=buildApp({repository,timers:false,now:()=>now,presentation:true,resolveAccount:async()=>actor});await app.ready();}};
}

test('signed guest transfer joins the target and closes a live source with other humans in one commit',async()=>{
  const t=await fixture();try{
    const before=t.repository.commits.length,payload=await t.body(),response=await t.join(payload);
    expect(response.statusCode,response.body).toBe(201);expect(response.json()).toMatchObject({closedRoomCode:t.source,mode:'PLAYER',nickname:'加入者'});
    expect(t.repository.commits.slice(before)).toEqual([{changed:[t.target],deleted:[t.source]}]);
    expect((await t.app.inject({url:`/api/rooms/${t.source}/summary`})).statusCode).toBe(404);
    expect(t.repository.records.get(t.target)!.participants).toHaveLength(2);
    const summary=(await t.app.inject({url:`/api/rooms/${t.target}/summary`})).json();expect(summary).toMatchObject({roomInstanceId:t.repository.records.get(t.target)!.roomInstanceId,state:'LOBBY'});expect(JSON.stringify(summary)).not.toMatch(/token|account|switchTicket|joinTransfers/);
  }finally{await t.app.close();}
});

test('unknown-result guest replay works after both ticket deadlines without a second join or write',async()=>{
  const t=await fixture();try{
    const payload=await t.body(),first=await t.join(payload);expect(first.statusCode).toBe(201);const writes=t.repository.commits.length;
    t.advance(11*60_000);const replay=await t.join(payload);expect(replay.statusCode,replay.body).toBe(201);expect(replay.json().id).toBe(first.json().id);expect(replay.json().token).toBe(first.json().token);expect(t.repository.commits).toHaveLength(writes);
    const changed=await t.join({...payload,nickname:'修改意图'});expect(changed.statusCode).toBe(409);expect(changed.json().errorCode).toBe('COMMAND_ID_REUSED');
  }finally{await t.app.close();}
});

test('target existing guest recovery also closes source and requires the original target cookie on replay',async()=>{
  const t=await fixture();try{
    const payload=await t.body(),first=await t.join(payload,t.targetCookie);expect(first.statusCode,first.body).toBe(201);expect(first.json()).toMatchObject({closedRoomCode:t.source,nickname:'目标房主'});expect(t.repository.records.get(t.target)!.participants).toHaveLength(1);
    const writes=t.repository.commits.length;t.advance(11*60_000);expect((await t.join(payload,t.targetCookie)).statusCode).toBe(201);expect(t.repository.commits).toHaveLength(writes);
    const missing=await t.join(payload);expect(missing.statusCode).toBe(403);expect(missing.json().errorCode).toBe('SEAT_REMOVED');
  }finally{await t.app.close();}
});

test.each([false,true])('account transfer recovers or creates its target seat and rejects a changed account (existing=%s)',async existingAccount=>{
  const t=await fixture({account:true,existingAccount});try{
    const payload=await t.body(),first=await t.join(payload);expect(first.statusCode,first.body).toBe(201);expect(first.json().closedRoomCode).toBe(t.source);expect(t.repository.records.get(t.target)!.participants).toHaveLength(existingAccount?1:2);
    const writes=t.repository.commits.length;t.advance(11*60_000);expect((await t.join(payload)).statusCode).toBe(201);expect(t.repository.commits).toHaveLength(writes);
    t.setActor({sub:'other',name:'别人'});const mismatch=await t.join(payload);expect(mismatch.statusCode).toBe(403);expect(mismatch.json().errorCode).toBe('ACCOUNT_MISMATCH');
  }finally{await t.app.close();}
});

test.each([{full:true},{targetRunning:true}])('an unavailable target leaves the whole source and roster intact: %j',async options=>{
  const t=await fixture(options);try{
    const payload=await t.body(),before=JSON.stringify([...t.repository.records]);const response=await t.join(payload);expect([400,409]).toContain(response.statusCode);expect(JSON.stringify([...t.repository.records])).toBe(before);expect(t.repository.records.has(t.source)).toBe(true);
  }finally{await t.app.close();}
});

test('avatar collision rejects the target join before the source closes',async()=>{
  const t=await fixture();try{
    const payload=await t.body(),response=await t.join({...payload,avatar:avatarChoices[1]!.url});expect(response.statusCode).toBe(409);expect(response.json().errorCode).toBe('AVATAR_TAKEN');expect(t.repository.records.has(t.source)).toBe(true);expect(t.repository.records.get(t.target)!.participants).toHaveLength(1);
  }finally{await t.app.close();}
});

test('a failed commit neither closes the source nor occupies the target and the identical retry can succeed',async()=>{
  const t=await fixture();try{
    const payload=await t.body();t.repository.fail=true;const response=await t.join(payload);expect(response.statusCode,response.body).toBe(503);expect(t.repository.records.has(t.source)).toBe(true);
    const summary=(await t.app.inject({url:`/api/rooms/${t.target}/summary`})).json();expect(summary.activeHumanCount).toBe(1);
    t.repository.fail=false;expect((await t.join(payload)).statusCode).toBe(201);
  }finally{await t.app.close();}
});

test('a non-host cannot mint a switch ticket; same-room and display transfers are rejected',async()=>{
  const t=await fixture();try{
    const source=t.repository.records.get(t.source)!,target=t.repository.records.get(t.target)!;
    const response=await t.app.inject({method:'POST',url:`/api/rooms/${t.source}/switch-ticket`,headers:{...protocol,cookie:t.cookie(t.sourcePlayers[1]!.token)},payload:{sourceRoomInstanceId:source.roomInstanceId,targetCode:t.target,targetRoomInstanceId:target.roomInstanceId}});expect(response.statusCode).toBe(403);
    const same=await t.app.inject({method:'POST',url:`/api/rooms/${t.source}/switch-ticket`,headers:{...protocol,cookie:t.sourceCookie},payload:{sourceRoomInstanceId:source.roomInstanceId,targetCode:t.source,targetRoomInstanceId:source.roomInstanceId}});expect(same.statusCode).toBe(400);expect(same.json().errorCode).toBe('SAME_ROOM');
    const payload=await t.body(),display=await t.join({...payload,mode:'DISPLAY'});expect(display.statusCode).toBe(400);expect(display.json().errorCode).toBe('INVALID_MODE');expect(t.repository.records.has(t.source)).toBe(true);
  }finally{await t.app.close();}
});

test('fresh uncommitted transfer expires and tampered capabilities never close the source',async()=>{
  const t=await fixture();try{
    const payload=await t.body(),bad=await t.join({...payload,switchTicket:payload.switchTicket.slice(0,-1)+'!'});expect(bad.statusCode).toBe(400);expect(bad.json().errorCode).toBe('SWITCH_TICKET_INVALID');
    t.advance(300_001);const expired=await t.join(payload);expect(expired.statusCode).toBe(409);expect(expired.json().errorCode).toBe('SWITCH_TICKET_EXPIRED');expect(t.repository.records.has(t.source)).toBe(true);
  }finally{await t.app.close();}
});

test('a changed source host between confirmation and commit retains both rooms',async()=>{
  const t=await fixture();try{
    const payload=await t.body();await t.app.close();const source=t.repository.records.get(t.source)!;source.organizerParticipantId=source.participants[1]!.id;source.organizerTokenHash=source.participants[1]!.tokenHash;await t.restart();
    const result=await t.join(payload);expect(result.statusCode).toBe(409);expect(result.json().errorCode).toBe('HOST_CHANGED');expect(t.repository.records.has(t.source)).toBe(true);expect(t.repository.records.get(t.target)!.participants).toHaveLength(1);
  }finally{await t.app.close();}
});

test.each(['source','target'] as const)('room-code reuse cannot redirect an outstanding transfer (%s instance changes)',async changed=>{
  const t=await fixture();try{
    const payload=await t.body();await t.app.close();t.repository.records.get(t[changed])!.roomInstanceId='different-room-instance';await t.restart();
    const result=await t.join(payload);expect(result.statusCode).toBe(409);expect(result.json().errorCode).toBe('ROOM_INSTANCE_CHANGED');expect(t.repository.records.has(t.source)).toBe(true);
  }finally{await t.app.close();}
});

test('a committed transfer cannot restore a rotated target credential',async()=>{
  const t=await fixture();try{
    const payload=await t.body(),first=await t.join(payload);expect(first.statusCode).toBe(201);await t.app.close();const participant=t.repository.records.get(t.target)!.participants.find(p=>p.id===first.json().id)!;participant.tokenHash=hashOpaqueToken('rotated');await t.restart();
    const result=await t.join(payload);expect(result.statusCode).toBe(403);expect(result.json().errorCode).toBe('SEAT_REMOVED');
  }finally{await t.app.close();}
});

test('unexpired receipt capacity rejects a new transfer without evicting recovery data or changing either room',async()=>{
  const t=await fixture({capacity:true});try{
    const payload=await t.body(),result=await t.join(payload);expect(result.statusCode).toBe(429);expect(result.json().errorCode).toBe('JOIN_TRANSFER_CAPACITY');expect(t.repository.records.has(t.source)).toBe(true);expect(Object.keys(t.repository.records.get(t.target)!.metadata!.joinTransfers as object)).toHaveLength(256);
  }finally{await t.app.close();}
});

test('protocol 4 is rejected and protocol 6 reaches the current room contract',async()=>{
  const t=await fixture();try{
    expect((await t.app.inject({url:`/api/rooms/${t.source}`,headers:{'x-ravens-protocol':'4',cookie:t.sourceCookie}})).statusCode).toBe(426);
    const current=await t.app.inject({url:`/api/rooms/${t.source}`,headers:{...protocol,cookie:t.sourceCookie}});expect(current.statusCode).toBe(200);expect(current.json().protocolVersion).toBe(6);
  }finally{await t.app.close();}
});

test.each(['source','target'] as const)('a room disappearing after confirmation never causes a partial new join (%s)',async gone=>{
  const t=await fixture();try{
    const payload=await t.body();await t.app.close();t.repository.records.delete(t[gone]);await t.restart();
    const result=await t.join(payload);expect(result.statusCode).toBe(gone==='source'?409:404);expect(result.json().errorCode).toBe(gone==='source'?'SOURCE_ROOM_GONE':'ROOM_NOT_FOUND');
    if(gone==='target')expect(t.repository.records.has(t.source)).toBe(true);else expect(t.repository.records.get(t.target)!.participants).toHaveLength(1);
  }finally{await t.app.close();}
});

test('a central account change before the first transfer commit preserves the live source',async()=>{
  const t=await fixture({account:true});try{
    const payload=await t.body();t.setActor({sub:'changed',name:'另一个账号'});const result=await t.join(payload);expect(result.statusCode).toBe(403);expect(result.json().errorCode).toBe('ACCOUNT_MISMATCH');expect(t.repository.records.has(t.source)).toBe(true);
  }finally{await t.app.close();}
});

test('the source websocket closes only after its deletion is committed; old protocol websocket is rejected',async()=>{
  const t=await fixture();try{
    const old=await t.app.injectWS(`/api/rooms/${t.source}/live?protocol=4&mode=PLAYER`,{headers:{cookie:t.sourceCookie}});
    try{expect(await new Promise(resolve=>old.once('close',(code:number)=>resolve(code)))).toBe(1008);}finally{old.terminate();}
    const ws=await t.app.injectWS(`/api/rooms/${t.source}/live?protocol=6&mode=PLAYER`,{headers:{cookie:t.sourceCookie}});
    try{
      const payload=await t.body();t.repository.fail=true;expect((await t.join(payload)).statusCode).toBe(503);expect(ws.readyState).toBe(1);
      const closed=new Promise(resolve=>ws.once('close',(code:number)=>resolve(code)));t.repository.fail=false;expect((await t.join(payload)).statusCode).toBe(201);expect(await closed).toBe(1008);
    }finally{ws.terminate();}
  }finally{await t.app.close();}
});
