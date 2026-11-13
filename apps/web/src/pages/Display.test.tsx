// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Display} from './Display.js';
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
 await screen.findByText('统一截止表决');const center=ui.container.querySelector('.display__center')!;expect(center).toHaveTextContent('最后 8秒');expect(center).toHaveTextContent('当前 1 票');expect(center).toHaveTextContent('已选择 3/3 人');expect(center).not.toHaveTextContent('顺时针');expect(ui.container.querySelector('.rn-seat--counting')).toBeNull();
});
