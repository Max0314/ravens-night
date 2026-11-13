// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Display} from './Display.js';
import {displayTableLayout} from '../components/display-table-layout.js';
import {getRoom,type RoomView} from '../api.js';
vi.mock('../api.js',async original=>({...await original<typeof import('../api.js')>(),getRoom:vi.fn()}));
vi.mock('../room-live.js',()=>({connectRoomFeed:vi.fn(()=>()=>{})}));
vi.mock('../invite.js',()=>({invitationQr:vi.fn(async()=>'/qr.png')}));
vi.mock('../components/EventStage.js',()=>({EventStage:()=> <div data-testid="public-stage"/>,publicEventsAt:(events:unknown[])=>events}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('display lobby keeps public avatars in the measured table and requests the public view',async()=>{
 const room={code:'ABCDEF',state:'LOBBY',playerCount:5,participants:[{id:'stable-1',mode:'PLAYER',seat:1,nickname:'甲',avatar:'/avatar-a.webp',connected:true},{id:'stable-2',mode:'PLAYER',seat:2,nickname:'乙',avatar:'/avatar-b.webp',connected:true}]} as RoomView;
 vi.mocked(getRoom).mockResolvedValue(room);const ui=render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);
 await waitFor(()=>expect(ui.container.querySelectorAll('.display__table .rn-seat')).toHaveLength(2));expect(getRoom).toHaveBeenCalledWith('ABCDEF','DISPLAY');expect(ui.container.querySelector('[data-seat-number="1"] img')).toHaveAttribute('src','/avatar-a.webp');expect(screen.getByText('2/5 位已入座')).toBeVisible();
});
test('display uses only public life and ballot marks and contains the public performance',async()=>{
 const room={code:'ABCDEF',state:'RUNNING',playerCount:5,participants:[],game:{gameId:'g',contextId:'c',phase:'VOTING',day:1,aliveCount:2,readyCount:0,serverNow:1000,events:[],seats:[{seat:1,nickname:'甲',alive:true,connected:true,ghostVoteAvailable:true},{seat:2,nickname:'乙',alive:true,connected:true,ghostVoteAvailable:true}],nomination:{ballotId:'b',nominatorSeat:1,nomineeSeat:2,threshold:2,votesRaised:1,votesReceived:1},onBlock:{seat:1,votes:3}}} as RoomView;
 vi.mocked(getRoom).mockResolvedValue(room);const ui=render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);
 await screen.findByLabelText('公共演出容器');expect(screen.getByTestId('public-stage').closest('.display__performance')).not.toBeNull();expect(ui.container.querySelector('[data-seat-number="2"] .rn-avatar-state--threatened')).not.toBeNull();expect(ui.container.querySelector('[data-seat-number="1"] .rn-avatar-state--threatened')).not.toBeNull();expect(screen.getByLabelText('待处决候选，最高3票')).toBeVisible();expect(ui.container.querySelector('.rn-seat__private-mark')).toBeNull();
});

test('display shows shared final time and explicit selections for the simultaneous mode without sequential marks',async()=>{
 const room:RoomView={code:'ABCDEF',state:'RUNNING',playerCount:3,participants:[],timeline:{mode:'MANUAL',epoch:0},game:{gameId:'g',phase:'VOTING',day:1,serverNow:21000,aliveCount:3,readyCount:0,events:[],seats:[1,2,3].map(seat=>({seat,nickname:'玩家'+seat,alive:true,connected:true,ghostVoteAvailable:true})),nomination:{mode:'SIMULTANEOUS',ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:1,votesReceived:3,votersRequired:3,threshold:2,countdownStarted:true,preparationEndsAt:21000,voteStartsAt:21000,voteEndsAt:29000,currentVoterSeat:2,countedVotes:{2:false}}}};
 vi.mocked(getRoom).mockResolvedValue(room);const ui=render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);
 await screen.findByText('公开表决');const center=ui.container.querySelector('.display__center')!;expect(center).toHaveTextContent('剩余 8秒');expect(center).toHaveTextContent('当前 1 票');expect(center).toHaveTextContent('已选择 3/3 人');expect(center).not.toHaveTextContent('顺时针');expect(ui.container.querySelector('.rn-seat--counting')).toBeNull();
});


test.each([7,12])('TV %i-seat layout uses the same large geometry for the ring and preserves public-only long names',async count=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:1800,height:866,x:0,y:0,top:0,left:0,right:1800,bottom:866,toJSON:()=>({})});
 const room:RoomView={code:'ABCDEF',state:'RUNNING',playerCount:count,participants:[],game:{gameId:'g',phase:'DAY_DISCUSSION',day:1,serverNow:1000,aliveCount:count,readyCount:0,events:[],seats:Array.from({length:count},(_,i)=>({seat:i+1,nickname:'很长的公开昵称'+(i+1),alive:i!==2,connected:true,ghostVoteAvailable:true}))}};
 vi.mocked(getRoom).mockResolvedValue(room);const ui=render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);
 await screen.findByLabelText('公共演出容器');const table=ui.container.querySelector<HTMLElement>('.display__table')!,nodes=table.querySelectorAll<HTMLElement>('.rn-seat');
 expect(table).toHaveStyle({width:'866px',height:'866px'});expect(parseFloat(table.style.getPropertyValue('--round-portrait'))).toBeGreaterThanOrEqual(100);expect(nodes).toHaveLength(count);
 for(const[index,node]of nodes.entries()){expect(node.querySelector('.rn-seat__name')).toHaveTextContent('很长的公开昵称');const point=displayTableLayout(count,866).points[index]!;expect(parseFloat(node.style.left)).toBeCloseTo(point.x);expect(parseFloat(node.style.top)).toBeCloseTo(point.y);}
 expect(table.querySelector('.rn-seat__private-mark,[data-role-type]')).toBeNull();expect(ui.container.querySelector('[data-seat-number="3"] .rn-avatar-state--dead')).not.toBeNull();
});

