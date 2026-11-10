/** Native text editing stays usable; game surfaces own their touch gestures. */
export function installTouchPolicy(root:Document=document){
  const field=(target:EventTarget|null)=>target instanceof Element&&Boolean(target.closest('input,textarea,[contenteditable="true"]'));
  const protectText=(event:Event)=>{if(!field(event.target)&&!(event.type==='copy'&&field(root.activeElement)))event.preventDefault();};
  const prevent=(event:Event)=>event.preventDefault();
  const touch=(event:TouchEvent)=>{if(event.touches.length>1)event.preventDefault();};
  const wheel=(event:WheelEvent)=>{if(event.ctrlKey)event.preventDefault();};
  for(const type of ['contextmenu','selectstart','dragstart','copy','dblclick'])root.addEventListener(type,protectText);
  for(const type of ['gesturestart','gesturechange','gestureend'])root.addEventListener(type,prevent,{passive:false});
  root.addEventListener('touchstart',touch,{passive:false});root.addEventListener('touchmove',touch,{passive:false});root.addEventListener('wheel',wheel,{passive:false});
  return()=>{
    for(const type of ['contextmenu','selectstart','dragstart','copy','dblclick'])root.removeEventListener(type,protectText);
    for(const type of ['gesturestart','gesturechange','gestureend'])root.removeEventListener(type,prevent);
    root.removeEventListener('touchstart',touch);root.removeEventListener('touchmove',touch);root.removeEventListener('wheel',wheel);
  };
}
