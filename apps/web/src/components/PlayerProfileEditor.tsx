import {useState} from 'react';
import {createPortal} from 'react-dom';
import {avatarChoices} from '@ravens/contracts';
import type {PlayerSelection} from '../use-player-profile.js';
import {randomGuestProfile} from '../guest-profile.js';
import {RoomSheet} from './RoomPage.js';
import {Avatar} from './Avatar.js';
export function PlayerProfileEditor({value,onChange,disabled=false,guest=false,defaultAvatar,nameLabel="你的昵称"}:{value:PlayerSelection;onChange:(v:PlayerSelection)=>void;disabled?:boolean;guest?:boolean;defaultAvatar?:string|null|undefined;nameLabel?:string}){
  const[open,setOpen]=useState(false),[chosen,setChosen]=useState<string|null>(value.avatar);

  return <div className="player-profile-editor"><div className="player-profile-row"><button type="button" className="profile-avatar-button" disabled={disabled} aria-label="更换头像" onClick={()=>{setChosen(value.avatar);setOpen(true);}}><Avatar id="profile" name={value.nickname||'我'} url={value.avatar??undefined}/><small>更换头像</small></button><label>{nameLabel}<input aria-label={nameLabel} value={value.nickname} maxLength={24} disabled={disabled} required onChange={e=>onChange({...value,nickname:e.target.value})}/></label></div>{guest?<button type="button" className="profile-random" disabled={disabled} onClick={()=>onChange(randomGuestProfile())}>换一组</button>:null}
    {open?createPortal(<div className="profile-picker-host" data-profile-picker><RoomSheet title="头像选择" onClose={()=>setOpen(false)} actions={<>{!guest?<button type="button" onClick={()=>setChosen(defaultAvatar??null)}>使用默认头像</button>:null}<button type="button" onClick={()=>{onChange({...value,avatar:chosen});setOpen(false);}}>选好了</button></>}><div className="account-avatar-grid" aria-label="头像列表">{avatarChoices.map((choice,i)=><button type="button" key={choice.id} aria-label={`头像${i+1}`} aria-pressed={chosen===choice.url} onClick={()=>setChosen(choice.url)}><img src={choice.url} alt="" width="56" height="56" loading="lazy"/></button>)}</div></RoomSheet></div>,document.body):null}</div>;
}