test('public nomination names, one authoritative clock and large vote totals share the central status',async()=>{
 const room:RoomView={code:'ABCDEF',state:'RUNNING',playerCount:7,participants:[],timeline:{mode:'MANUAL',epoch:0},game:{gameId:'g',phase:'VOTING',day:1,serverNow:1000,aliveCount:7,readyCount:0,events:[],seats:Array.from({length:7},(_,i)=>({seat:i+1,nickname:i===0?'公开提名人长昵称':i===1?'公开被提名者长昵称':'玩家'+(i+1),alive:true,connected:true,ghostVoteAvailable:true})),nomination:{mode:'SIMULTANEOUS',ballotId:'b',nominatorSeat:1,nomineeSeat:2,votesRaised:3,votesReceived:5,votersRequired:7,threshold:4,voteEndsAt:29000,raisedSeats:[1,2]},onBlock:{seat:2,votes:4}}};
 vi.mocked(getRoom).mockResolvedValue(room);const ui=render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);const nomination=await screen.findByLabelText('当前公开提名');
 expect(nomination).toHaveTextContent('1号 [公开提名人长昵称]');expect(nomination).toHaveTextContent('2号 [公开被提名者长昵称]');
 const center=ui.container.querySelector('.display__center')!;expect(within(center as HTMLElement).getAllByText(/剩余 28秒/)).toHaveLength(1);expect(center).toHaveTextContent('当前 3 票');expect(center).toHaveTextContent('4 票达标');expect(center).toHaveTextContent('已选择 5/7 人');
 expect(screen.getByLabelText('待处决候选，最高4票')).toBeVisible();expect(screen.getAllByLabelText('已举手')).toHaveLength(2);
});

test('TV feed keeps the latest two published records in order',async()=>{
 const room={code:'ABCDEF',state:'RUNNING',playerCount:5,participants:[],game:{gameId:'g',phase:'DAY_DISCUSSION',day:1,aliveCount:5,readyCount:0,events:[1,2,3,4].map(seq=>({id:'e'+seq,seq,kind:'NOTICE',message:'公开消息'+seq})),seats:[]}} as unknown as RoomView;
 vi.mocked(getRoom).mockResolvedValue(room);render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);const feed=await screen.findByLabelText('村庄公开信息');expect(within(feed).getAllByRole('listitem').map(node=>node.textContent)).toEqual(['最新公开消息4','记录 3公开消息3']);expect(screen.queryByText('公开消息2')).toBeNull();
});

test('lobby exposes only public ready totals alongside its QR and room code',async()=>{
 const room:RoomView={code:'ABCDEF',state:'LOBBY',playerCount:7,participants:[{id:'1',mode:'PLAYER',seat:1,nickname:'甲',connected:true,ready:true},{id:'2',mode:'PLAYER',seat:2,nickname:'乙',connected:true,ready:false}]};
 vi.mocked(getRoom).mockResolvedValue(room);render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);expect(await screen.findByText('1/7 已准备')).toBeVisible();expect(await screen.findByRole('img',{name:'加入房间 ABCDEF 的二维码'})).toBeVisible();
});

test.each(['FIRST_NIGHT','GAME_OVER'] as const)('%s keeps a public waiting or gated ending instead of stale nomination names',async phase=>{
 const room:RoomView={code:'ABCDEF',state:'RUNNING',playerCount:5,participants:[],timeline:{mode:'MANUAL',epoch:0},game:{gameId:'g',phase,day:1,serverNow:1000,presentationUntil:8000,winner:'GOOD',aliveCount:5,readyCount:0,events:[],seats:[{seat:1,nickname:'甲',alive:true,connected:true,ghostVoteAvailable:true},{seat:2,nickname:'乙',alive:true,connected:true,ghostVoteAvailable:true}],nomination:{nominatorSeat:1,nomineeSeat:2,votesRaised:0,votesReceived:0,threshold:2}}};
 vi.mocked(getRoom).mockResolvedValue(room);render(<Display code="ABCDEF" onBack={vi.fn()} onRoomClosed={vi.fn()}/>);expect(await screen.findByRole('heading',{name:phase==='FIRST_NIGHT'?'村庄已经沉睡':'钟声仍在回响'})).toBeVisible();expect(screen.queryByLabelText('当前公开提名')).toBeNull();expect(screen.queryByText('善良获胜')).toBeNull();
});
