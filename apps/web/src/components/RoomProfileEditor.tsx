import {FeedbackButton} from '@ravens/ui';
import {avatarSelectionUrl} from '@ravens/contracts';
import {useEffect,useId,useRef,useState} from 'react';
import {ApiError,getRoom,updateGuestProfile,type RoomView} from '../api.js';
import {usePlayerProfile} from '../use-player-profile.js';
import {PlayerProfileEditor} from './PlayerProfileEditor.js';
import './room-tools-refine.css';

export function RoomProfileEditor({code,onSaved}:{code:string;onSaved?:()=>void}){
 const[room,setRoom]=useState<RoomView>(),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const generation=useRef(0);
 async function refresh(){const current=++generation.current;setLoading(true);setError('');try{const value=await getRoom(code);if(current===generation.current)setRoom(value);}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'玩家资料加载失败');}finally{if(current===generation.current)setLoading(false);}}
 useEffect(()=>{setRoom(undefined);void refresh();return()=>{generation.current++;};},[code]);
 const mine=room?.participants.find(p=>p.id===room.self?.participantId&&p.mode==='PLAYER');
 if(!mine)return <div className="room-profile-loading">{loading?<p role="status">正在读取本席资料…</p>:<><p role="alert">{error||'无法读取当前座位，请重新连接房间。'}</p><FeedbackButton type="button" onClick={()=>void refresh()}>重新加载</FeedbackButton></>}</div>;
 const occupied=room!.participants.filter(p=>p.mode==='PLAYER'&&!p.left&&p.id!==mine.id&&p.avatar).map(p=>p.avatar!);
 return <RoomProfileForm key={`${code}:${mine.id}`} code={code} nickname={mine.nickname} avatar={mine.avatar??null} occupied={occupied} loading={loading} refresh={()=>void refresh()} error={error} {...(onSaved?{onSaved}:{})}/>;
}
function RoomProfileForm({code,nickname,avatar,occupied,loading,refresh,error:loadError,onSaved}:{code:string;nickname:string;avatar:string|null;occupied:string[];loading:boolean;refresh:()=>void;error:string;onSaved?:()=>void}){
 const formId=useId(),p=usePlayerProfile({nickname,avatar}),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const taken=!!p.draft.avatar&&avatarSelectionUrl(p.draft.avatar)!==(avatar?avatarSelectionUrl(avatar):null)&&occupied.some(other=>avatarSelectionUrl(other)===avatarSelectionUrl(p.draft.avatar!));
 return <form className="room-profile-form" id={formId} onSubmit={async e=>{e.preventDefault();if(busy||taken||loading||loadError||!p.ready||p.saving)return;setBusy(true);setError('');try{if(!p.account?.signedIn){if(!p.draft.avatar)throw new Error('请选择头像');await updateGuestProfile(code,p.draft.nickname.trim(),p.draft.avatar);}await p.save();setNotice('资料已保存');onSaved?.();}catch(e){if(e instanceof ApiError&&e.errorCode==='PROFILE_OWNER_CHANGED')p.reload();if(e instanceof ApiError&&e.errorCode==='AVATAR_TAKEN')refresh();setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}}}><div className="profile-fields"><PlayerProfileEditor value={p.draft} onChange={p.change} occupiedAvatars={occupied} currentAvatar={avatar} onOpenAvatars={refresh} availabilityLoading={loading} guest={p.account?.signedIn===false} defaultAvatar={p.account?.profile?.defaultAvatar} disabled={!p.ready||p.saving||busy}/></div><footer className="profile-actions"><FeedbackButton className="profile-save" type="submit" disabled={!p.ready||p.saving||busy||loading||taken||!!loadError}>保存我的资料</FeedbackButton>{notice||p.notice?<p role="status">{notice||p.notice}</p>:null}{error||loadError||p.error?<p role="alert">{error||loadError||p.error}</p>:null}{loadError?<FeedbackButton type="button" onClick={refresh}>重新加载可用头像</FeedbackButton>:null}</footer></form>;
}
