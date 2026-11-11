import {useEffect,useRef,useState} from 'react';
import {ApiError,getAccount,saveGameProfile,type AccountAccess} from './api.js';
import {guestProfileStorageKey,loadGuestProfile,saveGuestProfile,validNickname} from './guest-profile.js';
export interface PlayerSelection {nickname:string;avatar:string|null;expectedProfileRevision?:number}
export function usePlayerProfile(initial?:PlayerSelection){
  const[account,setAccount]=useState<AccountAccess>(),[draft,setDraft]=useState<PlayerSelection>(initial??{nickname:'',avatar:null}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  const dirty=useRef(Boolean(initial)),generation=useRef(0),accountRef=useRef<AccountAccess|undefined>(undefined);
  function apply(value:AccountAccess){accountRef.current=value;setAccount(value);if(dirty.current)return;setDraft(value.signedIn&&value.profile?{nickname:value.profile.nickname,avatar:value.profile.avatar,expectedProfileRevision:value.profile.revision}:loadGuestProfile());}
  async function reload(){const gen=++generation.current;setError('');try{const value=await getAccount();if(typeof value.signedIn!=='boolean'||value.signedIn&&!value.profile)throw new Error('资料识别失败，请重新载入');if(gen===generation.current)apply(value);}catch(e){if(gen===generation.current)setError(e instanceof Error?e.message:'资料加载失败');}}
  useEffect(()=>{void reload();const sync=(external=true)=>{if(accountRef.current?.signedIn!==false)return;if(dirty.current){if(external)setNotice('其他页面已修改资料，当前草稿保留');return;}setDraft(loadGuestProfile());};const localSync=()=>sync(false);const storage=(e:StorageEvent)=>{if(e.key===guestProfileStorageKey)sync();};window.addEventListener('storage',storage);window.addEventListener('ravens:guest-profile',localSync);return()=>{generation.current++;window.removeEventListener('storage',storage);window.removeEventListener('ravens:guest-profile',localSync);};},[]);
  function change(next:PlayerSelection){dirty.current=true;setDraft(next);setError('');setNotice('');}
  async function save():Promise<PlayerSelection>{
    if(!account)throw new Error('请先完成资料加载');if(!validNickname(draft.nickname))throw new Error('昵称请输入1至24个字符');
    const gen=generation.current;setSaving(true);setError('');
    try{
      let result:PlayerSelection;
      if(account.signedIn&&account.profile){
        const p=account.profile,unchanged=draft.nickname.trim()===p.nickname&&draft.avatar===p.avatar;
        const updated=unchanged?p:(await saveGameProfile(draft.nickname.trim()===p.defaultNickname?null:draft.nickname.trim(),draft.avatar===p.defaultAvatar?null:draft.avatar,p.revision)).profile;
        if(gen!==generation.current)throw new Error('账号已切换');accountRef.current={...account,profile:updated};setAccount(accountRef.current);result={nickname:updated.nickname,avatar:updated.avatar,expectedProfileRevision:updated.revision};
      }else{
        if(!draft.avatar)throw new Error('请选择头像');const saved=saveGuestProfile({nickname:draft.nickname,avatar:draft.avatar});result=saved.profile;
        if(!saved.persisted)setNotice('当前浏览器未保存资料，下次打开可能重新生成');
      }
      dirty.current=false;setDraft(result);return result;
    }catch(e){if(e instanceof ApiError&&e.errorCode==='PROFILE_STALE'){await reload();setNotice('其他页面已修改资料，可重新载入或再次保存');}setError(e instanceof Error?e.message:'资料保存失败');throw e;}finally{setSaving(false);}
  }
  function discard(){dirty.current=false;setError('');setNotice('');const a=accountRef.current;if(a)apply(a);}
  function useLatest(){dirty.current=false;void reload();}
  return{account,draft,change,save,error,notice,saving,ready:!!account,reload:useLatest,discard};
}
