// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TownBoard} from './TownBoard.js';
import type {PrivateView} from '../api.js';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function fixture(count:number):PrivateView{return {state:'RUNNING',roomInstanceId:'room',participant:{id:'me',nickname:'甲',seat:1},role:{roleId:'imp',name:'小恶魔',type:'DEMON',alignment:'EVIL',summary:'能力',beginnerTip:'建议'},history:[{seq:1,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'收到的原始双候选信息',candidateGroup:{kind:'ONE_OF',roleName:'图书管理员',seats:[2,count]}}],messages:[],startInfo:{infoId:'info',gameId:'g',team:[{seat:2,nickname:'同伴甲',kind:'MINION'},{seat:3,nickname:'同伴乙',kind:'MINION'}],bluffs:[],acknowledged:true,canAcknowledge:false},butler:{masterSeat:2,masterRaised:false},game:{gameId:'g',phase:'DAY_DISCUSSION',day:1,events:[],aliveCount:count,readyCount:0,seats:Array.from({length:count},(_,i)=>({id:'stable-'+i,seat:i+1,nickname:'长昵称'.repeat(8)+i,avatar:'/avatar.webp',alive:true,connected:true,ghostVoteAvailable:true}))}};}
test.each([5,7,12])('private marks use an independent lane without changing the %s-seat circle',count=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:340,height:440,x:0,y:0,top:0,left:0,right:340,bottom:440,toJSON:()=>({})});
 const view=fixture(count),props={view,busy:false,onNominate:vi.fn(),onShoot:vi.fn()};const ui=render(<TownBoard {...props}/>);
 const table=ui.container.querySelector('.round-table')!,geometry=table.getAttribute('style'),positions=[...table.querySelectorAll('.rn-seat')].map(node=>node.getAttribute('style'));
 const rail=screen.getByRole('navigation',{name:'我的圆桌标记'});expect(table).not.toContainElement(rail);expect(table.querySelector('.rn-seat__private-mark')).toBeNull();expect(within(rail).getByRole('button',{name:'我的线索：爪牙 · ① 可能是图书管理员 · 主人'})).toHaveTextContent('2');
 fireEvent.click(within(rail).getByRole('button',{name:'我的线索：① 可能是图书管理员'}));expect(screen.getByRole('dialog',{name:'我的圆桌线索'})).toHaveTextContent('收到的原始双候选信息');
 ui.rerender(<TownBoard {...props} privateVisible={false}/>);expect(screen.queryByRole('navigation',{name:'我的圆桌标记'})).not.toBeInTheDocument();
 const next=ui.container.querySelector('.round-table')!;expect(next.getAttribute('style')).toBe(geometry);expect([...next.querySelectorAll('.rn-seat')].map(node=>node.getAttribute('style'))).toEqual(positions);
});
