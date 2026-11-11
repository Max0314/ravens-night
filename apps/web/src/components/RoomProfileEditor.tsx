import {useId,useState} from 'react';
import {ApiError,updateGuestProfile} from '../api.js';
import {usePlayerProfile} from '../use-player-profile.js';
import {PlayerProfileEditor} from './PlayerProfileEditor.js';
export function RoomProfileEditor({code,onSaved}:{code:string;onSaved?:()=>void}){
 const formId=useId();
 const p=usePlayerProfile(),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <form className="room-profile-form" id={formId} onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const selected=await p.save();if(!p.account?.signedIn&&selected.avatar){await updateGuestProfile(code,selected.nickname,selected.avatar);setNotice('资料已保存');}else setNotice('本游戏资料已保存');onSaved?.();}catch(e){if(e instanceof ApiError&&e.errorCode==='PROFILE_OWNER_CHANGED')p.reload();setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}}><div className="profile-fields"><PlayerProfileEditor value={p.draft} onChange={p.change} guest={p.account?.signedIn===false} defaultAvatar={p.account?.profile?.defaultAvatar} disabled={!p.ready||p.saving||busy}/></div><footer className="profile-actions"><button className="profile-save" type="submit" disabled={!p.ready||p.saving||busy}>保存我的资料</button>{notice||p.notice?<p role="status">{notice||p.notice}</p>:null}{error||p.error?<p role="alert">{error||p.error}</p>:null}</footer></form>;
}
