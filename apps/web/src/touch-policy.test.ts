// @vitest-environment jsdom
import {expect,test} from 'vitest';
import {installTouchPolicy} from './touch-policy.js';

test('game surfaces suppress native selection/drag/copy and zoom, while text fields retain native editing',()=>{
  const surface=document.createElement('div'),input=document.createElement('input'),textarea=document.createElement('textarea');document.body.append(surface,input,textarea);
  const dispose=installTouchPolicy();const dispatch=(target:Element,type:string,extra:Record<string,unknown>={})=>{const event=new Event(type,{bubbles:true,cancelable:true});for(const[key,value]of Object.entries(extra))Object.defineProperty(event,key,{value});target.dispatchEvent(event);return event.defaultPrevented;};
  try{
    for(const type of ['contextmenu','selectstart','copy','dragstart','dblclick']){expect(dispatch(surface,type)).toBe(true);expect(dispatch(input,type)).toBe(false);expect(dispatch(textarea,type)).toBe(false);}
    expect(dispatch(surface,'touchstart',{touches:[{},{}]})).toBe(true);expect(dispatch(surface,'touchmove',{touches:[{}]})).toBe(false);
    expect(dispatch(surface,'gesturestart')).toBe(true);expect(dispatch(surface,'wheel',{ctrlKey:true})).toBe(true);expect(dispatch(surface,'wheel',{ctrlKey:false})).toBe(false);
    input.focus();expect(dispatch(document.documentElement,'copy')).toBe(false);
  }finally{dispose();surface.remove();input.remove();textarea.remove();}
  expect(dispatch(document.documentElement,'contextmenu')).toBe(false);
});
