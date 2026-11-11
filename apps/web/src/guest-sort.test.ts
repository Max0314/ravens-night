// @vitest-environment jsdom
import {beforeEach,expect,test,vi} from 'vitest';
import {avatarChoices,trustedAvatar} from '@ravens/contracts';
import {loadGuestProfile,saveGuestProfile,guestNames} from './guest-profile.js';
import {insertionSlot,moveSeat,spring} from './seat-sort.js';
import {joinRoom,resetAccountContext} from './api.js';
beforeEach(()=>{localStorage.clear();sessionStorage.clear();resetAccountContext();vi.unstubAllGlobals();});
test('a guest is generated once, explicit edits persist and historical avatar versions are retained',()=>{
 const first=loadGuestProfile();expect(loadGuestProfile()).toEqual(first);expect(guestNames.length).toBeGreaterThanOrEqual(80);expect(trustedAvatar(first.avatar)).toBe(first.avatar);
 const historical='https://auth.fribench.cn/assets/avatars/v1/bench-chill.webp';saveGuestProfile({nickname:'犬夜叉',avatar:historical});expect(loadGuestProfile()).toMatchObject({nickname:'犬夜叉',avatar:historical});
 localStorage.setItem('ravens_guest_profile_v1',JSON.stringify({...first,nickname:'皮卡丘',avatar:'https://invalid.test/image.png'}));expect(loadGuestProfile()).toMatchObject({nickname:'皮卡丘'});expect(trustedAvatar(loadGuestProfile().avatar)).toBeTruthy();
});
test('grid insertion is stable across rows and stationary hysteresis; springs preserve velocity and converge',()=>{
 const slots=Array.from({length:7},(_,i)=>({x:i%3*100,y:Math.floor(i/3)*100,width:90,height:90}));
 expect(insertionSlot(slots,{x:95,y:45},0)).toBe(0);expect(insertionSlot(slots,{x:110,y:45},0)).toBe(1);expect(insertionSlot(slots,{x:400,y:245},3)).toBe(6);
 let p=0,v=0;for(let i=0;i<120;i++){const next=spring(p,v,100,.016);p=next.position;v=next.velocity;}expect(p).toBe(100);expect(v).toBe(0);expect(moveSeat(['a','b','c'],'a',2)).toEqual(['b','c','a']);
});
test('a damaged read-only guest record keeps the repaired avatar in memory instead of randomizing on every form',()=>{
 localStorage.setItem('ravens_guest_profile_v1',JSON.stringify({version:1,nickname:'皮卡丘',avatar:'invalid'}));vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('read only');});const first=loadGuestProfile();expect(loadGuestProfile()).toMatchObject({nickname:first.nickname,avatar:first.avatar});expect(first.nickname).toBe('皮卡丘');vi.restoreAllMocks();
});
test('join shares one ticket and request, retains a frozen intent when storage is rejected',async()=>{
 let release!:(value:Response)=>void;const profile={nickname:'皮卡丘',avatar:avatarChoices[0]!.url};
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
 const fetcher=vi.fn((url:string)=>url.includes('join-ticket')?new Promise<Response>(resolve=>{release=resolve;}):Promise.resolve(new Response(JSON.stringify({id:'self',nickname:profile.nickname,mode:'PLAYER',token:'test'}),{status:201})));vi.stubGlobal('fetch',fetcher);
 const first=joinRoom('ABCDEF',profile.nickname,'PLAYER',profile),second=joinRoom('ABCDEF',profile.nickname,'PLAYER',profile);expect(first).toBe(second);
 await expect(joinRoom('ABCDEF','犬夜叉','PLAYER',{...profile,nickname:'犬夜叉'})).rejects.toThrow(/结果待确认/);
 release(new Response(JSON.stringify({joinTicket:'one-ticket'}),{status:200}));await first;expect(fetcher).toHaveBeenCalledTimes(2);vi.restoreAllMocks();
});
