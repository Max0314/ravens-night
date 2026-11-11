// @vitest-environment jsdom
import '../../apps/web/node_modules/@testing-library/jest-dom/dist/vitest.mjs';
import React from '../../apps/web/node_modules/react/index.js';
const {StrictMode}=React;
import {cleanup,fireEvent,render,screen,waitFor} from '../../apps/web/node_modules/@testing-library/react/dist/index.js';
import {afterEach,expect,test,vi} from 'vitest';
import {buildApp} from '../../apps/server/src/app.js';
import {App} from '../../apps/web/src/App.js';
import {resetAccountContext} from '../../apps/web/src/api.js';
afterEach(()=>{cleanup();vi.unstubAllGlobals();resetAccountContext();sessionStorage.clear();localStorage.clear();window.history.replaceState({},'','/');});

test.each(['GUEST','ACCOUNT'])('a real %s room host can open the empty-seat bot entry and submit fill through the UI command queue',async(kind)=>{
 const server=buildApp({timers:false,resolveAccount:async cookie=>cookie?.includes('fixture=owner')?{sub:'fixture-owner',name:'本人'}:null});
 try{
  const protocol={'x-ravens-protocol':'3',...(kind==='ACCOUNT'?{cookie:'fixture=owner'}:{})},ticket=await server.inject({url:'/api/room-create-ticket',headers:protocol});
  const created=await server.inject({method:'POST',url:'/api/rooms',headers:{...protocol,cookie:[protocol.cookie,ticket.cookies.map(c=>`${c.name}=${c.value}`).join('; ')].filter(Boolean).join('; '),'x-command-id':crypto.randomUUID()},payload:{playerCount:8,organizerName:'本人',createTicket:ticket.json().createTicket}});expect(created.statusCode).toBe(201);const code=created.json().code;
  const joinTicket=(await server.inject({url:`/api/rooms/${code}/join-ticket?mode=PLAYER`,headers:protocol})).json().joinTicket;
  const joined=await server.inject({method:'POST',url:`/api/rooms/${code}/join`,headers:protocol,payload:{nickname:'本人',mode:'PLAYER',joinTicket}});expect(joined.statusCode).toBe(201);const cookie=[protocol.cookie,joined.cookies.map(c=>`${c.name}=${c.value}`).join('; ')].filter(Boolean).join('; ');
  sessionStorage.setItem('ravens_room_session',JSON.stringify({roomCode:code,mode:'PLAYER',participantId:joined.json().id}));
  const writes:string[]=[];vi.stubGlobal('WebSocket',undefined);vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{const headers=Object.fromEntries(new Headers(init?.headers));const response=await server.inject({url,method:(init?.method??'GET') as 'GET'|'POST'|'DELETE',headers:{...headers,cookie},...(init?.body?{payload:String(init.body)}:{})});if(init?.method==='POST')writes.push(url);return{ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()};}));
  render(React.createElement(StrictMode,null,React.createElement(App)));await screen.findByRole('heading',{name:code});fireEvent.click(screen.getAllByRole('button',{name:/补人机/})[0]!);expect(await screen.findByRole('button',{name:'人机补满'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'人机补满'}));await screen.findByText('已添加 7 个人机');expect(writes.filter(url=>url.endsWith('/bots'))).toHaveLength(1);await waitFor(()=>expect(screen.getByText('1 真人 · 7 人机 · 0/8 已准备')).toBeVisible());
 }finally{cleanup();await server.close();}
});
