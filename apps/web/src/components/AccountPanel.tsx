import {useEffect,useState} from 'react';
import {getAccount,resumeAccountRoom,previewGuest,claimGuest,type AccountAccess,type AccountRoom,type GuestPreview} from '../api.js';
export function AccountPanel({guestCode,onResume}:{guestCode?:string;onResume:(code:string,id:string,mode:'PLAYER'|'DISPLAY')=>void}){
  const[account,setAccount]=useState<AccountAccess>(),[preview,setPreview]=useState<GuestPreview>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let current=true;void getAccount().then(value=>{if(current)setAccount(value);}).catch(()=>{});return()=>{current=false;};},[]);
  const run=async(work:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await work();}catch(error){setError(error instanceof Error?error.message:'暂时无法完成操作');}finally{setBusy(false);}};
  const resume=(room:AccountRoom)=>run(async()=>{const result=await resumeAccountRoom(room);onResume(result.code,result.id,result.mode);});
  return <details className="account-access" aria-label="账号牌桌" data-account-controls>
    <summary>我的钟楼席位</summary>
    {!account?.signedIn?<p>游客无需注册即可游玩。<a href="/_fribench/auth/login?return_to=%2F">登录账号</a>后可在其他设备恢复自己的座位。</p>:<>
      <p>已登录；账号身份不会授予他人的角色、大屏或房主权限。</p>
      <a href="/_fribench/auth/manage?return_to=%2F" data-fribench-action="manage">资料与安全 →</a><button type="button" data-fribench-action="logout">退出账号</button><p role="status" data-account-status />
      {account.rooms.map(room=><button type="button" disabled={busy} key={room.code+room.participantId} onClick={()=>void resume(room)}>恢复 {room.code} · {room.nickname}{room.mode==='DISPLAY'?'（大屏）':''}</button>)}
      <p>{account.guestClaimAvailable?'每账号可在本服务认领一次游客座位，预览或取消不扣次数。':'本服务的游客认领机会已使用，账号正常游玩不受影响。'}</p>
      {guestCode&&account.guestClaimAvailable&&!account.rooms.length?<button type="button" disabled={busy} onClick={()=>void run(async()=>setPreview(await previewGuest(guestCode)))}>预览游客座位</button>:null}
      {preview?<div role="group" aria-label="确认认领"><p>房间 {preview.code} · {preview.seat} 号 {preview.nickname}。仅转入自己的座位，账号已有房间时不覆盖。</p><button disabled={busy} onClick={()=>void run(async()=>{const result=await claimGuest(preview);onResume(result.code,result.id,'PLAYER');})}>确认认领，仅此一次</button><button disabled={busy} onClick={()=>setPreview(undefined)}>取消，不扣次数</button></div>:null}
    </>}
    {error?<p role="alert">{error}</p>:null}
  </details>;
}
