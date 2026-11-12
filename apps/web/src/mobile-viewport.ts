/** Track the visible area, including iOS/WeChat keyboard panning, without scrolling the document. */
export function installMobileViewport() {
  const root=document.documentElement;
  const physicalDirection=()=>{const type=window.screen.orientation?.type,angle=(window as Window&{orientation?:number}).orientation;return type?type.startsWith('landscape'):typeof angle==='number'?Math.abs(angle)%180===90:undefined;};
  const direction=()=>physicalDirection()??window.innerWidth>window.innerHeight;
  let frame=0,baseline=window.innerHeight,orientation=direction(),wasKeyboard=false,rotating=false;
  let rotationFrom=orientation;
  const layoutHeights=new Map<boolean,number>([[orientation,baseline]]);
  let focusedPanel:{element:HTMLElement;scroll:number}|undefined;
  const editable=()=>document.activeElement instanceof HTMLElement&&document.activeElement.matches('input,textarea,[contenteditable="true"]');
  function update(){
    frame=0;
    const v=window.visualViewport,height=v?.height??window.innerHeight,top=v?.offsetTop??0;
    const next=direction();
    if(rotating){
      // Some WebViews report the physical orientation before their layout dimensions settle.
      const physical=physicalDirection();
      if(physical!==undefined&&next!==(window.innerWidth>window.innerHeight)||physical===undefined&&next===rotationFrom)baseline=height;
      else{orientation=next;baseline=layoutHeights.get(next)??Math.max(height,window.innerHeight);rotating=false;}
    }else if(!editable()&&next!==orientation){orientation=next;baseline=layoutHeights.get(next)??Math.max(height,window.innerHeight);}
    if(!rotating){baseline=Math.max(baseline,height,window.innerHeight);layoutHeights.set(orientation,baseline);}
    const keyboard=!rotating&&editable()&&baseline-height>120;
    if(keyboard&&!wasKeyboard){const panel=document.activeElement instanceof HTMLElement?document.activeElement.closest<HTMLElement>('.profile-fields,.room-sheet__body,.room-page__content,.account-dialog__body,.form-panel'):null;if(panel)focusedPanel={element:panel,scroll:panel.scrollTop};}
    if(!keyboard&&wasKeyboard){if(focusedPanel?.element.isConnected)focusedPanel.element.scrollTop=focusedPanel.scroll;focusedPanel=undefined;}
    root.style.setProperty('--viewport-height',`${height}px`);
    root.style.setProperty('--viewport-top',`${top}px`);
    root.dataset.keyboard=keyboard?'open':'closed';
    if(keyboard!==wasKeyboard)window.dispatchEvent(new CustomEvent('ravens:keyboard',{detail:{open:keyboard}}));
    wasKeyboard=keyboard;
    const input=document.activeElement;
    if(keyboard&&input instanceof HTMLElement){
      const container=input.closest<HTMLElement>('.profile-fields,.room-sheet__body,.room-page__content,.account-dialog__body,.form-panel');
      if(container){const a=input.getBoundingClientRect(),b=container.getBoundingClientRect();if(a.bottom>b.bottom-12)container.scrollTop+=a.bottom-b.bottom+12;else if(a.top<b.top+12)container.scrollTop+=a.top-b.top-12;}
    }
    if(window.scrollY!==0)window.scrollTo(0,0);
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const rotate=()=>{rotationFrom=orientation;rotating=true;baseline=0;schedule();};
  const events=['resize','scroll'] as const;
  for(const e of events)window.addEventListener(e,schedule);
  window.addEventListener('orientationchange',rotate);
  window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);update();
  return()=>{cancelAnimationFrame(frame);for(const e of events)window.removeEventListener(e,schedule);window.removeEventListener('orientationchange',rotate);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);document.removeEventListener('focusin',schedule);document.removeEventListener('focusout',schedule);delete root.dataset.keyboard;root.style.removeProperty('--viewport-top');root.style.removeProperty('--viewport-height');};
}
