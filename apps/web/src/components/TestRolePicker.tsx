import {useEffect,useRef,useState} from 'react';
import {beginnerRoles} from '@ravens/content';
import {Button} from '@ravens/ui';
import type {PrivateView} from '../api.js';
import {RoomSheet} from './RoomPage.js';
import {roleArt} from '../role-art.js';
import '../styles/test-role-picker.css';

const categories=[['TOWNSFOLK','镇民'],['OUTSIDER','外来者'],['MINION','爪牙'],['DEMON','恶魔']] as const;
export function TestRolePicker({rehearsal,busy,pending=false,onRetry,onChoose}:{pending?:boolean;onRetry?:(()=>Promise<void>)|undefined;rehearsal:PrivateView['rehearsal'];busy:boolean;onChoose:(roleId:string|null)=>Promise<void>}){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState<string|null>(null),[category,setCategory]=useState<string>('TOWNSFOLK'),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false);
  useEffect(()=>{if(!rehearsal?.canChooseRole){setOpen(false);setError('');}},[rehearsal?.canChooseRole]);
  if(!rehearsal?.eligible||!rehearsal.canChooseRole)return null;
  const chosen=beginnerRoles.find(role=>role.id===rehearsal.selectedRoleId),selected=beginnerRoles.find(role=>role.id===draft);
  function show(){setDraft(rehearsal?.selectedRoleId??null);setCategory(chosen?.type??'TOWNSFOLK');setError('');setOpen(true);}
  async function save(){if(busy||submitting.current||!rehearsal?.canChooseRole||(pending&&!onRetry))return;submitting.current=true;setSaving(true);setError('');try{if(pending)await onRetry?.();else await onChoose(draft);setOpen(false);}catch(e){setError(e instanceof Error?e.message:'身份未保存，请重试');}finally{submitting.current=false;setSaving(false);}}
  return <><button type="button" className="test-role-entry" disabled={busy} onClick={show}><span><small>测试模式 · 单真人与人机</small><strong>我的身份：{chosen?.name??'随机'}</strong></span><span>选择 ›</span></button>{open?<RoomSheet title="选择测试身份" onClose={()=>{if(!saving)setOpen(false);}} actions={<div className="test-role-actions"><Button disabled={busy||saving||(pending&&!onRetry)} onClick={()=>void save()}>{pending?(saving?'正在核对…':'重试待确认操作'):saving?'正在保存…':selected?`使用${selected.name}`:'使用随机身份'}</Button>{pending?<p role="status">上次操作结果待确认，重试将核对原选择。</p>:null}{error?<p role="alert">{error}</p>:null}</div>}><div className="test-role-picker"><p>仅指定你的身份，其余角色自动分配。其他真人加入后恢复随机。</p><button className="test-role-random" type="button" aria-pressed={draft===null} disabled={busy||saving||pending} onClick={()=>setDraft(null)}>随机身份</button><nav role="tablist" aria-label="测试角色分类">{categories.map(([id,name])=><button type="button" role="tab" key={id} aria-selected={category===id} onClick={()=>setCategory(id)}>{name}</button>)}</nav><div className="test-role-grid" role="group" aria-label="选择角色">{beginnerRoles.filter(role=>role.type===category).map(role=><button type="button" key={role.id} disabled={busy||saving||pending} aria-pressed={draft===role.id} onClick={()=>setDraft(role.id)}><img src={roleArt(role.id).thumbnailUrl} alt="" draggable={false}/><span>{role.name}</span></button>)}</div><section className="test-role-summary" aria-live="polite"><strong>{selected?.name??'随机身份'}</strong><p>{selected?.summary??'按当前人数正常分配角色。'}</p>{selected?.id==='drunk'?<small>你将实际成为酒鬼，开局显示一个未在场镇民身份。</small>:null}</section></div></RoomSheet>:null}</>;
}
