import {useBackLayer} from '../use-back-layer.js';
import {beginnerRoles} from '@ravens/content';
import {RolePortrait,RolePortraitFrame} from '@ravens/ui';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {flushSync} from 'react-dom';
import type {PrivateView} from '../api.js';
import {rolePlayGuides,roleTypeGuidance,roleTypeNames,tutorialSteps} from '../guide-content.js';
import {roleArt} from '../role-art.js';
import {createBookAudio} from './book-audio.js';
import {GlobalAudioButton} from './GlobalAudioButton.js';
import {effectsAudioEnabled} from './experience-audio.js';
import {dragTurnGrip,PageTurnController,shouldCompleteTurn,turnProgress,type TurnCorner,type TurnDirection,type TurnState} from './page-turn.js';
import {decodePageImages,PageTextureCache} from './page-textures.js';
import {PageTurnLayer} from './PageTurnLayer.js';
import {useInteractionFeedback} from '../interaction-feedback.js';
import '../styles/guide-navigation.css';
import '../styles/role-frames.css';

export type GuideMode='tutorial'|'roles'|'mine';
const roleTypes=['TOWNSFOLK','OUTSIDER','MINION','DEMON'] as const;
type RoleType=typeof roleTypes[number];
export interface GuidePageState {mode:GuideMode;step:number;category:RoleType;roleId?:string|undefined}
export function guidePageKey(page:GuidePageState){return page.mode==='tutorial'?`tutorial:${page.step}`:page.mode==='mine'?'mine':`roles:${page.category}:${page.roleId?`detail:${page.roleId}`:'grid'}`;}
export function adjacentGuidePage(page:GuidePageState,direction:TurnDirection,tutorialOnly=false):GuidePageState|undefined{
  if(page.mode==='tutorial'){
    if(direction<0)return page.step>0?{...page,step:page.step-1}:undefined;
    return page.step<tutorialSteps.length-1?{...page,step:page.step+1}:tutorialOnly?undefined:{...page,mode:'roles',category:'TOWNSFOLK',roleId:undefined};
  }
  if(page.mode==='roles'&&!page.roleId){if(direction<0&&page.category==='TOWNSFOLK')return {...page,mode:'tutorial',step:tutorialSteps.length-1,roleId:undefined};const category=roleTypes[roleTypes.indexOf(page.category)+direction];return category?{...page,category}:undefined;}
  return undefined;
}
export interface StartupTutorialOptions {onDone:()=>void;busy?:boolean;error?:string;completeCount?:number;total?:number;hideBack?:boolean}
type Memory={scroll:number;advice:boolean};
export function GuideOverlay({mode,ownRole,initialRoleId,onClose,startup,suspended=false}:{suspended?:boolean;startup?:StartupTutorialOptions;mode:GuideMode;ownRole?:PrivateView['role'];initialRoleId?:string;onClose:()=>void}){
  const initial={mode:startup?'tutorial':mode,step:0,category:beginnerRoles.find(role=>role.id===initialRoleId)?.type??'TOWNSFOLK',roleId:startup?undefined:initialRoleId} as GuidePageState;
  const[page,setPage]=useState<GuidePageState>(initial),[transition,setTransition]=useState<TurnState<GuidePageState>>(),[neighbor,setNeighbor]=useState(()=>adjacentGuidePage(initial,1,!!startup));
  const[textureEpoch,setTextureEpoch]=useState(0);
  const lastSuspended=useRef(suspended),suspendedRef=useRef(suspended);suspendedRef.current=suspended;
  const pageRef=useRef(page);pageRef.current=page;const closeRef=useRef(onClose);closeRef.current=onClose;
  const dialogRef=useRef<HTMLElement>(null),bookRef=useRef<HTMLDivElement>(null),surfaceRef=useRef<HTMLDivElement>(null),previewRef=useRef<HTMLDivElement>(null);
  const memory=useRef(new Map<string,Memory>()),bookmarks=useRef<Partial<Record<GuideMode,GuidePageState>>>({[mode]:initial}),origin=useRef({roleId:initialRoleId,category:initial.category,scroll:0});
  const audio=useRef<ReturnType<typeof createBookAudio>|null>(null),cache=useRef(new PageTextureCache()),directionRef=useRef<TurnDirection>(1),slow=useRef(false),queued=useRef<{target:GuidePageState;direction:TurnDirection}|undefined>(undefined),closing=useRef(false),texturesSuspended=useRef(false);
  const swipe=useRef<{id:number;x:number;y:number;lastX:number;lastAt:number;velocity:number;axis:'pending'|'horizontal'|'vertical';corner:TurnCorner;direction?:TurnDirection;target?:GuidePageState|undefined;key:string}|undefined>(undefined),suppressClickUntil=useRef(0),scrollTimer=useRef(0);
  const feedback=useInteractionFeedback();
  const pageKey=guidePageKey(page);
  const currentMemory=()=>memory.current.get(guidePageKey(pageRef.current))??{scroll:0,advice:false};
  const scrollElement=()=>surfaceRef.current?.querySelector<HTMLElement>('[data-page-scroll]');
  function remember(){const scroll=scrollElement();memory.current.set(guidePageKey(pageRef.current),{scroll:scroll?.scrollTop??0,advice:!!surfaceRef.current?.querySelector<HTMLDetailsElement>('details')?.open});bookmarks.current[pageRef.current.mode]={...pageRef.current};}
  const captureKey=(p:GuidePageState)=>`${guidePageKey(p)}:${memory.current.get(guidePageKey(p))?.scroll??0}:${memory.current.get(guidePageKey(p))?.advice??false}:${bookRef.current?.clientWidth??0}x${bookRef.current?.clientHeight??0}:v2`;
  const callbacks=useRef<{finish:(target:GuidePageState|undefined)=>void;begin:(state:TurnState<GuidePageState>)=>void}>({finish:()=>{},begin:()=>{}});
  const controllerRef=useRef<PageTurnController<GuidePageState>|undefined>(undefined);
  controllerRef.current??=new PageTurnController({begin:state=>callbacks.current.begin(state),finish:target=>callbacks.current.finish(target),sound:()=>{if(effectsAudioEnabled())audio.current?.turn();}});
  const controller=controllerRef.current;
  callbacks.current.begin=state=>setTransition(state);
  callbacks.current.finish=target=>{
    if(closing.current)return;
    const previous=pageRef.current,next=target??previous;
    const following=adjacentGuidePage(next,directionRef.current,!!startup)??(target&&guidePageKey(previous)!==guidePageKey(next)?previous:undefined);
    // Promote the keyed incoming sheet and retain a useful return sheet in one commit.
    flushSync(()=>{if(target){pageRef.current=target;setPage(target);bookmarks.current[target.mode]=target;}setNeighbor(following);setTransition(undefined);});
    cache.current.invalidate();setTextureEpoch(value=>value+1);
    const pending=queued.current;queued.current=undefined;
    if(pending)queueMicrotask(()=>navigate(pending.target,pending.direction));
  };
  function navigate(target:GuidePageState,direction:TurnDirection,interactive=false,corner:TurnCorner='bottom'){
    if(suspendedRef.current||startup&&(startup.busy||target.mode!=='tutorial'))return;
    if(guidePageKey(target)===guidePageKey(pageRef.current))return;
    if(controller.state){if(!interactive&&!controller.state.completing){swipe.current=undefined;queued.current=undefined;controller.cancel();}else{if(!interactive)queued.current={target,direction};return;}}
    remember();directionRef.current=direction;
    const width=bookRef.current?.clientWidth??0;
    // Detached/SSR surfaces have no animation clock, but navigation must remain available.
    if(!width&&!interactive){if(effectsAudioEnabled())audio.current?.turn();const previous=pageRef.current;pageRef.current=target;setPage(target);bookmarks.current[target.mode]=target;cache.current.invalidate();setNeighbor(adjacentGuidePage(target,direction,!!startup)??previous);return;}
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const renderer=reduced?'reduced':!slow.current&&pageRef.current.mode!=='mine'&&target.mode!=='mine'&&cache.current.get(captureKey(pageRef.current))?'canvas':'dom';
    if(controller.begin(pageRef.current,target,direction,renderer,corner)&&!interactive)controller.settle(true,true);
  }
  // Unlock on the original activation stack, before navigation or texture promises.
  function prepareSound(){if(!suspendedRef.current&&effectsAudioEnabled())void audio.current?.prepare();}
  function finishStartup(){if(!startup||startup.busy)return;swipe.current=undefined;queued.current=undefined;controller.cancel();startup.onDone();}
  function closeBook(){closing.current=true;queued.current=undefined;controller.cancel();cache.current.dispose();audio.current?.silence();feedback.close();closeRef.current();}
  function closeDetail(){const current=pageRef.current;if(current.mode!=='roles'||!current.roleId)return;memory.current.set(`roles:${origin.current.category}:grid`,{scroll:origin.current.scroll,advice:false});navigate({...current,category:origin.current.category,roleId:undefined},-1);}
  const detailCloseRef=useRef(closeDetail);detailCloseRef.current=closeDetail;
  const bookCloseRef=useRef(closeBook);bookCloseRef.current=closeBook;
  useBackLayer(!startup&&!suspended,()=>bookCloseRef.current());
  useBackLayer(!suspended&&page.mode==='roles'&&!!page.roleId,()=>detailCloseRef.current());
  function selectRole(roleId:string){remember();origin.current={roleId,category:pageRef.current.category,scroll:currentMemory().scroll};navigate({...pageRef.current,roleId},1);}
  function categoryTo(category:RoleType,direction?:TurnDirection){if(category!==pageRef.current.category)navigate({...pageRef.current,category,roleId:undefined},direction??(roleTypes.indexOf(category)>roleTypes.indexOf(pageRef.current.category)?1:-1));}
  function modeTo(next:GuideMode){const current=pageRef.current;if(next===current.mode)return;const order:GuideMode[]=ownRole?['mine','tutorial','roles']:['tutorial','roles'];const target=bookmarks.current[next]??{...current,mode:next,roleId:undefined};navigate(target,order.indexOf(next)>order.indexOf(current.mode)?1:-1);}
  function stepTo(direction:TurnDirection){if(startup?.busy)return;if(startup&&direction>0&&pageRef.current.step===tutorialSteps.length-1){finishStartup();return;}const target=adjacentGuidePage(pageRef.current,direction,!!startup);if(target)navigate(target,direction);}
  function detailTo(direction:TurnDirection){const current=pageRef.current,roles=beginnerRoles.filter(role=>role.type===current.category),role=roles[roles.findIndex(role=>role.id===current.roleId)+direction];if(role)navigate({...current,roleId:role.id},direction);}
  const onSlow=useCallback(()=>{slow.current=true;},[]);
  useEffect(()=>{closing.current=false;cache.current=new PageTextureCache();audio.current=createBookAudio();const syncSound=()=>{if(!effectsAudioEnabled())audio.current?.silence();};window.addEventListener('ravens-effects-audio',syncSound);return()=>{closing.current=true;window.removeEventListener('ravens-effects-audio',syncSound);controller.dispose();cache.current.dispose();audio.current?.dispose();window.clearTimeout(scrollTimer.current);};},[controller]);
  useLayoutEffect(()=>{if(suspended)return;const saved=memory.current.get(pageKey),scroller=scrollElement();if(scroller)scroller.scrollTop=saved?.scroll??0;const advice=surfaceRef.current?.querySelector<HTMLDetailsElement>('details');if(advice)advice.open=saved?.advice??false;const detail=surfaceRef.current?.querySelector<HTMLElement>('.role-detail');if(detail)detail.focus({preventScroll:true});else if(origin.current.roleId&&page.mode==='roles')surfaceRef.current?.querySelector<HTMLButtonElement>(`[data-role-id="${origin.current.roleId}"]`)?.focus({preventScroll:true});},[pageKey,suspended]);
  useEffect(()=>{
    if(suspended||transition||texturesSuspended.current||page.mode==='mine')return;const surface=surfaceRef.current,host=bookRef.current;if(!surface||!host||!host.clientWidth||!host.clientHeight)return;
    const key=captureKey(page),instance=cache.current;instance.retain([key]);
    // Only the outgoing bend consumes a texture. The neighbor is warmed on its real DOM nodes.
    void instance.prepare(key,surface,host.clientWidth,host.clientHeight);
  },[pageKey,transition,textureEpoch,suspended]);
  useEffect(()=>{
    const release=()=>{texturesSuspended.current=true;swipe.current=undefined;queued.current=undefined;controller.cancel();cache.current.invalidate();};
    const resume=()=>{if(suspendedRef.current||!texturesSuspended.current)return;texturesSuspended.current=false;setTextureEpoch(value=>value+1);};
    window.addEventListener('ravens:release-book-textures',release);window.addEventListener('ravens:resume-book-textures',resume);
    return()=>{window.removeEventListener('ravens:release-book-textures',release);window.removeEventListener('ravens:resume-book-textures',resume);};
  },[controller]);
  useEffect(()=>{
    const cancel=()=>{swipe.current=undefined;queued.current=undefined;controller.cancel();cache.current.invalidate();setTextureEpoch(value=>value+1);};
    const hidden=()=>{if(document.hidden){cancel();audio.current?.silence();}};
    const keyboard=(event:Event)=>{if((event as CustomEvent<{open:boolean}>).detail?.open)cancel();};
    window.addEventListener('resize',cancel);window.addEventListener('orientationchange',cancel);window.addEventListener('blur',cancel);window.visualViewport?.addEventListener('resize',cancel);
    document.addEventListener('visibilitychange',hidden);window.addEventListener('ravens:keyboard',keyboard);
    return()=>{window.removeEventListener('resize',cancel);window.removeEventListener('orientationchange',cancel);window.removeEventListener('blur',cancel);window.visualViewport?.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('ravens:keyboard',keyboard);};
  },[controller]);
  useEffect(()=>{
    const resumed=lastSuspended.current&&!suspended;lastSuspended.current=suspended;
    texturesSuspended.current=suspended;
    if(suspended){swipe.current=undefined;queued.current=undefined;audio.current?.silence();cache.current.invalidate();window.clearTimeout(scrollTimer.current);queueMicrotask(()=>{if(suspendedRef.current&&!closing.current)controller.cancel();});}
    else if(resumed)setTextureEpoch(value=>value+1);
  },[suspended,controller]);
  useEffect(()=>{
    if(suspended)return;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:undefined;dialogRef.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(startup||document.activeElement instanceof Element&&document.activeElement.closest('.room-sheet'))return;
      if(event.key==='Escape'){if(pageRef.current.mode==='roles'&&pageRef.current.roleId)detailCloseRef.current();else bookCloseRef.current();return;}
      if(event.key!=='Tab'||!dialogRef.current)return;
      const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element=>!element.closest('[hidden],[inert],[aria-hidden="true"]'));
      focusable.push(...document.querySelectorAll<HTMLElement>('.nomination-notice button:not([disabled]),.private-action-notice button:not([disabled])'));
      const first=focusable[0],last=focusable.at(-1);if(!first||!last){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);if(!suspendedRef.current)previousFocus?.focus({preventScroll:true});};
  },[suspended]);
  function startSwipe(event:PointerEvent<HTMLDivElement>){
    if(event.isPrimary===false){swipe.current=undefined;controller.cancel();return;}
    if(suspendedRef.current||startup?.busy||event.button!==0||controller.state||page.mode==='mine'||page.roleId&&page.mode==='roles'||(event.target instanceof Element&&event.target.closest('button:not([data-role-id]),a,input,summary')))return;
    const rect=event.currentTarget.getBoundingClientRect();
    suppressClickUntil.current=0;swipe.current={corner:event.clientY-rect.top<(rect.height||event.currentTarget.clientHeight)/2?'top':'bottom',id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastAt:performance.now(),velocity:0,axis:'pending',key:pageKey};
  }
  function moveSwipe(event:PointerEvent<HTMLDivElement>){
    const gesture=swipe.current;if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,now=performance.now();gesture.velocity=(event.clientX-gesture.lastX)/Math.max(1,now-gesture.lastAt);gesture.lastX=event.clientX;gesture.lastAt=now;
    if(gesture.axis==='pending'&&Math.max(Math.abs(dx),Math.abs(dy))>=10){
      if(Math.abs(dx)>1.3*Math.abs(dy)){gesture.axis='horizontal';gesture.direction=dx<0?1:-1;gesture.target=adjacentGuidePage(pageRef.current,gesture.direction,!!startup);if(gesture.target)navigate(gesture.target,gesture.direction,true,gesture.corner);event.currentTarget.setPointerCapture?.(event.pointerId);}
      else if(Math.abs(dy)>1.3*Math.abs(dx))gesture.axis='vertical';
    }
    if(gesture.axis==='horizontal'){event.preventDefault();if(gesture.target&&gesture.direction)controller.track(turnProgress(dx,event.currentTarget.clientWidth,gesture.direction),dragTurnGrip(dx,dy,event.currentTarget.clientWidth,event.currentTarget.clientHeight,gesture.direction,gesture.corner));else event.currentTarget.style.setProperty('--edge-drag',`${Math.max(-6,Math.min(6,dx*.04))}px`);}
  }
  function endSwipe(event:PointerEvent<HTMLDivElement>,cancelled=false){
    const gesture=swipe.current;if(!gesture||gesture.id!==event.pointerId)return;swipe.current=undefined;
    if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.removeProperty('--edge-drag');if(gesture.axis!=='horizontal')return;suppressClickUntil.current=performance.now()+500;if(!controller.state)return;
    const dx=event.clientX-gesture.x,direction=gesture.direction!,velocity=performance.now()-gesture.lastAt>100?0:gesture.velocity;
    const complete=!cancelled&&!startup?.busy&&gesture.key===guidePageKey(pageRef.current)&&shouldCompleteTurn(controller.state.progress,dx,velocity,direction);if(event.currentTarget.clientWidth)controller.settle(complete);else controller.finishImmediately(complete);
  }
  function onScroll(){if(suspendedRef.current||transition)return;remember();window.clearTimeout(scrollTimer.current);scrollTimer.current=window.setTimeout(()=>{cache.current.invalidate();setTextureEpoch(value=>value+1);},100);}
  const detail=page.mode==='roles'?beginnerRoles.find(role=>role.id===page.roleId):undefined,previewPage=transition?.to??neighbor;
  const pageProps={ownRole,startup,onStep:stepTo,onSelect:selectRole,onDetail:detailTo,onBlank:closeDetail,onScroll,onAdvice:()=>{if(suspendedRef.current)return;remember();cache.current.invalidate();setTextureEpoch(value=>value+1);}};
  return <div hidden={suspended} inert={suspended} aria-hidden={suspended||undefined} className={`${suspended?'guide-suspended':'guide-backdrop'}${startup?` guide-backdrop--startup${startup.hideBack?' guide-backdrop--startup-menu':''}`:''}`} role="presentation" onMouseDown={event=>{if(!startup&&event.target===event.currentTarget){if(detail)closeDetail();else closeBook();}}}>
    <section ref={dialogRef} className="guide-sheet" onPointerDownCapture={prepareSound} onClickCapture={prepareSound} onKeyDownCapture={event=>{if(['Enter',' ','ArrowLeft','ArrowRight','Home','End'].includes(event.key))prepareSound();}} role={startup?'main':'dialog'} aria-modal={startup?undefined:true} aria-label={startup?'开局教学':'游戏帮助'} tabIndex={-1}>
      <header className="guide-sheet__header"><div><span className="guide-sheet__mark">☾</span><strong>{startup?'开局教学':'钟楼手册'}</strong></div><div className="guide-header-actions"><GlobalAudioButton onEnable={()=>{void audio.current?.prepare(true);}}/>{startup?(startup.hideBack?null:<button type="button" onClick={closeBook} aria-label="返回首页">← 返回</button>):<button type="button" onClick={closeBook} aria-label="关闭游戏帮助">关闭手册 ×</button>}</div></header>
      {!startup?<nav className="guide-tabs" aria-label="手册页面">{([...(ownRole?[{id:'mine' as const,label:'我的角色'}]:[]),{id:'tutorial' as const,label:'新手教程'},{id:'roles' as const,label:'角色表'}]).map(tab=><button type="button" key={tab.id} className={page.mode===tab.id?'is-active':''} onClick={()=>modeTo(tab.id)}>{tab.label}</button>)}</nav>:null}
      <div className="guide-page-toolbar" data-guide-toolbar={detail?'detail':page.mode==='roles'?'grid':page.mode}>
        {detail?<nav className="guide-detail-toolbar" aria-label="角色详情导航"><div><strong>{detail.name}</strong><span data-public-role-type={detail.type}>{roleTypeNames[detail.type]}</span></div><button type="button" aria-label={`返回${roleTypeNames[origin.current.category]}角色表`} onClick={closeDetail}><span aria-hidden="true">↶</span> 返回角色表</button></nav>:null}
        {page.mode==='roles'&&!page.roleId?<CategoryTabs category={page.category} onCategory={categoryTo}/>:null}
        {page.mode==='tutorial'?<p className="guide-step-count">{startup?'教学':'规则'} {page.step+1} / {tutorialSteps.length}</p>:null}
        {page.mode==='mine'?<p className="guide-toolbar-title">我的角色</p>:null}
      </div>
      <div className="guide-book" ref={bookRef} data-page-key={pageKey} onPointerDown={startSwipe} onPointerMove={moveSwipe} onPointerUp={event=>endSwipe(event)} onPointerCancel={event=>endSwipe(event,true)} onLostPointerCapture={event=>{if(event.target===event.currentTarget&&swipe.current){swipe.current=undefined;controller.settle(false);}}} onClickCapture={event=>{if(event.detail!==0&&performance.now()<suppressClickUntil.current){event.preventDefault();event.stopPropagation();}}}>
        {[page,...(previewPage&&guidePageKey(previewPage)!==pageKey?[previewPage]:[])].map(sheet=>{
          const key=guidePageKey(sheet),active=key===pageKey,incoming=!active&&!!transition;
          return <div key={key} data-guide-page={key} className={active?'guide-page-surface':incoming?'guide-page-incoming':'guide-page-preload'} ref={active?surfaceRef:previewRef} inert={!active||!!transition} aria-hidden={!active||transition?true:undefined} style={incoming?{clipPath:'polygon(0 0,0 0,0 0)',opacity:0}:undefined}>
            <GuidePage page={sheet} {...(active?pageProps:{ownRole:incoming?ownRole:undefined,startup})} readonly={!active} memory={memory.current.get(key)}/>
          </div>;
        })}
        {transition?<PageTurnLayer controller={controller} incomingRef={previewRef} fromTexture={cache.current.get(captureKey(transition.from))} onSlow={onSlow}/>:null}
      </div>
      {startup?<footer className="guide-startup-footer"><div>{startup.total?<p>{startup.completeCount??0}/{startup.total} 人已完成</p>:null}{startup.busy?<p role="status">正在提交…</p>:null}</div><button type="button" disabled={startup.busy} onClick={finishStartup}>跳过教学</button>{startup.error?<p role="alert" className="form-error">{startup.error}</p>:null}</footer>:null}
    </section>
  </div>;
}

