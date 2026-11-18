import {expect,test} from '@playwright/test';
import type {GameView,PrivateView,RoomView} from '../../apps/web/src/api.js';

const now=1790500000000;
const seats=Array.from({length:5},(_,index)=>({seat:index+1,nickname:`成员${index+1}`,alive:index!==0,connected:true,ghostVoteAvailable:true}));
const ballot:NonNullable<GameView['nomination']>={
  mode:'SIMULTANEOUS',ballotId:'ballot',nominatorSeat:2,nomineeSeat:3,votesReceived:0,votesRaised:0,
  threshold:3,votersRequired:5,defenseUntil:now+20000,preparationEndsAt:now+20000,
};

function view(phase:GameView['phase']='DAY_DISCUSSION',revision=1):PrivateView{
  const game:GameView={gameId:'test-game',day:1,phase,serverNow:now,events:[],aliveCount:4,readyCount:0,seats,
    ...(phase==='VOTING'?{nomination:ballot}:{})};
  const room:RoomView={code:'REF123',roomInstanceId:'test-room',setupId:'setup',revision,state:'RUNNING',playerCount:5,
    participants:[{id:'me',mode:'PLAYER',seat:1,nickname:'测试',ready:true,connected:true}],game,
    timeline:{mode:'MANUAL',epoch:1},self:{mode:'PLAYER',participantId:'me',commandVersion:0}};
  return {revision,state:'RUNNING',roomInstanceId:'test-room',setupId:'setup',self:{mode:'PLAYER',participantId:'me',commandVersion:0},room,game,
    participant:{id:'me',seat:1,nickname:'测试'},roleConfirmed:true,role:{roleId:'soldier',name:'士兵',type:'TOWNSFOLK',
      alignment:'GOOD',summary:'私密描述',beginnerTip:'测试'},history:[],messages:[],canVote:phase==='VOTING'};
}

test('role reference stays readable on the player viewport and does not interrupt voting',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  let snapshot=view();
  let pushView:(()=>void)|undefined;
  let voteReceived=false;
  let finishVote:()=>void=()=>{};
  await page.routeWebSocket('**/api/rooms/REF123/live?*',socket=>{
    pushView=()=>socket.send(JSON.stringify({type:'view',room:snapshot.room,privateView:snapshot,serverNow:now}));
  });
  await page.addInitScript(()=>sessionStorage.setItem('ravens_room_session',JSON.stringify({roomCode:'REF123',mode:'PLAYER',participantId:'me'})));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/auth/session')return route.fulfill({json:{authorized:true}});
    if(url.pathname==='/api/rooms/REF123')return route.fulfill({json:snapshot.room});
    if(url.pathname==='/api/rooms/REF123/me')return route.fulfill({json:snapshot});
    if(url.pathname==='/api/rooms/REF123/vote'){
      expect(route.request().postDataJSON().raised).toBe(true);
      voteReceived=true;
      await new Promise<void>(resolve=>{finishVote=resolve;});
      snapshot={...snapshot,voteRaised:true,voteSubmitted:true};
      return route.fulfill({json:snapshot});
    }
    if(route.request().method()!=='GET')throw Error(`Unexpected write: ${url.pathname}`);
    return route.fulfill({json:{}});
  });
  await page.goto('/');
  const navigation=page.getByRole('navigation',{name:'游戏分区'});
  const entry=navigation.getByRole('button',{name:'角色表'});
  const card=page.getByRole('dialog',{name:'角色表'});
  const close=card.getByRole('button',{name:'关闭角色表'});
  const role=card.getByRole('button',{name:'小恶魔'});
  await expect(navigation.getByRole('button')).toHaveText(['城镇','角色表','记录']);
  const navBox=await entry.boundingBox();
  expect(navBox?.x).toBeGreaterThan((await navigation.getByRole('button',{name:'城镇'}).boundingBox())!.x);
  await entry.click();
  await expect(card.getByRole('listitem')).toHaveCount(22);
  await expect(card).not.toContainText('私密描述');
  await expect.poll(()=>card.locator('img').first().evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(96);
  await page.screenshot({path:'outputs/ui-qa/role-reference-390.png'});
  for(const [width,height] of [[320,568],[568,320],[1280,800]]){
    await page.setViewportSize({width:width!,height:height!});
    await expect(close).toBeInViewport();
    await expect.poll(async()=> (await card.boundingBox())!.width).toBeLessThanOrEqual(Math.min(680,width!));
    expect(await card.evaluate(element=>element.scrollWidth)).toBeLessThanOrEqual((await card.boundingBox())!.width+1);
    await role.scrollIntoViewIfNeeded();
    await expect(role).toBeInViewport();
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  }
  await role.click();
  await expect(card.getByRole('article')).toContainText('规则细节');
  await page.evaluate(()=>history.back());
  await expect(role).toBeFocused();
  await page.evaluate(()=>history.back());
  await expect(card).toBeHidden();
  await expect(entry).toBeFocused();

  await page.setViewportSize({width:568,height:320});
  await entry.click();
  await expect.poll(()=>!!pushView).toBe(true);
  snapshot=view('VOTING',2);
  pushView!();
  const notice=page.getByRole('complementary',{name:'提名提醒'});
  await expect(notice).toBeVisible();
  await expect.poll(async()=> (await card.boundingBox())!.y+(await card.boundingBox())!.height).toBeLessThanOrEqual((await notice.boundingBox())!.y);
  await expect.poll(async()=> (await card.boundingBox())!.height).toBeGreaterThanOrEqual(136);
  await expect(card.getByRole('button',{name:'洗衣妇'})).toBeInViewport({ratio:0.6});
  await notice.getByRole('button',{name:'举手',exact:true}).click();
  const confirmation=page.getByRole('alertdialog',{name:'使用鬼票'});
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(card).toBeVisible();
  await notice.getByRole('button',{name:'举手',exact:true}).click();
  await confirmation.getByRole('button',{name:'确认使用鬼票'}).click();
  await expect.poll(()=>voteReceived).toBe(true);
  await card.getByRole('button',{name:'洗衣妇'}).click();
  await close.click();
  await entry.click();
  await expect(card.getByRole('listitem')).toHaveCount(22);
  await expect(notice.getByRole('button',{name:'举手',exact:true})).toBeDisabled();
  finishVote();
  await expect(notice).toContainText('你已举手');
  await page.screenshot({path:'outputs/ui-qa/role-reference-ballot-568.png'});
  await notice.getByRole('button',{name:'返回城镇',exact:true}).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole('button',{name:'查看本轮表决规则'})).toBeFocused();
});
