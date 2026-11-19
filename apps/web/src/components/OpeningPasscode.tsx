import { Button, FeedbackButton } from '@ravens/ui';
import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { getRoomCreateAccess, getSavedRoomPasscode, revealSavedRoomPasscode, verifyRoomCreatePasscode } from '../api.js';
import { RoomSheet } from './RoomPage.js';
import '../styles/opening-passcode.css';

type Access = Awaited<ReturnType<typeof getRoomCreateAccess>>;
function PasscodeForm({ id, onVerified, onBusy }: { id:string; onVerified:(access:Access,notice?:string)=>void; onBusy:(busy:boolean)=>void }) {
  const [passcode,setPasscode]=useState(''),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null), generation=useRef(0), flight=useRef(false);
  useLayoutEffect(()=>{
    const invalidate=()=>{generation.current++;flight.current=false;setBusy(false);onBusy(false);setPasscode('');};
    const onHidden=()=>{if(document.hidden)invalidate();};
    window.addEventListener('fribench:account-change',invalidate);
    document.addEventListener('visibilitychange',onHidden);
    return()=>{generation.current++;window.removeEventListener('fribench:account-change',invalidate);document.removeEventListener('visibilitychange',onHidden);};
  },[]);
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(flight.current)return;
    if(!passcode.trim()){setProblem('请输入开房口令');input.current?.focus();return;}
    const request=++generation.current;
    flight.current=true;setBusy(true);onBusy(true);setProblem('');
    try {
      const verified=await verifyRoomCreatePasscode(passcode);
      const access=await getRoomCreateAccess();
      if(request!==generation.current)return;
      if(access.status==='PASSCODE_REQUIRED'){setProblem('浏览器未保存开房资格，请允许本站保存数据后重试');return;}
      let notice:string|undefined;
      if(verified.saved&&access.via==='PASSCODE') {
        const saved=await getSavedRoomPasscode().catch(()=>undefined);
        if(!saved||saved.status==='MISSING')notice='开房资格已保存，本浏览器暂时无法查看口令原文。';
      }
      if(request===generation.current){setPasscode('');onVerified(access,notice);}
    } catch (error) {
      if(request===generation.current)setProblem(error instanceof Error?error.message:'暂时无法验证，请重试');
    } finally {
      if(request===generation.current){flight.current=false;setBusy(false);onBusy(false);}
    }
  }
  return <form id={id} className="opening-passcode" onSubmit={submit}>
    <label htmlFor={`${id}-input`}>开房口令</label>
    <div className="opening-passcode__input"><input ref={input} id={`${id}-input`} value={passcode} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false}
      aria-invalid={Boolean(problem)} aria-describedby={`${id}-feedback`} disabled={busy} placeholder="输入或粘贴收到的口令" maxLength={128} onChange={event=>{setPasscode(event.target.value);setProblem('');}}/>
      {navigator.clipboard?.readText&&<FeedbackButton type="button" disabled={busy} onClick={async()=>{
        const request=generation.current;
        try{const text=await navigator.clipboard.readText();if(request===generation.current){setPasscode(text.trim().slice(0,128));setProblem('');}}
        catch{if(request===generation.current){setProblem('可在输入框内长按粘贴');input.current?.focus();}}
      }}>粘贴</FeedbackButton>}</div>
    <p id={`${id}-feedback`} role={problem?'alert':undefined}>{problem||'验证后，此浏览器会记住开房资格。'}</p>
  </form>;
}

export function OpeningPasscode({ onClose,onVerified }: {onClose:()=>void;onVerified:(access:Access,notice?:string)=>void}) {
  const id=useId(),[busy,setBusy]=useState(false);
  return <RoomSheet title="开房口令" onClose={onClose} handoff className="opening-passcode-host" actions={<Button form={id} type="submit" disabled={busy}>{busy?'正在验证…':'验证并继续'}</Button>}>
    <PasscodeForm id={id} onVerified={onVerified} onBusy={setBusy}/>
  </RoomSheet>;
}

export function SavedOpeningPasscode() {
  const id=useId(),input=useRef<HTMLInputElement>(null),action=useRef<HTMLButtonElement>(null),generation=useRef(0);
  const [status,setStatus]=useState<'MISSING'|'CURRENT'|'ROTATED'>(),[value,setValue]=useState(''),[message,setMessage]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false);
  function refresh() {
    const request=++generation.current;
    void getRoomCreateAccess().then(access=>access.via==='PASSCODE'?getSavedRoomPasscode():undefined).then(result=>{
      if(request===generation.current&&!document.hidden)setStatus(result?.status);
    }).catch(()=>{if(request===generation.current)setStatus(undefined);});
  }
  useLayoutEffect(()=>{
    function clear(){generation.current++;if(input.current)input.current.value='';setValue('');setStatus(undefined);setMessage('');setEditing(false);setBusy(false);}
    function visibility(){if(document.hidden)clear();else refresh();}
    refresh();
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('fribench:account-change',clear);
    return()=>{generation.current++;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('fribench:account-change',clear);};
  },[]);
  if(!status)return null;
  if(editing)return <section className="saved-opening-passcode" aria-label="补存口令">
    <PasscodeForm id={id} onBusy={setBusy} onVerified={(_access,notice)=>{setBusy(false);setEditing(false);setMessage(notice??'已保存口令');refresh();requestAnimationFrame(()=>action.current?.focus());}}/>
    <div><Button form={id} type="submit" disabled={busy}>保存口令</Button><FeedbackButton type="button" onClick={()=>{setEditing(false);setBusy(false);requestAnimationFrame(()=>action.current?.focus());}}>返回</FeedbackButton></div>
  </section>;
  return <section className="saved-opening-passcode" aria-label="游客开房资格"><strong>{status==='MISSING'?'已保存开房资格':'开房口令'}</strong>
    <div>{status!=='MISSING'&&!value&&<FeedbackButton ref={action} type="button" disabled={busy} onClick={async()=>{
      const request=++generation.current;setBusy(true);setMessage('');
      try{const revealed=await revealSavedRoomPasscode();if(request===generation.current&&!document.hidden){setValue(revealed.passcode);setStatus(revealed.status);}}
      catch{if(request===generation.current)setMessage('暂时无法查看，请重试');}
      finally{if(request===generation.current)setBusy(false);}
    }}>查看口令</FeedbackButton>}
    {value&&<><input ref={input} aria-label="已保存的开房口令" value={value} readOnly/><FeedbackButton type="button" onClick={async()=>{
      const request=generation.current;
      try{await navigator.clipboard.writeText(value);if(request===generation.current)setMessage('口令已复制');}
      catch{if(request===generation.current){input.current?.focus();input.current?.select();setMessage('口令已选中，可手动复制');}}
    }}>复制</FeedbackButton></>}
    {(status==='MISSING'||status==='ROTATED')&&<FeedbackButton type="button" ref={status==='MISSING'?action:undefined} onClick={()=>{setValue('');setEditing(true);setMessage('');}}>{status==='MISSING'?'补存口令':'更新口令'}</FeedbackButton>}</div>
    {status==='ROTATED'&&<p>旧口令，无法给新浏览器授权</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