function CategoryTabs({category,onCategory}:{category:RoleType;onCategory:(category:RoleType,direction?:TurnDirection)=>void}){
  return <nav className="role-category-tabs guide-category-toolbar" role="tablist" aria-label="角色分类">{roleTypes.map(type=><button type="button" role="tab" id={`role-tab-${type}`} key={type} data-role-type={type} aria-selected={category===type} aria-controls="role-category-panel" tabIndex={category===type?0:-1} onClick={()=>onCategory(type)} onKeyDown={event=>{let next:RoleType|undefined,direction:TurnDirection|undefined;if(event.key==='ArrowRight'){next=roleTypes[(roleTypes.indexOf(type)+1)%4];direction=1;}if(event.key==='ArrowLeft'){next=roleTypes[(roleTypes.indexOf(type)+3)%4];direction=-1;}if(event.key==='Home')next=roleTypes[0];if(event.key==='End')next=roleTypes.at(-1);if(next){event.preventDefault();onCategory(next,direction);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-role-type="${next}"]`)?.focus({preventScroll:true});}}}>{roleTypeNames[type]}<small>{beginnerRoles.filter(role=>role.type===type).length}</small></button>)}</nav>;
}

type PageProps={startup?:StartupTutorialOptions|undefined;page:GuidePageState;ownRole:PrivateView['role']|undefined;readonly?:boolean;memory?:Memory|undefined;onStep?:(direction:TurnDirection)=>void;onSelect?:(id:string)=>void;onDetail?:(direction:TurnDirection)=>void;onBlank?:()=>void;onScroll?:()=>void;onAdvice?:()=>void};
function GuidePage({page,ownRole,startup,readonly=false,memory,onStep,onSelect,onDetail,onBlank,onScroll,onAdvice}:PageProps){
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{if(readonly){const scroller=root.current?.querySelector<HTMLElement>('[data-page-scroll]');if(scroller)scroller.scrollTop=memory?.scroll??0;}},[readonly,page.mode,page.roleId,page.category,page.step,memory?.scroll]);
  useEffect(()=>{if(root.current)void decodePageImages(root.current);},[page.mode,page.step,page.category,page.roleId]);
  const selected=beginnerRoles.find(role=>role.id===page.roleId),guide=selected?rolePlayGuides[selected.id]:undefined,ownGuide=ownRole?rolePlayGuides[ownRole.roleId]:undefined,roles=beginnerRoles.filter(role=>role.type===page.category),index=roles.findIndex(role=>role.id===page.roleId),step=tutorialSteps[page.step]!;
  return <div ref={root} className="guide-page-content">
    {page.mode==='mine'&&ownRole?<div className="own-role-guide" data-page-scroll onScroll={onScroll}><p className={`role-alignment role-alignment--${ownRole.alignment.toLowerCase()}`}>{ownRole.alignment==='GOOD'?'善良阵营':'邪恶阵营'} · {roleTypeNames[ownRole.type as RoleType]}</p><h1>{ownRole.name}</h1><p className="own-role-guide__ability">{ownRole.summary}</p><div className="guide-callout"><span>游玩建议</span><p>{ownRole.beginnerTip}</p></div>{ownGuide?<><div className="guide-callout"><span>规则细节</span><p>{ownGuide.mechanics}</p></div><div className="guide-callout"><span>实战例子</span><p>{ownGuide.example}</p></div><div className="guide-callout guide-callout--quiet"><span>冒充与反制</span><p>{ownGuide.bluff}</p></div></>:null}<div className="guide-callout guide-callout--quiet"><span>阵营目标</span><p>{roleTypeGuidance[ownRole.type as RoleType]}</p></div></div>:null}
    {page.mode==='tutorial'?<div className="guide-tutorial"><div className="guide-tutorial__body" data-page-scroll onScroll={onScroll}><div className="tutorial-page"><div className="guide-tutorial__symbol" aria-hidden="true">{step.symbol}</div><h1>{step.title}</h1><p>{step.detail}</p>{step.points?<ul className="tutorial__points">{step.points.map(point=><li key={point}>{point}</li>)}</ul>:null}{step.example?<aside className="tutorial__example"><span>{step.example.label}</span><p>{step.example.text}</p></aside>:null}</div></div><div className="guide-tutorial__actions"><button type="button" disabled={page.step===0||startup?.busy} onClick={()=>onStep?.(-1)}>{startup?'上一页':'上一条'}</button><button type="button" disabled={startup?.busy} onClick={()=>onStep?.(1)}>{startup?(startup.busy?'正在提交…':page.step===tutorialSteps.length-1?'完成教学':'下一步'):page.step===tutorialSteps.length-1?'继续看角色表':'下一条'}</button></div></div>:null}
    {page.mode==='roles'?<div className="role-compendium" data-page-scroll onScroll={onScroll} onClick={event=>{if(selected&&event.target===event.currentTarget)onBlank?.();}}>{!selected?<div className="role-browser"><section id={readonly?undefined:'role-category-panel'} role={readonly?undefined:'tabpanel'} aria-labelledby={readonly?undefined:`role-tab-${page.category}`}><p className="role-category-summary">{roleTypeGuidance[page.category]}</p><div className="role-grid">{roles.map(role=>{const art=roleArt(role.id);return <button type="button" data-role-id={readonly?undefined:role.id} key={role.id} aria-label={`查看${role.name}详情`} onClick={()=>onSelect?.(role.id)}><span className="role-index__frame"><RolePortraitFrame frameUrl={art.frameThumbnailUrl} className="role-index__portrait" label="" url={art.thumbnailUrl} loading="eager" position={art.portraitPosition}/></span><span className="role-index__copy"><strong>{role.name}</strong></span></button>;})}</div></section></div>:null}{selected?<article className="role-detail" tabIndex={readonly?undefined:-1} aria-label={`${selected.name}详情`}><RolePortrait className="role-detail__portrait" label={`${selected.name}角色立绘`} url={roleArt(selected.id).portraitUrl} srcSet={roleArt(selected.id).portraitSrcSet} sizes="(max-width: 820px) 90vw, 390px" position="50% 0%"/><div className="role-detail__copy"><h2>能力</h2><p>{selected.summary}</p>{guide?<><h2>规则细节</h2><p>{guide.mechanics}</p></>:null}<details className="role-detail__advice" open={readonly?memory?.advice:undefined} onToggle={readonly?undefined:onAdvice}><summary>游玩建议与示例</summary><p>{selected.beginnerTip}</p>{guide?<><p>{guide.play}</p><h3>实战例子</h3><p>{guide.example}</p><h3>冒充与反制</h3><p>{guide.bluff}</p></>:null}</details></div><footer className="role-detail-nav"><button type="button" disabled={index<=0} onClick={()=>onDetail?.(-1)}>上一位</button><button type="button" disabled={index>=roles.length-1} onClick={()=>onDetail?.(1)}>下一位</button></footer></article>:null}</div>:null}
  </div>;
}
