import {expect,test} from 'vitest';
import {avatarChoices,type PrivateView} from '@ravens/contracts';
import {roleById} from '@ravens/game-engine';
import {RoomService} from './service.js';
import {chooseBotAction} from './bot-policy.js';
import {bots} from './bot-types.js';
import {runBots} from './bot-scheduler.js';
import {initializePresentation} from './presentation.js';

function table(){let now=1800000000000;const s=new RoomService({now:()=>now,presentation:false}),code=s.create(5,'甲').room.code,host=s.join(code,'甲','PLAYER');s.changeBots(code,host.token,{fill:true});for(const p of s.find(code).participants)s.setReady(code,p.controller==='BOT'?s.internalBotToken(s.find(code),p):host.token,true);s.startTutorial(code,host.token,'SKIP');return{s,code,host,advance:(ms:number)=>{now+=ms;s.pulse(code,host.token,now);},now:()=>now};}
test('default and restored bots never nominate; opt-in works and turning off discards queued nominations',()=>{
  const t=table(),room=t.s.find(t.code),g=room.game!;g.phase='DAY_DISCUSSION';g.day=1;g.startInfo={mode:'LEGACY',stage:'COMPLETE',entries:{}};g.presentationUntil=0;g.pendingPublications=[];delete g.publicProjection;initializePresentation(g,t.now());t.advance(12000);
  const bot=bots(room)[0]!,observe=()=>({...t.s.privateView(t.code,t.s.internalBotToken(room,bot)),room:t.s.publicView(t.code)}) as unknown as PrivateView;
  const choose=()=>chooseBotAction({view:observe(),memory:{knownTeamSeats:[],ackedHumanMessageIds:[]},seed:'test',now:t.now(),slow:false});
  expect(choose()?.kind).not.toBe('NOMINATE');
  t.s.changeBotControl(t.code,t.host.token,undefined,undefined,true);expect(choose()?.kind).toBe('NOMINATE');runBots(t.s);expect(room.botControl.pending.some(p=>p.kind==='NOMINATE')).toBe(true);
  t.s.changeBotControl(t.code,t.host.token,undefined,undefined,false);runBots(t.s);expect(room.botControl.pending.some(p=>p.kind==='NOMINATE')).toBe(false);expect(g.events.some(e=>e.kind==='NOMINATION')).toBe(false);
  const snapshot=t.s.snapshot(t.code);delete snapshot.botControl.autoNominate;const restored=new RoomService({now:t.now,presentation:false});restored.restore([snapshot]);expect(restored.publicView(t.code).botControl.autoNominate).toBe(false);
});
test('live guest edits appear publicly and privately without changing game context, readiness, or released history',()=>{
  const t=table(),before=t.s.snapshot(t.code),original=t.s.privateView(t.code,t.host.token);
  const selected=avatarChoices.find(a=>!t.s.find(t.code).participants.some(p=>p.avatarSnapshot===a.url))!.url;
  const result=t.s.updateGuestProfile(t.code,t.host.token,'皮卡丘',selected);
  expect(result.profileApplication).toBe('CURRENT');expect(t.s.publicView(t.code).participants[0]).toMatchObject({nickname:'皮卡丘',avatar:selected});expect(t.s.privateView(t.code,t.host.token).game!.seats[0]!.nickname).toBe('皮卡丘');
  expect(t.s.find(t.code).setupId).toBe(before.setupId);expect(t.s.find(t.code).game!.contextId).toBe(before.game!.contextId);expect(t.s.find(t.code).game!.events).toEqual(before.game!.events);expect(t.s.privateView(t.code,t.host.token).history).toEqual(original.history);
  const revision=t.s.find(t.code).revision;t.s.updateGuestProfile(t.code,t.host.token,'皮卡丘',selected);expect(t.s.find(t.code).revision).toBe(revision);
});
test('saving current account profile cancels a legacy deferred profile instead of restoring it next round',()=>{
  const t=table(),room=t.s.find(t.code),p=room.participants[0]!,account={sub:'owner',name:'甲',picture:p.avatarSnapshot!};t.s.bindAccount(t.code,t.host.token,account.sub,t.host.token);t.s.updateAccountProfile(account,'甲',account.picture,0);p.pendingProfile={nickname:'过期资料',avatar:avatarChoices[1]!.url};
  t.s.updateAccountProfile(account,'甲',account.picture,1);expect(p.pendingProfile).toBeUndefined();t.s.abort(t.code,t.host.token);t.s.reset(t.code,t.host.token);expect(t.s.publicView(t.code).participants[0]!.nickname).toBe('甲');
});

test('information targets stay private and empath neighbors wait for the actual dawn result',()=>{
 let now=1800000000000;const s=new RoomService({now:()=>now,presentation:true}),code=s.create(5,'甲').room.code,players=Array.from({length:5},(_,i)=>s.join(code,`玩家${i+1}`,'PLAYER'));players.forEach(p=>s.setReady(code,p.token,true));s.startTutorial(code,players[0]!.token);
 const room=s.find(code);room.assignments=['empath','chef','washerwoman','scarlet_woman','imp'].map((id,i)=>{const role=roleById(id);return{seat:i+1,roleId:id,perceivedRoleId:id,roleType:role.type,alignment:role.type==='MINION'||role.type==='DEMON'?'EVIL' as const:'GOOD' as const};});players.forEach(p=>s.completeTutorial(code,p.token));players.forEach(p=>s.confirmRole(code,p.token));
 const advance=(ms:number)=>{now+=ms;s.advanceTime(now);};for(let i=0;i<100&&(s.publicView(code).game?.phase!=='DAY_DISCUSSION'||now<s.find(code).game!.presentationUntil);i++)advance(250);
 expect(s.publicView(code).game?.phase).toBe('DAY_DISCUSSION');
 const pair=s.privateView(code,players[2]!.token).history.find(e=>e.kind==='INFORMATION'&&e.text.startsWith('洗衣妇信息'))!;expect(pair.targetSeats).toHaveLength(2);expect(pair.targetSeats!.every(seat=>pair.text.includes(`【玩家${seat}-`))).toBe(true);expect(JSON.stringify(s.publicView(code))).not.toContain('targetSeats');expect(s.privateView(code,players[1]!.token).history.some(e=>e.text===pair.text)).toBe(false);
 players.forEach(p=>{if(s.privateView(code,p.token).canEndDay)s.readyToEndDay(code,p.token);});for(let i=0;i<150&&!s.privateView(code,players[4]!.token).action;i++)advance(250);expect(s.privateView(code,players[4]!.token).action?.kind).toBe('SELECT_ONE');s.submitAction(code,players[4]!.token,[2]);
 const latest=()=>s.privateView(code,players[0]!.token).history.filter(e=>e.kind==='INFORMATION'&&e.text.startsWith('共情信息')).at(-1)!;
 expect(latest().targetSeats).toBeUndefined();expect(JSON.stringify(latest())).not.toContain('targetSeatsRevealDay');const dawn=s.find(code).game!.events.filter(e=>e.kind==='DAWN').at(-1)!;advance(dawn.startsAt+2800-now-1);expect(latest().targetSeats).toBeUndefined();advance(1);expect(new Set(latest().targetSeats)).toEqual(new Set([3,5]));
});
