/** Track the visible area, including iOS/WeChat keyboard panning, without scrolling the document. */
export function installMobileViewport() {
  const root=document.documentElement;
  let frame=0,baseline=window.innerHeight,orientation=window.innerWidth>window.innerHeight;
  const editable=()=>document.activeElement instanceof HTMLElement&&document.activeElement.matches('input,textarea,[contenteditable="true"]');
  function update(){
    frame=0;
    const v=window.visualViewport,height=v?.height??window.innerHeight,top=v?.offsetTop??0;
    if(!editable()) {const next=window.innerWidth>window.innerHeight;if(next!==orientation)baseline=window.innerHeight;orientation=next;baseline=Math.max(height,window.innerHeight);}
    const keyboard=editable()&&baseline-height>120;
    root.style.setProperty('--viewport-height',`${height}px`);
    root.style.setProperty('--viewport-top',`${top}px`);
    root.dataset.keyboard=keyboard?'open':'closed';
    const input=document.activeElement;
    if(keyboard&&input instanceof HTMLElement){
      const container=input.closest<HTMLElement>('.profile-fields,.room-sheet__body,.room-page__content,.account-dialog__body');
      if(container){const a=input.getBoundingClientRect(),b=container.getBoundingClientRect();if(a.bottom>b.bottom-12)container.scrollTop+=a.bottom-b.bottom+12;else if(a.top<b.top+12)container.scrollTop+=a.top-b.top-12;}
    }
    if(window.scrollY!==0)window.scrollTo(0,0);
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const events=['resize','orientationchange','scroll'] as const;
  for(const e of events)window.addEventListener(e,schedule);
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);update();
  return()=>{cancelAnimationFrame(frame);for(const e of events)window.removeEventListener(e,schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);document.removeEventListener('focusin',schedule);document.removeEventListener('focusout',schedule);delete root.dataset.keyboard;root.style.removeProperty('--viewport-top');};
}
