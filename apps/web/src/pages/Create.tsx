import {FeedbackButton} from '@ravens/ui';
import {ParticipationAudioChoice} from '../components/ParticipationAudioChoice.js';
import {Button} from '@ravens/ui';
import {useState,type FormEvent} from 'react';
import {readCreationIntent,type RoomPlayMode} from '../api.js';
import {usePlayerProfile,type PlayerSelection} from '../use-player-profile.js';
import {PlayerProfileEditor} from '../components/PlayerProfileEditor.js';
import {RoomPageShell,OperationStatus} from '../components/RoomPage.js';
import '../styles/six-player-rules.css';
export function Create({onBack,onSubmit,busy,error}:{onBack:()=>void;onSubmit:(name:string,count:number,mode:RoomPlayMode,url?:string,profile?:PlayerSelection,sixPlayerEvilCooperation?:boolean)=>void;busy:boolean;error?:string}){
 const saved=readCreationIntent(),profile=usePlayerProfile(saved?{nickname:saved.organizerName,avatar:saved.avatar??null,...(saved.expectedProfileRevision!==undefined?{expectedProfileRevision:saved.expectedProfileRevision}:{})}:undefined);
 const[count,setCount]=useState(saved?.playerCount??8),[invalid,setInvalid]=useState(''),[cooperation,setCooperation]=useState(saved?.sixPlayerEvilCooperation===true);
 async function submit(e:FormEvent){e.preventDefault();try{const selected=saved?profile.draft:await profile.save();setInvalid('');onSubmit(selected.nickname,count,saved?.playMode??'IN_PERSON',saved?.voiceRoomUrl,saved&&!saved.creationVersion?undefined:selected,count===6&&cooperation);}catch(e){setInvalid(e instanceof Error?e.message:'无法创建');}}
 return <RoomPageShell className="room-scene" title="创建房间" onBack={onBack} actions={<><OperationStatus error={invalid||profile.error||error} notice={profile.notice}/><Button form="create-room" type="submit" disabled={busy||profile.saving||!profile.ready}>{busy?'正在创建 / 加入…':saved?'继续创建房间':'创建房间'}</Button></>}><form id="create-room" className="room-form" onSubmit={submit}><PlayerProfileEditor value={profile.draft} onChange={profile.change} guest={profile.account?.signedIn===false} defaultAvatar={profile.account?.profile?.defaultAvatar} disabled={busy||profile.saving||!!saved}/>{profile.error?<FeedbackButton type="button" onClick={profile.reload}>重新载入资料</FeedbackButton>:null}<fieldset disabled={busy||!!saved}><legend>玩家人数</legend><div className="count-picker">{Array.from({length:8},(_,i)=>i+5).map(n=><FeedbackButton type="button" key={n} aria-pressed={count===n} onClick={()=>{setCount(n);if(n!==6)setCooperation(false);}}>{n}人</FeedbackButton>)}</div></fieldset>{count===6?<label className="six-player-rule"><input type="checkbox" aria-label="6人局邪恶协作" checked={cooperation} disabled={busy||!!saved} onChange={event=>setCooperation(event.target.checked)}/><span><strong>6人局邪恶协作 <small>自定义增强</small></strong><small>首夜相认 · 3个伪装 · 夜杀不变</small></span></label>:null}<ParticipationAudioChoice/>{saved?<p className="operation-status">继续确认原来的创建结果。</p>:null}</form></RoomPageShell>;
}
