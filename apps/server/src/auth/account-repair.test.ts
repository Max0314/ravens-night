import { expect, test } from "vitest";
import { accountClient } from "./account.js";
import { avatarChoices, trustedAvatar } from "./avatar.js";
test("concurrent upstream failures all remain temporary 503, never a signed-out session",async()=>{
  let fail!:(reason:Error)=>void;
  const fetcher=(()=>new Promise<Response>((_,reject)=>{fail=reject;})) as typeof fetch;
  const client=accountClient("test-only","https://clocktower.fribench.cn",fetcher);
  const cookie="__Host-fribench_ravens_night="+"x".repeat(43);
  const first=client(cookie), second=client(cookie);fail(new TypeError("network"));
  for(const result of await Promise.allSettled([first,second])){expect(result.status).toBe("rejected");if(result.status==="rejected")expect(result.reason).toMatchObject({status:503,errorCode:"IDENTITY_UNAVAILABLE"});}
});
test("avatar URLs accept exact known version/IDs and reject normalized or foreign URLs",()=>{
  expect(trustedAvatar("https://auth.fribench.cn/assets/avatars/v3/banana-cat-crying.webp")).toBeDefined();
  for(const value of ["https://auth.fribench.cn/assets/avatars/v1/banana-cat-crying.webp","https://auth.fribench.cn/assets/avatars/v3/unknown.webp","https://auth.fribench.cn/assets/avatars/v3/banana-cat-crying.webp?q=1","https://auth.fribench.cn/assets/avatars/v3/../v3/banana-cat-crying.webp","https://auth.fribench.cn.evil.test/assets/avatars/v3/banana-cat-crying.webp"])expect(trustedAvatar(value)).toBeUndefined();
});


test('current avatar choices omit retired assets but older existing version URLs remain valid',()=>{
  expect(avatarChoices.some(choice=>choice.id==='bench-chill')).toBe(false);
  expect(trustedAvatar('https://auth.fribench.cn/assets/avatars/v3/bench-chill.webp')).toBeUndefined();
  expect(trustedAvatar('https://auth.fribench.cn/assets/avatars/v1/bench-chill.webp')).toBeDefined();
  expect(avatarChoices.every(choice=>trustedAvatar(choice.url)===choice.url)).toBe(true);
});
