// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Home} from './Home.js';
vi.mock('../components/AccountPanel.js',()=>({AccountPanel:()=>null}));
vi.mock('../components/HomePortrait.js',()=>({HomePortrait:()=>null}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('the title toggles debug mode after three quick taps and resets after a longer gap',()=>{
 let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);const toggle=vi.fn();
 render(<Home onCreate={()=>{}} onJoin={()=>{}} onTutorial={()=>{}} onRoles={()=>{}} onToggleDebug={toggle}/>);
 const title=screen.getByRole('button',{name:'鸦钟夜话'});
 fireEvent.click(title);now+=100;fireEvent.click(title);now+=600;fireEvent.click(title);
 expect(toggle).not.toHaveBeenCalled();now+=100;fireEvent.click(title);now+=100;fireEvent.click(title);
 expect(toggle).toHaveBeenCalledTimes(1);
});
