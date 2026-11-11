import {afterEach,expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {buildApp} from './app.js';
import type {RoomRepository} from './game/live-runtime.js';
import type {RoomRecord} from './rooms/service.js';
import {botToken} from './rooms/bot-types.js';
const apps:ReturnType<typeof buildApp>[]=[];afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
const protocol={'x-ravens-protocol':'3'};
function appFixture(repository?:RoomRepository){const app=buildApp({timers:false,presentation:true,...(repository?{repository}:{})});apps.push(app);return app;}
function cookies(response:{headers:Record<string,unknown>}){const raw=response.headers['set-cookie'];return(Array.isArray(raw)?raw:[String(raw)]).map((value:string)=>value.split(';')[0]).join('; ');}
async function create(app:ReturnType<typeof buildApp>){const ticket=await app.inject({url:'/api/room-create-ticket',headers:protocol}),cookie=cookies(ticket),id=randomUUID(),payload={playerCount:5,organizerName:'Host',createTicket:ticket.json().createTicket};const response=await app.inject({method:'POST',url:'/api/rooms',headers:{...protocol,cookie,'x-command-id':id},payload});expect(response.statusCode).toBe(201);return{code:response.json().code as string,payload,cookie,id};}
async function join(app:ReturnType<typeof buildApp>,code:string,nickname='Host'){const ticket=(await app.inject({url:`/api/rooms/${code}/join-ticket?mode=PLAYER`,headers:protocol})).json().joinTicket;const response=await app.inject({method:'POST',url:`/api/rooms/${code}/join`,headers:protocol,payload:{nickname,mode:'PLAYER',joinTicket:ticket}});expect(response.statusCode).toBe(201);return{cookie:cookies(response),token:response.json().token as string};}
async function intent(app:ReturnType<typeof buildApp>,code:string,cookie:string,extra:object={}){const me=(await app.inject({url:`/api/rooms/${code}/me`,headers:{...protocol,cookie}})).json();return{roomInstanceId:me.roomInstanceId,setupId:me.setupId,expectedCommandVersion:me.self.commandVersion,expectedControlVersion:me.room.botControl.version,...(me.game?{gameId:me.game.gameId,contextId:me.contextId,...(me.game.nomination?{ballotId:me.game.nomination.ballotId}:{})}:{}),...extra};}
async function control(app:ReturnType<typeof buildApp>,code:string,cookie:string,path:string,extra:object={}){return app.inject({method:'POST',url:`/api/rooms/${code}/${path}`,headers:{...protocol,cookie,'x-command-id':randomUUID()},payload:await intent(app,code,cookie,extra)});}
test('creation retries stay in one room across other writes; changed parameters and deleted rooms cannot recreate',async()=>{
 const app=appFixture(),created=await create(app),member=await join(app,created.code);const response=await control(app,created.code,member.cookie,'bots',{fill:true});expect(response.statusCode).toBe(200);expect(response.json().room.botCount).toBe(4);
 const repeat=()=>app.inject({method:'POST',url:'/api/rooms',headers:{...protocol,cookie:created.cookie,'x-command-id':created.id},payload:created.payload});expect((await repeat()).json().code).toBe(created.code);
 expect((await app.inject({method:'POST',url:'/api/rooms',headers:{...protocol,cookie:created.cookie,'x-command-id':created.id},payload:{...created.payload,playerCount:6}})).statusCode).toBe(409);
 const context=await intent(app,created.code,member.cookie);delete (context as Partial<typeof context>).expectedControlVersion;
 expect((await app.inject({method:'DELETE',url:`/api/rooms/${created.code}/leave`,headers:{...protocol,cookie:member.cookie,'x-command-id':randomUUID()},payload:context})).statusCode).toBe(200);expect((await repeat()).statusCode).toBe(410);
});
test('control retries are receipt-first and external bot credentials never expose a private view',async()=>{
 let saved:RoomRecord[]=[];const repository:RoomRepository={initialize:async()=>{},loadAll:async()=>[],commit:async changed=>{for(const value of changed){saved=saved.filter(r=>r.code!==value.code);saved.push(structuredClone(value));}},close:async()=>{}};
 const app=appFixture(repository),{code}=await create(app),host=await join(app,code),payload=await intent(app,code,host.cookie,{fill:true}),id=randomUUID();
 const request={method:'POST' as const,url:`/api/rooms/${code}/bots`,headers:{...protocol,cookie:host.cookie,'x-command-id':id},payload};expect((await app.inject(request)).statusCode).toBe(200);expect((await app.inject(request)).statusCode).toBe(200);
 const room=saved.find(r=>r.code===code)!,bot=room.participants.find(p=>p.controller==='BOT')!,token=botToken(process.env.SESSION_SECRET??'development-only-session-secret-change-me',room,bot);
 expect((await app.inject({url:`/api/rooms/${code}/me?token=${token}`,headers:protocol})).statusCode).toBe(403);
 expect((await app.inject({url:`/api/rooms/${code}`,headers:{...protocol,cookie:`ravens_player=${encodeURIComponent(app.signCookie(token))}`}})).json().errorCode).toBe('BOT_EXTERNAL_ACCESS');
 const ticket=(await app.inject({url:`/api/rooms/${code}/join-ticket?mode=PLAYER`,headers:protocol})).json().joinTicket;expect((await app.inject({method:'POST',url:`/api/rooms/${code}/join`,headers:{...protocol,cookie:`ravens_player=${encodeURIComponent(app.signCookie(token))}`},payload:{nickname:'伪装',mode:'PLAYER',joinTicket:ticket}})).json().errorCode).toBe('BOT_EXTERNAL_ACCESS');
 const mine=(await app.inject({url:`/api/rooms/${code}/me`,headers:{...protocol,cookie:host.cookie}})).json();expect(mine.room.participants).toHaveLength(5);expect(mine.room.botControl.pending).toBeUndefined();expect(JSON.stringify(mine)).not.toContain('knownTeamSeats');
});
test('manual control advances an unpublished night transition without ordinary presentation/context checks',async()=>{
 const app=appFixture(),{code}=await create(app),host=await join(app,code);
 expect((await control(app,code,host.cookie,'bots',{fill:true})).statusCode).toBe(200);
 expect((await control(app,code,host.cookie,'rehearsal/clock',{mode:'MANUAL'})).statusCode).toBe(200);
 for(let i=0;i<4;i++)expect((await control(app,code,host.cookie,'bots/step')).json().controlResult.status).toBe('APPLIED');
 async function ordinary(path:string,extra:object={}){const body=await intent(app,code,host.cookie,extra);delete (body as Partial<typeof body>).expectedControlVersion;return app.inject({method:'POST',url:`/api/rooms/${code}/${path}`,headers:{...protocol,cookie:host.cookie,'x-command-id':randomUUID()},payload:body});}
 expect((await ordinary('start',{tutorialMode:'SKIP',markHostReady:true})).statusCode).toBe(200);expect((await ordinary('role/confirm')).statusCode).toBe(200);
 for(let i=0;i<4;i++)expect((await control(app,code,host.cookie,'bots/step')).json().controlResult.status).toBe('APPLIED');
 const advance=await control(app,code,host.cookie,'rehearsal/advance');expect(advance.statusCode).toBe(200);expect(advance.json().controlResult.status).toBe('ADVANCED');expect(advance.json().game.phase).toBe('FIRST_NIGHT');
});
test('a second human disables rehearsal; protocol 2 writes and reads require refresh',async()=>{
 const app=appFixture(),{code}=await create(app),host=await join(app,code);await join(app,code,'Second');await control(app,code,host.cookie,'bots',{fill:true});
 expect((await control(app,code,host.cookie,'rehearsal/clock',{mode:'MANUAL'})).statusCode).toBe(409);
 expect((await app.inject({url:`/api/rooms/${code}`,headers:{'x-ravens-protocol':'2'}})).statusCode).toBe(426);
 expect((await app.inject({url:`/api/rooms/${code}/summary`})).json().botCount).toBe(3);
});

test('account creation tickets never become guest bearer recovery after logout or switching accounts',async()=>{
 const app=buildApp({timers:false,resolveAccount:async cookie=>cookie?.includes('fixture=owner')?{sub:'owner',name:'甲'}:cookie?.includes('fixture=other')?{sub:'other',name:'乙'}:null});apps.push(app);
 const ticket=(await app.inject({url:'/api/room-create-ticket',headers:{...protocol,cookie:'fixture=owner'}})).json().createTicket,payload={playerCount:5,organizerName:'甲',createTicket:ticket},id=randomUUID();
 const create=(cookie:string)=>app.inject({method:'POST',url:'/api/rooms',headers:{...protocol,cookie,'x-command-id':id},payload});expect((await create('fixture=owner')).statusCode).toBe(201);
 for(const cookie of ['','fixture=other']){const denied=await create(cookie);expect(denied.statusCode).toBe(403);expect(denied.json().code).toBeUndefined();expect(denied.json().organizerToken).toBeUndefined();}expect((await create('fixture=owner')).statusCode).toBe(201);
});
