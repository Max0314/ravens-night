import {expect,test} from 'vitest';
import {knownPlayerClues,publicPlayerDetail} from './player-detail.js';
import type {GameView,PrivateView} from '../api.js';
const game=():GameView=>({phase:'DAY_DISCUSSION',day:1,events:[],aliveCount:2,readyCount:0,seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:seat!==2,connected:true,ghostVoteAvailable:false}))});
const fatal=(kind:'SHOT'|'EXECUTION'|'DAWN',seq=1,startsAt=1000):GameView['events'][number]=>({seq,kind,timingVersion:4,startsAt,targetSeat:2,seats:[2],message:'公开结果',outcome:'DEATH'});
test('public death cause waits for result time and keeps the first death across later executions',()=>{
 const g=game();g.events=[fatal('SHOT'),fatal('EXECUTION',2,4000)];expect(publicPlayerDetail(g,2,1849).deathReason).toContain('尚未公布');expect(publicPlayerDetail(g,2,1850).deathReason).toBe('公开枪击');expect(publicPlayerDetail(g,2,7000).deathReason).toBe('公开枪击');
 g.events=[{...fatal('EXECUTION'),outcome:'NO_DEATH',seats:[]}];expect(publicPlayerDetail(g,2,7000).deathReason).toContain('未记录');
});
test('night deaths never infer hidden killer, poison, protection or self-kill and vote seats are not deaths',()=>{
 const g=game();g.events=[{seq:1,kind:'VOTE_RESULT',day:1,targetSeat:1,seats:[2],votes:4,startsAt:0,message:'投票人2',outcome:'ON_BLOCK'},fatal('DAWN',2)];
 expect(publicPlayerDetail(g,2,2799).deathReason).toContain('尚未公布');expect(publicPlayerDetail(g,2,2800).deathReason).toBe('夜间死亡（黎明公布）');expect(publicPlayerDetail(g,2,2800).votes).toEqual([]);
 const alive=publicPlayerDetail(g,1,9000);expect(alive.deathReason).toBeUndefined();expect(alive.ghost).toBe('存活，鬼票尚未启用');
});
test('today scores include all published rounds and distinguish ongoing votes from the global maximum',()=>{
 const g=game();g.onBlock={seat:1,votes:3};g.events=[{seq:1,kind:'VOTE_RESULT',day:0,targetSeat:2,votes:9,startsAt:0,message:''},{seq:2,kind:'VOTE_RESULT',day:1,targetSeat:2,votes:5,startsAt:0,message:''},{seq:3,kind:'VOTE_RESULT',day:1,targetSeat:1,votes:4,startsAt:0,message:''},{seq:4,kind:'VOTE_RESULT',day:1,targetSeat:2,votes:12,startsAt:10000,message:''}];
 expect(publicPlayerDetail(g,2,1000)).toMatchObject({votes:[{seq:2,votes:5}],highest:5,ghost:'鬼票已使用'});
});
test('private details show only received structured relationships and preserve possible roles and old spy facts',()=>{
 const view:PrivateView={state:'RUNNING',participant:{id:'me',seat:1,nickname:'我'},messages:[],game:game(),butler:{masterSeat:2,masterRaised:false},startInfo:{infoId:'i',gameId:'g',team:[{seat:2,nickname:'旧同伴',kind:'MINION'}],bluffs:[],acknowledged:true,canAcknowledge:false},history:[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'二人之一',candidateGroup:{kind:'ONE_OF',roleName:'镇长',seats:[2,3]}},{seq:2,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'未知目标的旧文本玩家2'},{seq:3,phase:'OTHER_NIGHT',day:1,kind:'INFORMATION',text:'魔典',grimoire:{entries:[{seat:2,nickname:'当夜昵称',roleName:'酒鬼',alive:true,reminders:['酒鬼自认厨师']}]}}]};
 const clues=knownPlayerClues(view,2);expect(clues.map(c=>c.text).join(' ')).toContain('可能是镇长');expect(clues.map(c=>c.text).join(' ')).toContain('爪牙同伴');expect(clues.map(c=>c.text).join(' ')).toContain('你已选择的主人');expect(clues.find(c=>c.key==='history-3')).toMatchObject({when:'第2夜魔典快照',text:'当夜所见：酒鬼 · 当夜存活 · 酒鬼自认厨师'});expect(clues.map(c=>c.text).join(' ')).not.toContain('未知目标');expect(knownPlayerClues({...view,history:[],startInfo:undefined,butler:undefined} as unknown as PrivateView,2)).toEqual([]);
});
