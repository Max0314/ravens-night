import {afterEach,expect,test} from 'vitest';
import {buildApp} from '../app.js';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {PostgresRoomRepository} from '../db/room-repository.js';
const apps:Array<ReturnType<typeof buildApp>>=[];
afterEach(async()=>{for(const app of apps.splice(0))await app.close();});
const resolveAccount=async(header:string|undefined)=>header?.includes('fixture=owner')?{sub:'fixture-owner',name:'朋友'}:header?.includes('fixture=other')?{sub:'fixture-other',name:'其他'}:null;
const create=()=>{const app=buildApp({resolveAccount,timers:false,presentation:false});apps.push(app);return app;};
const cookieOf=(response:{headers:Record<string,unknown>})=>String(response.headers['set-cookie']).split(';')[0]!;
test('account-bound seats reject stolen capabilities and public views never expose the account ID',async()=>{
  const app=create();const room=(await app.inject({method:'POST',url:'/api/rooms',headers:{cookie:'fixture=owner'},payload:{playerCount:5,organizerName:'朋友'}})).json();
  const joined=await app.inject({method:'POST',url:`/api/rooms/${room.code}/join`,headers:{cookie:'fixture=owner'},payload:{nickname:'朋友',mode:'PLAYER'}});expect(joined.statusCode).toBe(201);
  const seat=joined.json(),cookie=cookieOf(joined);
  expect((await app.inject({url:`/api/rooms/${room.code}/me`,headers:{cookie:'fixture=owner; '+cookie}})).statusCode).toBe(200);
  for(const fixture of ['', 'fixture=other; '])expect((await app.inject({url:`/api/rooms/${room.code}/me`,headers:{cookie:fixture+cookie}})).statusCode).toBe(403);
  const publicView=await app.inject(`/api/rooms/${room.code}`);expect(publicView.body).not.toContain('fixture-owner');expect(publicView.body).not.toContain('accountId');
  expect((await app.inject({url:'/api/account',headers:{cookie:'fixture=other'}})).json().rooms).toEqual([]);
  const resume=await app.inject({method:'POST',url:`/api/rooms/${room.code}/account/resume`,headers:{cookie:'fixture=owner'},payload:{participantId:seat.id}});expect(resume.statusCode).toBe(200);expect(resume.json().id).toBe(seat.id);
  expect((await app.inject({method:'POST',url:`/api/rooms/${room.code}/account/resume`,headers:{cookie:'fixture=other'},payload:{participantId:seat.id}})).statusCode).toBe(403);
});
test('guest claims require signed preview and explicit confirmation; duplicates are idempotent and old guest tokens stop working',async()=>{
  const app=create();const room=(await app.inject({method:'POST',url:'/api/rooms',payload:{playerCount:5,organizerName:'游客'}})).json();
  const joined=await app.inject({method:'POST',url:`/api/rooms/${room.code}/join`,payload:{nickname:'游客',mode:'PLAYER'}}),guest=cookieOf(joined);
  const post=(suffix:string,payload:object,fixture='fixture=owner; ')=>app.inject({method:'POST',url:`/api/rooms/${room.code}/account/${suffix}`,headers:{cookie:fixture+guest},payload});
  const preview=await post('guest-preview',{});expect(preview.statusCode).toBe(200);expect(preview.json().consumesOpportunity).toBe(false);
  expect((await app.inject({url:'/api/account',headers:{cookie:'fixture=owner'}})).json().guestClaimAvailable).toBe(true);
  expect((await post('guest-claim',{previewToken:preview.json().previewToken,confirm:false})).statusCode).toBe(400);
  expect((await post('guest-claim',{previewToken:preview.json().previewToken,confirm:true},'fixture=other; ')).statusCode).toBe(400);
  const claimed=await post('guest-claim',{previewToken:preview.json().previewToken,confirm:true});expect(claimed.statusCode).toBe(200);
  expect((await post('guest-claim',{previewToken:preview.json().previewToken,confirm:true})).json()).toEqual(claimed.json());
  expect((await app.inject({url:'/api/account',headers:{cookie:'fixture=owner'}})).json().guestClaimAvailable).toBe(false);
  expect((await app.inject({url:`/api/rooms/${room.code}/me`,headers:{cookie:guest}})).statusCode).toBe(403);
  expect((await post('guest-preview',{})).statusCode).toBe(400);
});

test.skipIf(!process.env.TEST_DATABASE_URL)('PostgreSQL preserves encrypted account rooms and once-only claims across restart, atomically rolling back conflicts',async()=>{
  const connectionString=process.env.TEST_DATABASE_URL!,schema='raven_auth_'+randomBytes(8).toString('hex');
  const admin=new Pool({connectionString,max:1});await admin.query(`CREATE SCHEMA "${schema}"`);
  const url=new URL(connectionString);url.searchParams.set('options','-c search_path='+schema);
  const repository=new PostgresRoomRepository(url.toString(),'fixture-encryption-only');let app=buildApp({resolveAccount,repository,timers:false,presentation:false});
  try{
    const room=(await app.inject({method:'POST',url:'/api/rooms',payload:{playerCount:5,organizerName:'游客'}})).json();
    const joined=await app.inject({method:'POST',url:`/api/rooms/${room.code}/join`,payload:{nickname:'游客',mode:'PLAYER'}}),guest=cookieOf(joined);
    const post=(suffix:string,payload:object)=>app.inject({method:'POST',url:`/api/rooms/${room.code}/account/${suffix}`,headers:{cookie:'fixture=owner; '+guest},payload});
    const preview=(await post('guest-preview',{})).json();
    await admin.query(`ALTER TABLE "${schema}".account_guest_claims ADD CONSTRAINT reject_fixture CHECK(account_id<>'fixture-owner')`);
    expect((await post('guest-claim',{previewToken:preview.previewToken,confirm:true})).statusCode).toBe(503);
    expect((await app.inject({url:'/api/account',headers:{cookie:'fixture=owner'}})).json().guestClaimAvailable).toBe(true);
    expect((await admin.query(`SELECT count(*)::int AS n FROM "${schema}".account_guest_claims`)).rows[0].n).toBe(0);
    await admin.query(`ALTER TABLE "${schema}".account_guest_claims DROP CONSTRAINT reject_fixture`);
    const claimed=await post('guest-claim',{previewToken:preview.previewToken,confirm:true});expect(claimed.statusCode).toBe(200);
    const saved=(await admin.query(`SELECT snapshot FROM "${schema}".room_runtime_snapshots`)).rows[0].snapshot;expect(saved.format).toBe('ravens-aes256-v1');expect(JSON.stringify(saved)).not.toContain('fixture-owner');
    await app.close();app=buildApp({resolveAccount,repository:new PostgresRoomRepository(url.toString(),'fixture-encryption-only'),timers:false,presentation:false});
    const access=(await app.inject({url:'/api/account',headers:{cookie:'fixture=owner'}})).json();expect(access.guestClaimAvailable).toBe(false);expect(access.rooms[0].participantId).toBe(joined.json().id);
    expect((await app.inject({url:'/api/account',headers:{cookie:'fixture=other'}})).json().rooms).toEqual([]);
  }finally{await app.close();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});
