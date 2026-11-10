import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ApiError,getAccount,getAvatarChoices,saveGameProfile,resumeAccountRoom,type AccountAccess,type AccountRoom} from '../api.js';
import {roomSessionKey} from '../account-context.js';
import {Avatar} from './Avatar.js';
import {useBackLayer} from '../use-back-layer.js';

export function AccountPanel({onResume,tools}:{guestCode?:string;onResume:(code:string,id:string,mode:'PLAYER'|'DISPLAY')=>void;tools?:ReactNode}){
  const[account,setAccount]=useState<AccountAccess>(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[avatarsOpen,setAvatarsOpen]=useState(false);
  const[nickname,setNickname]=useState(''),[avatar,setAvatar]=useState<string|null>(null),[choices,setChoices]=useState<Array<{id:string;url:string}>>([]);
  const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null),generation=useRef(0),initialKey=useRef(roomSessionKey());
  const apply=(next:AccountAccess)=>{setAccount(next);if(next.profile){setNickname(next.profile.nickname);setAvatar(next.profile.avatarOverride);}};
  useEffect(()=>{const current=++generation.current;void getAccount().then(value=>{if(current===generation.current)apply(value);}).catch(()=>{});const change=()=>{if(initialKey.current===roomSessionKey())return;generation.current++;setOpen(false);setAccount(undefined);setNickname('');setAvatar(null);};window.addEventListener('fribench:account-change',change);return()=>{generation.current++;window.removeEventListener('fribench:account-change',change);};},[]);
  useBackLayer(open,()=>setOpen(false));
  useEffect(()=>{if(!open)return;const behind=trigger.current?.closest('.home')?.querySelectorAll<HTMLElement>('.home-portrait,.home-controls,.filing-links,.home-brand,.home-account-trigger');behind?.forEach(node=>{node.inert=true;});dialog.current?.focus();return()=>{behind?.forEach(node=>{node.inert=false;});trigger.current?.focus();};},[open]);
  async function run(work:()=>Promise<void>){if(busy)return;const current=generation.current;setBusy(true);setError('');setNotice('');try{await work();}catch(failure){if(current!==generation.current)return;if(failure instanceof ApiError&&failure.status===409){const latest=await getAccount().catch(()=>undefined);if(latest&&current===generation.current)apply(latest);}if(current===generation.current)setError(failure instanceof Error?failure.message:'暂时无法完成操作');}finally{if(current===generation.current)setBusy(false);}}
  const show=()=>{setAvatarsOpen(false);setOpen(true);void run(async()=>{const current=generation.current;const next=await getAccount();if(current!==generation.current)return;apply(next);if(next.signedIn){const result=await getAvatarChoices();if(current===generation.current)setChoices(result.avatars);}});};
  const save=(reset=false)=>void run(async()=>{const current=generation.current,profile=account?.profile;if(!profile)return;const result=await saveGameProfile(reset?null:nickname.trim()===profile.defaultNickname?null:nickname.trim(),reset?null:avatar,profile.revision);if(current!==generation.current)return;apply({...account!,profile:result.profile});setAvatarsOpen(false);setNotice(reset?'已恢复 Fribench 默认资料':'本游戏资料已保存');});
  const resume=(room:AccountRoom)=>void run(async()=>{const current=generation.current;const result=await resumeAccountRoom(room);if(current!==generation.current)return;setOpen(false);onResume(result.code,result.id,result.mode);});
  const logout=()=>void run(async()=>{const api=(window as Window&{FribenchAccount?:{logout:()=>Promise<void>}}).FribenchAccount;if(!api)throw new Error('账号服务正在加载，请稍后重试');await api.logout();});
  return <><button ref={trigger} className="home-account-trigger" type="button" aria-label={account?.signedIn?'打开账号设置':'登录'} onClick={show}>{account?.signedIn?<Avatar id="account" name={account.profile?.nickname??'我'} {...(account.profile?.avatar?{url:account.profile.avatar}:{})}/>:<><span aria-hidden="true">♙</span><span>登录</span></>}</button>
    {open?<div className="account-backdrop" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}><section ref={dialog} tabIndex={-1} className="account-dialog" role="dialog" aria-modal="true" aria-label="账号设置" data-account-controls onKeyDown={event=>{if(event.key!=='Tab')return;const focusable=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),summary')).filter(el=>{if(el.closest('[hidden]'))return false;for(let parent=el.parentElement;parent&&parent!==dialog.current;parent=parent.parentElement){if(parent.tagName==='DETAILS'&&!parent.hasAttribute('open')&&!parent.querySelector(':scope > summary')?.contains(el))return false;}return true;});const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}>
      <header><div><small>RAVENS AT MIDNIGHT</small><h2>我的钟楼</h2></div><button type="button" aria-label="关闭账号设置" onClick={()=>setOpen(false)}>×</button></header>
      <div className="account-dialog__body">
      {!account?<p role="status">正在识别账号…</p>:!account.signedIn?<div className="account-welcome"><p>使用 Fribench 账号，已有登录会自动识别。</p><a className="account-login" href="/_fribench/auth/login?return_to=%2F">登录 Fribench</a><p className="account-note">也可以直接以游客身份游玩。</p></div>:<>
        <div className="account-profile-heading"><Avatar id="account" name={nickname} {...(avatar??account.profile?.defaultAvatar?{url:(avatar??account.profile?.defaultAvatar)!}:{})}/><div><strong>{account.profile?.nickname??'已登录'}</strong><small>本游戏资料</small></div></div>
        {account.profile?<form id="game-profile-form" onSubmit={event=>{event.preventDefault();save();}}>
          <label>昵称<input aria-label="本游戏昵称" value={nickname} maxLength={24} onChange={event=>setNickname(event.target.value)} disabled={busy} required/></label>
          <div className="account-avatar-picker">
            <button className="account-avatar-expander" type="button" aria-expanded={avatarsOpen} aria-controls="account-avatar-choices" onClick={()=>setAvatarsOpen(value=>!value)}>更换头像 <span>{avatarsOpen?'收起':'展开'}</span></button>
            {avatarsOpen?<section id="account-avatar-choices" aria-label="可选头像">
              <div className="account-avatar-heading"><span>{choices.length?`${choices.length} 个头像`:'暂无可选头像'}</span><button type="button" aria-pressed={avatar===null} disabled={busy} onClick={()=>setAvatar(null)}>使用默认头像</button></div>
              {!choices.length&&!busy?<button type="button" onClick={()=>void run(async()=>{const current=generation.current;const result=await getAvatarChoices();if(current===generation.current)setChoices(result.avatars);})}>重新加载头像</button>:null}
              <div className="account-avatar-grid" tabIndex={0} aria-label="头像列表">{choices.map((choice,index)=><button type="button" key={choice.id} aria-label={`头像${index+1}`} aria-pressed={avatar===choice.url} disabled={busy} onClick={()=>setAvatar(choice.url)}><img src={choice.url} alt="" width="48" height="48" loading="lazy" onError={event=>{event.currentTarget.hidden=true;event.currentTarget.nextElementSibling?.removeAttribute('hidden');}}/><span hidden>图片暂不可用</span></button>)}</div>
            </section>:null}
          </div>
          <p className="account-note">仅在鸦钟夜话使用。已开始的对局回大厅后生效。</p>
        </form>:null}
        {account.rooms.length?<details className="account-room-list"><summary>我的房间</summary>{account.rooms.map(room=><button type="button" key={room.code+room.participantId} disabled={busy} onClick={()=>resume(room)}>继续 {room.code} · {room.nickname}</button>)}</details>:null}

      </>}
      {tools?<div className="account-room-tools">{tools}</div>:null}</div>
      <footer className="account-dialog__footer">
        {account?.signedIn&&account.profile?<><div className="account-profile-actions"><button type="submit" form="game-profile-form" disabled={busy||!nickname.trim()}>保存资料</button><button type="button" disabled={busy} onClick={()=>save(true)}>恢复默认资料</button></div><div className="account-security"><a href="/_fribench/auth/manage?return_to=%2F">账号安全</a><button type="button" disabled={busy} onClick={logout}>退出登录</button></div></>:null}
        <p role="status" data-account-status/>{!account&&error?<button type="button" onClick={show}>重新识别账号</button>:null}{busy?<p role="status">正在处理…</p>:null}{notice?<p role="status">{notice}</p>:null}{error?<p role="alert">{error}</p>:null}
      </footer>
    </section></div>:null}</>;
}
