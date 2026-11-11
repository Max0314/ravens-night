import {expect,test} from 'vitest';
import {avatarChoices} from '@ravens/contracts';
import {protocolApp as buildApp} from '../test-fixtures/protocol-app.js';
import {RoomService,type RoomRecord,type AccountClaim} from '../rooms/service.js';
import type {RoomRepository} from '../game/live-runtime.js';
import type {AccountProfile} from './game-profile.js';

const avatar='https://auth.fribench.cn/assets/avatars/v3/banana-cat-crying.webp';
const account={sub:'profile-owner',name:'默认昵称',picture:avatar};
function memory(){
  const rooms=new Map<string,RoomRecord>(),profiles=new Map<string,AccountProfile>();let fail=false;
  const repository:RoomRepository={async initialize(){},async close(){},async loadAll(){return structuredClone([...rooms.values()]);},async loadProfiles(){return structuredClone([...profiles.values()]);},async commit(changed,deleted,_claims:AccountClaim[]=[],updates:AccountProfile[]=[]){if(fail)throw new Error('storage unavailable');changed.forEach(r=>rooms.set(r.code,structuredClone(r)));deleted.forEach(code=>rooms.delete(code));updates.forEach(p=>profiles.set(p.sub,structuredClone(p)));}};
  return {repository,setFail:(value:boolean)=>{fail=value;}};
}
test('game profile is account-scoped, validated, idempotent and survives restart; failed saves roll back',async()=>{
  const saved=memory();const options={repository:saved.repository,timers:false,presentation:false,resolveAccount:async(header:string|undefined)=>header==='owner'?account:header==='other'?{sub:'other',name:'另一个账号'}:null};
  let app=buildApp(options);
  const post=(body:object,owner='owner')=>app.inject({method:'POST',url:'/api/account/profile',headers:{cookie:owner},payload:body});
  try{
    expect((await post({nickname:'我的昵称',avatar,expectedRevision:0},'')).statusCode).toBe(401);
    for(const input of [{nickname:' ',avatar},{nickname:'甲',avatar:'https://other.invalid/a.webp'},{nickname:'甲',avatar,sub:'other'}])expect((await post({...input,expectedRevision:0})).statusCode).toBe(400);
    const body={nickname:'我的昵称',avatar,expectedRevision:0};expect((await post(body)).json().profile).toMatchObject({revision:1,nickname:'我的昵称'});
    expect((await post(body)).json().profile.revision).toBe(1);
    expect((await post({...body,nickname:'迟到修改'})).statusCode).toBe(409);
    expect((await app.inject({url:'/api/account',headers:{cookie:'other'}})).json().profile.nickname).toBe('另一个账号');
    saved.setFail(true);expect((await post({nickname:'失败修改',avatar:null,expectedRevision:1})).statusCode).toBe(503);
    expect((await app.inject({url:'/api/account',headers:{cookie:'owner'}})).json().profile.nickname).toBe('我的昵称');
    saved.setFail(false);await app.close();app=buildApp(options);
    expect((await app.inject({url:'/api/account',headers:{cookie:'owner'}})).json().profile).toMatchObject({nickname:'我的昵称',revision:1,defaultNickname:'默认昵称'});
    expect((await post({nickname:null,avatar:null,expectedRevision:1})).json().profile).toMatchObject({nickname:'默认昵称',avatar,nicknameOverride:null,avatarOverride:null});
    expect(account.name).toBe('默认昵称');expect(account.picture).toBe(avatar);
  }finally{await app.close();}
});

test('profile changes immediately update lobbies, teaching and active games',()=>{
  const service=new RoomService({presentation:false}),{room}=service.create(5,'房主');
  const players=Array.from({length:5},(_,i)=>service.join(room.code,`玩家${i+1}`,'PLAYER',i===0?avatar:avatarChoices[i-1]!.url));
  service.bindAccount(room.code,players[0]!.token,account.sub,players[0]!.token);
  service.updateAccountProfile(account,'大厅昵称',avatar,0);
  expect(service.publicView(room.code).participants[0]!.nickname).toBe('大厅昵称');
  for(const p of players)service.setReady(room.code,p.token,true);service.startTutorial(room.code,players[0]!.token,'OPTIONAL');
  service.updateAccountProfile(account,'教学后昵称',null,1);
  expect(service.publicView(room.code).participants[0]!.nickname).toBe('教学后昵称');
  expect(JSON.stringify(service.publicView(room.code))).not.toContain('pendingProfile');
  service.cancelTutorial(room.code,players[0]!.token);expect(service.publicView(room.code).participants[0]!.nickname).toBe('教学后昵称');
  for(const p of players)service.setReady(room.code,p.token,true);service.startTutorial(room.code,players[0]!.token,'SKIP');
  service.updateAccountProfile(account,'下局昵称',null,2);expect(service.publicView(room.code).participants[0]!.nickname).toBe('下局昵称');
  service.abort(room.code,players[0]!.token);service.reset(room.code,players[0]!.token);expect(service.publicView(room.code).participants[0]!.nickname).toBe('下局昵称');
});
