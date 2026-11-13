// @vitest-environment jsdom
import {beforeEach,expect,test,vi} from 'vitest';
let prefs:typeof import('./audio-preferences.js');
beforeEach(async()=>{vi.resetModules();localStorage.clear();prefs=await import('./audio-preferences.js');});
test('malformed or unsupported local settings use defaults and each invalid field falls back independently',()=>{
 const defaults={version:1,music:{enabled:true,volume:.8},effects:{enabled:true,volume:.72}};
 for(const raw of [null,'bad','null','[]','{"version":2,"music":{"enabled":false,"volume":0}}'])expect(prefs.parseAudioPreferences(raw)).toEqual(defaults);
 expect(prefs.parseAudioPreferences('{"version":1,"music":{"enabled":false,"volume":"0.2"},"effects":{"enabled":"off","volume":0}}')).toEqual({version:1,music:{enabled:false,volume:.8},effects:{enabled:true,volume:0}});
 expect(prefs.parseAudioPreferences('{"version":1,"music":{"volume":-0.1},"effects":{"volume":2}}')).toEqual(defaults);
});
test('channel changes persist independently and survive a fresh module without exposing mutable state',async()=>{
 prefs.setAudioChannelEnabled('music',false);prefs.setAudioChannelVolume('effects',.43);const copy=prefs.audioPreferences();copy.music.enabled=true;expect(prefs.audioPreferences().music.enabled).toBe(false);
 const stored=localStorage.getItem(prefs.audioPreferencesKey);vi.resetModules();const fresh=await import('./audio-preferences.js');expect(fresh.audioPreferences()).toEqual({version:1,music:{enabled:false,volume:.8},effects:{enabled:true,volume:.43}});expect(localStorage.getItem(prefs.audioPreferencesKey)).toBe(stored);
 fresh.setAudioChannelVolume('effects',NaN);fresh.setAudioChannelVolume('effects',Infinity);expect(fresh.audioPreferences().effects.volume).toBe(.43);
});
test('denied storage cannot prevent the current device session from applying a channel change',()=>{
 const blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});try{prefs.setAudioChannelVolume('music',.3);expect(prefs.audioPreferences().music.volume).toBe(.3);}finally{blocked.mockRestore();}
});
