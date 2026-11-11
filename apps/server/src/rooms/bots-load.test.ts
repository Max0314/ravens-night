import {performance} from 'node:perf_hooks';
import {expect,test} from 'vitest';
import {LiveRoomRuntime} from '../game/live-runtime.js';
import {bots} from './bot-types.js';
import {runBots} from './bot-scheduler.js';
import {initializePresentation} from './presentation.js';

test('128 bots keep bounded tasks and leave the room command queue responsive across ten mixed ticks',async()=>{
 let now=1800000000000;const runtime=new LiveRoomRuntime(undefined,{now:()=>now,presentation:true}),hosts:Array<{code:string;token:string}>=[];
 await runtime.execute(s=>{for(let i=0;i<12;i++){const code=s.create(i===11?8:12,`真人${i}`).room.code,token=s.join(code,`真人${i}`,'PLAYER').token;s.changeBots(code,token,{fill:true});hosts.push({code,token});for(const bot of bots(s.find(code)))s.setReady(code,s.internalBotToken(s.find(code),bot),true);s.setReady(code,token,true);s.startTutorial(code,token,'SKIP');if(i%4>0){const g=s.find(code).game!;g.startInfo={mode:'LEGACY',stage:'COMPLETE',entries:{}};g.presentationVersion=1;g.phase=i%4===1?'FIRST_NIGHT':'DAY_DISCUSSION';g.day=1;g.presentationUntil=0;g.pendingPublications=[];delete g.publicProjection;initializePresentation(g,now);if(i%4===3)s.nominate(code,token,2);}}});
 expect(hosts.reduce((sum,h)=>sum+bots(runtime.service.find(h.code)).length,0)).toBe(128);
 const ticks:number[]=[],commands:number[]=[];
 for(let i=0;i<10;i++){now+=500;const at=performance.now();const tick=runtime.execute(s=>{s.advanceTime(now);runBots(s);});const commandAt=performance.now(),host=hosts[i%hosts.length]!;const command=runtime.execute(s=>{s.pulse(host.code,host.token,now);});await tick;ticks.push(performance.now()-at);await command;commands.push(performance.now()-commandAt);for(const h of hosts){const r=runtime.service.find(h.code);expect(r.botControl.pending.length).toBeLessThanOrEqual(bots(r).length);expect(r.botControl.attentionRequired).toBe(false);}}
 const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]!;console.info(`BOT_LOAD tick_p95=${p95(ticks).toFixed(1)}ms command_p95=${p95(commands).toFixed(1)}ms bots=128 ticks=10`);expect(p95(ticks)).toBeLessThanOrEqual(250);expect(p95(commands)).toBeLessThanOrEqual(1000);await runtime.close();
});
