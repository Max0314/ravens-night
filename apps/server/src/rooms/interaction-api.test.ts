import {expect,test} from 'vitest';
import {avatarChoices} from '@ravens/contracts';
import {protocolApp} from '../test-fixtures/protocol-app.js';
import {RoomService} from './service.js';
test('unified creation keeps voice links, rejects URL credentials and preserves guest avatars on ticket replay',async()=>{
 const app=protocolApp({timers:false});try{
  const invalid=await app.inject({method:'POST',url:'/api/rooms',payload:{creationVersion:2,playerCount:5,organizerName:'测试',voiceRoomUrl:'https://user:password@example.test'}});expect(invalid.statusCode).toBe(400);
  const created=await app.inject({method:'POST',url:'/api/rooms',payload:{creationVersion:2,playerCount:5,organizerName:'测试',voiceRoomUrl:'https://example.test/voice'}}),code=created.json().code;
  expect(created.statusCode).toBe(201);
  const ticket=(await app.inject({url:`/api/rooms/${code}/join-ticket?mode=PLAYER`})).json().joinTicket;
  const payload={mode:'PLAYER',nickname:'皮卡丘',avatar:avatarChoices[0]!.url,joinTicket:ticket};
  const first=await app.inject({method:'POST',url:`/api/rooms/${code}/join`,payload});expect(first.statusCode).toBe(201);
  const replay=await app.inject({method:'POST',url:`/api/rooms/${code}/join`,payload:{...payload,nickname:'犬夜叉',avatar:avatarChoices[1]!.url}});expect(replay.json().id).toBe(first.json().id);
  const room=(await app.inject({url:`/api/rooms/${code}`})).json();expect(room.voiceRoomUrl).toBe('https://example.test/voice');expect(room.participants[0]).toMatchObject({nickname:'皮卡丘',avatar:payload.avatar});
  const updated=await app.inject({method:'POST',url:`/api/rooms/${code}/profile`,payload:{token:first.json().token,nickname:'犬夜叉',avatar:avatarChoices[1]!.url}});expect(updated.statusCode).toBe(200);expect(updated.json().profileApplication).toBe('CURRENT');
 }finally{await app.close();}
});
test('account profile conflict does not consume the ticket and DISPLAY never projects account display information',async()=>{
 const account={sub:'account-test',name:'账号名称',picture:avatarChoices[0]!.url};const app=protocolApp({timers:false,resolveAccount:async()=>account});try{
  const code=(await app.inject({method:'POST',url:'/api/rooms',payload:{creationVersion:2,playerCount:5,organizerName:account.name}})).json().code;
  const ticket=(await app.inject({url:`/api/rooms/${code}/join-ticket?mode=PLAYER`})).json().joinTicket;
  await app.inject({method:'POST',url:'/api/account/profile',payload:{nickname:'新资料',avatar:account.picture,expectedRevision:0}});
  const join=async(revision:number,nickname:string)=>app.inject({method:'POST',url:`/api/rooms/${code}/join`,payload:{mode:'PLAYER',joinTicket:ticket,nickname,avatar:account.picture,expectedProfileRevision:revision}});
  const stale=await join(0,account.name);expect(stale.statusCode).toBe(409);expect(stale.json()).toMatchObject({errorCode:'PROFILE_STALE',joinTicketConsumed:false});
  expect((await app.inject(`/api/rooms/${code}`)).json().participants).toHaveLength(0);expect((await join(1,'新资料')).statusCode).toBe(201);
  const display=await app.inject({method:'POST',url:`/api/rooms/${code}/join`,payload:{mode:'DISPLAY',nickname:'不应显示',avatar:account.picture}});expect(display.statusCode).toBe(201);
  const room=(await app.inject(`/api/rooms/${code}`)).json();const screen=room.participants.find((p:{mode:string})=>p.mode==='DISPLAY');expect(screen.nickname).toBe('公共大屏');expect(screen.avatar).toBeUndefined();
 }finally{await app.close();}
});
test.each([false,true])('new first-night command validates trusted account identity and replays one receipt (account=%s)',async signedIn=>{
 const now=1800000000000,service=new RoomService({presentation:false,now:()=>now}),code=service.create(7,'测试').room.code,players=Array.from({length:7},(_,i)=>service.join(code,`玩家${i}`,'PLAYER'));
 players.forEach(p=>service.setReady(code,p.token,true));service.startTutorial(code,players[0]!.token,'SKIP');players.forEach(p=>service.confirmRole(code,p.token));
 const room=service.find(code),[seat,entry]=Object.entries(room.game!.startInfo.entries)[0]!,token=players[Number(seat)-1]!.token;
 if(signedIn)room.participants.find(p=>p.seat===Number(seat))!.accountId='trusted-account';
 const saved=service.snapshot(code),app=protocolApp({timers:false,presentation:false,now:()=>now,resolveAccount:async()=>signedIn?{sub:'trusted-account',name:'账号'}:null,repository:{async initialize(){},async close(){},async loadAll(){return[saved];},async commit(){}}});
 try{
  const request={method:'POST' as const,url:`/api/rooms/${code}/first-night-info/ack`,headers:{'x-command-id':'start-info-command'},payload:{token,infoId:entry.infoId}};
  const first=await app.inject(request);expect(first.statusCode).toBe(200);expect(first.json().startInfo.acknowledged).toBe(true);expect((await app.inject(request)).statusCode).toBe(200);
  expect(JSON.stringify((await app.inject(`/api/rooms/${code}`)).json())).not.toMatch(/infoId|bluffRoleIds/);
 }finally{await app.close();}
});
