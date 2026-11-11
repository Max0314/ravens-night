import { Button } from "@ravens/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getAccount, readCreationIntent, type RoomPlayMode } from "../api.js";
import { RoomPageShell, OperationStatus } from "../components/RoomPage.js";
const modes:Record<RoomPlayMode,{title:string;detail:string}>={IN_PERSON:{title:"围桌线下",detail:"围坐讨论，手机查看身份"},REMOTE:{title:"纯线上",detail:"各自加入，同步语音讨论"},HYBRID:{title:"线上线下",detail:"现场与远程共同游玩"}};
export function Create({onBack,onSubmit,busy,error}:{onBack:()=>void;onSubmit:(name:string,count:number,mode:RoomPlayMode,url?:string)=>void;busy:boolean;error?:string}){
  const saved=readCreationIntent();
  const [name,setName]=useState(saved?.organizerName??""),[count,setCount]=useState(saved?.playerCount??8),[mode,setMode]=useState<RoomPlayMode>(saved?.playMode??"IN_PERSON"),[url,setUrl]=useState(saved?.voiceRoomUrl??""),[invalid,setInvalid]=useState("");
  const nameEdited=useRef(false);
  useEffect(()=>{let active=true;void getAccount().then(value=>{if(active&&!nameEdited.current&&value.profile)setName(current=>current||value.profile!.nickname);}).catch(()=>{});return()=>{active=false;};},[]);
  function submit(event:FormEvent){event.preventDefault();if(!name.trim()){setInvalid("请填写昵称");document.getElementById("create-name")?.focus();return;}if(mode!=="IN_PERSON"&&url.trim()&&!/^https?:\/\//i.test(url.trim())){setInvalid("语音链接须以 http:// 或 https:// 开头");document.getElementById("create-voice")?.focus();return;}setInvalid("");onSubmit(name.trim(),count,mode,mode!=="IN_PERSON"?url:undefined);}
  return <RoomPageShell title="创建房间" onBack={onBack} actions={<><OperationStatus error={invalid||error}/><Button form="create-room" type="submit" disabled={busy}>{busy?"正在创建 / 加入…":saved?"继续创建房间":"创建房间"}</Button></>}>
    <form id="create-room" className="room-form" onSubmit={submit}><label htmlFor="create-name">你的昵称<input id="create-name" value={name} onChange={e=>{nameEdited.current=true;setName(e.target.value);}} maxLength={24} required disabled={busy||Boolean(saved)}/></label><fieldset disabled={busy||Boolean(saved)}><legend>玩家人数</legend><div className="count-picker">{Array.from({length:8},(_,i)=>i+5).map(n=><button type="button" key={n} aria-pressed={count===n} onClick={()=>setCount(n)}>{n}人</button>)}</div></fieldset><fieldset disabled={busy||Boolean(saved)}><legend>游玩方式</legend><div className="room-mode-picker">{(Object.keys(modes) as RoomPlayMode[]).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}><strong>{modes[value].title}</strong><small>{modes[value].detail}</small></button>)}</div></fieldset>{mode!=="IN_PERSON"?<details><summary>附加语音链接</summary><label>语音 / 视频链接<input id="create-voice" type="url" value={url} disabled={busy||Boolean(saved)} onChange={e=>setUrl(e.target.value)} placeholder="https://"/></label></details>:null}{saved?<p className="operation-status">正在确认原来的创建结果，保留本次设置。</p>:null}</form>
  </RoomPageShell>;
}
