import {beginnerRoles} from '@ravens/content';
import {FeedbackButton,RolePortrait} from '@ravens/ui';
import {useId,useLayoutEffect,useRef,useState} from 'react';
import {rolePlayGuides,roleTypeNames} from '../guide-content.js';
import {roleArt} from '../role-art.js';
import {roleIconUrl} from '../role-icons.js';
import {afterRoleReferenceBack,useBackLayer} from '../use-back-layer.js';
import './role-reference.css';

const groups=(['TOWNSFOLK','OUTSIDER','MINION','DEMON'] as const).map(type=>({
  type,roles:beginnerRoles.filter(role=>role.type===type),
}));

function RoleIcon({id}:{id:string}){
  const [failed,setFailed]=useState(false);
  const url=roleIconUrl(id);
  return <span className="role-reference__icon" aria-hidden="true">{url&&!failed
    ? <img src={url} width="32" height="32" alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>
    : <span className="role-reference__missing-icon"/>}</span>;
}

export function RoleReferenceOverlay({suspended,onClose}:{suspended:boolean;onClose:()=>void}){
  const [category,setCategory]=useState<typeof groups[number]['type']>('TOWNSFOLK');
  const [selectedId,setSelectedId]=useState<string>();
  const selected=beginnerRoles.find(role=>role.id===selectedId);
  const visibleRoles=groups.find(group=>group.type===category)!.roles;
  const id=useId(),titleId=`${id}-title`,detailId=`${id}-detail`;
  const title=useRef<HTMLHeadingElement>(null),detailTitle=useRef<HTMLHeadingElement>(null);
  const list=useRef<HTMLDivElement>(null),detailScroll=useRef<HTMLDivElement>(null);
  const entry=useRef<HTMLButtonElement|null>(null),savedFocus=useRef<HTMLElement|null>(null);
  const listPosition=useRef(0),returning=useRef(false);
  const active=useRef(false),previousSelection=useRef<string|undefined>(undefined);
  const visible=!suspended;
  useBackLayer(visible,onClose,true);
  useBackLayer(visible&&!!selected,returnToList,true);

  function returnToList(){
    returning.current=true;
    setSelectedId(undefined);
  }

  useLayoutEffect(()=>{
    active.current=visible;
    if(!visible)return;
    return ()=>{active.current=false;};
  },[visible]);

  useLayoutEffect(()=>{
    if(!visible)return;
    const selectionChanged=previousSelection.current!==selectedId;
    previousSelection.current=selectedId;
    if(returning.current){
      returning.current=false;
      if(list.current)list.current.scrollTop=listPosition.current;
      const source=entry.current;
      if(source?.isConnected){
        source.focus({preventScroll:true});
      }else title.current?.focus({preventScroll:true});
      return;
    }
    if(!selectionChanged&&savedFocus.current?.isConnected){
      savedFocus.current.focus({preventScroll:true});
    }else if(selected){
      if(selectionChanged&&detailScroll.current)detailScroll.current.scrollTop=0;
      detailTitle.current?.focus({preventScroll:true});
    }else title.current?.focus({preventScroll:true});
  },[visible,selectedId,selected]);

  function select(roleId:string,source:HTMLButtonElement){
    afterRoleReferenceBack(()=>{
      if(!active.current||!source.isConnected||!list.current?.contains(source))return;
      listPosition.current=list.current.scrollTop;
      entry.current=source;
      setSelectedId(current=>current??roleId);
    });
  }

  function switchCategory(type:typeof category){
    if(type===category)return;
    if(list.current)list.current.scrollTop=0;
    setCategory(type);
  }

  const portrait=selected?roleArt(selected.id):undefined;
  const mechanics=selected?rolePlayGuides[selected.id]?.mechanics:undefined;
  return <section className="game-content game-content--reference role-reference"
      hidden={suspended} inert={suspended} aria-labelledby={titleId}
      onFocusCapture={event=>{if(event.target instanceof HTMLElement)savedFocus.current=event.target;}}>
      <header className="role-reference__header">
        <h2 ref={title} id={titleId} tabIndex={-1}>角色表</h2>
        {selected?<FeedbackButton type="button" onClick={returnToList}>返回角色表</FeedbackButton>:null}
      </header>
      <nav aria-label="角色分类" className="role-reference__jumps" hidden={!!selected}>
          {groups.map(({type,roles})=><FeedbackButton type="button" key={type} feedback="select"
            aria-label={roleTypeNames[type]} aria-pressed={category===type} data-public-role-type={type}
            onClick={()=>switchCategory(type)}>
            {roleTypeNames[type]}<small>{roles.length}</small>
          </FeedbackButton>)}
      </nav>
      <div className="role-reference__scroll" data-role-reference-list ref={list} hidden={!!selected} inert={!!selected}>
          <ul aria-label={roleTypeNames[category]}>{visibleRoles.map(role=>{
            const name=`${id}-${role.id}`;
            return <li key={role.id}><FeedbackButton type="button" className="role-reference__row"
              aria-labelledby={name} aria-describedby={`${name}-ability`}
              onClick={event=>select(role.id,event.currentTarget)}>
              <RoleIcon id={role.id}/>
              <span>
                <strong id={name}>{role.name}</strong>
                <span className="role-reference__summary" id={`${name}-ability`}>{role.summary}</span>
              </span>
            </FeedbackButton></li>;
          })}</ul>
      </div>
      {selected&&portrait?<article className="role-reference__scroll role-reference__detail" aria-labelledby={detailId} ref={detailScroll}>
        <div className="role-reference__plate">
          <RolePortrait className="role-reference__portrait" label={`${selected.name}角色立绘`}
            url={portrait.portraitUrl} srcSet={portrait.portraitSrcSet} sizes="(max-width: 700px) 96vw, 680px" position={portrait.portraitPosition}/>
          <h3 id={detailId} ref={detailTitle} tabIndex={-1}>{selected.name}
            <small data-public-role-type={selected.type}>{roleTypeNames[selected.type]}</small>
          </h3>
        </div>
        <div className="role-reference__copy">
          <h4>能力</h4><p>{selected.summary}</p>
          {mechanics?<><h4>规则细节</h4><p>{mechanics}</p></>:null}
        </div>
      </article>:null}
  </section>;
}
