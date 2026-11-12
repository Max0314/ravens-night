// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {avatarChoices} from '@ravens/contracts';
import type {PlayerSelection} from './use-player-profile.js';
import {loadGuestProfile,saveGuestProfile} from './guest-profile.js';
import {PlayerProfileEditor} from './components/PlayerProfileEditor.js';
const current=avatarChoices[0]!.url;
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Fixture({occupied=[]}:{occupied?:string[]}){const[value,setValue]=useState<PlayerSelection>({nickname:'鲁迅',avatar:current});return <><PlayerProfileEditor value={value} onChange={setValue} guest occupiedAvatars={occupied}/><output aria-label="当前头像">{value.avatar}</output></>;}
test('random guest profiles visibly update both fields when crypto is unavailable',()=>{
 vi.stubGlobal('crypto',undefined);render(<Fixture occupied={[avatarChoices[1]!.url]}/>);fireEvent.click(screen.getByRole('button',{name:'换一组'}));expect(screen.getByRole('textbox',{name:'你的昵称'})).not.toHaveValue('鲁迅');expect(screen.getByLabelText('当前头像')).not.toHaveTextContent(current);expect(screen.getByLabelText('当前头像')).not.toHaveTextContent(avatarChoices[1]!.url);
});
test('when only the current avatar is available the nickname still changes',()=>{
 vi.stubGlobal('crypto',{getRandomValues(){throw new Error('WebView crypto unavailable');}});render(<Fixture occupied={avatarChoices.slice(1).map(a=>a.url)}/>);fireEvent.click(screen.getByRole('button',{name:'换一组'}));expect(screen.getByRole('textbox',{name:'你的昵称'})).not.toHaveValue('鲁迅');expect(screen.getByLabelText('当前头像')).toHaveTextContent(current);
});

test('an unsaved in-page guest profile stays ahead of an older valid storage value',()=>{
 saveGuestProfile({nickname:'旧资料',avatar:current},false);const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('storage denied');});
 try{expect(saveGuestProfile({nickname:'新资料',avatar:avatarChoices[1]!.url},false).persisted).toBe(false);expect(loadGuestProfile()).toMatchObject({nickname:'新资料',avatar:avatarChoices[1]!.url});}finally{failure.mockRestore();saveGuestProfile({nickname:'新资料',avatar:avatarChoices[1]!.url},false);}
});
