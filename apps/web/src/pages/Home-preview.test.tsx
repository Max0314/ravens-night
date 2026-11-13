// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Home} from './Home.js';
vi.mock('../components/AccountPanel.js',()=>({AccountPanel:()=>null}));
vi.mock('../components/HomePortrait.js',()=>({HomePortrait:()=>null}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('title opens the lab only after three fast taps and resets after a long gap',()=>{
 let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
 render(<Home onCreate={()=>{}} onJoin={()=>{}} onTutorial={()=>{}} onRoles={()=>{}}/>);
 const link=screen.getByRole('link',{name:'鸦钟夜话'}),results:boolean[]=[];
 const observe=(event:MouseEvent)=>{results.push(event.defaultPrevented);event.preventDefault();};document.addEventListener('click',observe);
 fireEvent.click(link);now+=100;fireEvent.click(link);now+=600;fireEvent.click(link);now+=100;fireEvent.click(link);now+=100;fireEvent.click(link);
 expect(results).toEqual([true,true,true,true,false]);expect(link.getAttribute('href')).toBe('/?preview=effects');document.removeEventListener('click',observe);
});
