// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const names=['shot','glass','impact','scream','poison','shield','butler','demon','good','evil','night-bell','dawn-bell','paper-turn-1','paper-turn-2','paper-turn-3','paper-turn-4','paper-lift-1','paper-lift-2','ui-press','ui-open','nomination','vote-stamp','guillotine-tension','guillotine-unlock','guillotine-blade','guillotine-impact','guillotine-wind','glass-hit','glass-shards','gun-cock','hurt-shot-1','hurt-shot-2','hurt-shot-3','hurt-night-1','hurt-night-2','hurt-night-3','blood-impact','bone-crack','role-baron','role-scarlet_woman','role-imp','role-monk','role-butler','wing-flap','wing-air','wing-root','slash-left','slash-right','poison-bottle','poison-bubbles','poison-cork','poison-pour','chef-chop-1','chef-chop-2','chef-chop-3','coffin-open','coffin-settle','cough-1','cough-2','cough-3','butler-voice','washer-dip','washer-scrub','washer-drops','washer-whisper','crystal-resonance','crystal-shiver','investigator-lens','investigator-evidence','envelope-seal','envelope-flap','envelope-draw'];
const started:Array<{sample:number;at:number;offset:number;rate:number;stopped:boolean;stopAt?:number}>=[];
class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}}
class Node{gain=new Param();frequency=new Param();playbackRate=new Param();buffer:{sample:number}|undefined;onended:(()=>void)|null=null;row:typeof started[number]|undefined;connect(){}disconnect(){}start(at:number,offset=0){this.row={sample:this.buffer?.sample??-1,at,offset,rate:this.playbackRate.value,stopped:false};started.push(this.row);}stop(at?:number){if(this.row){this.row.stopped=true;this.row.stopAt=at??0;}}}
const gains:Node[]=[];
let context:Context;
class Context{state='running';currentTime=10;sampleRate=48000;destination={};constructor(){context=this;}async resume(){}createGain(){const node=new Node();gains.push(node);return node;}createBufferSource(){return new Node();}createOscillator(){return new Node();}async decodeAudioData(data:ArrayBuffer){return{sample:new Uint8Array(data)[0],duration:({shield:1.7,'slash-left':.42,'slash-right':.42,'wing-flap':.45,'wing-air':.65,'wing-root':.35,'butler-voice':.768,'role-butler':2.6,'night-bell':9,'dawn-bell':10.5,'poison-pour':.6541,'poison-cork':.2362,'chef-chop-1':.21,'chef-chop-2':.21,'chef-chop-3':.21,'washer-dip':.5,'washer-scrub':.72,'washer-drops':1.2,'washer-whisper':1.6,'crystal-resonance':2.7,'crystal-shiver':1.25,'investigator-lens':.8,'investigator-evidence':.4,'envelope-seal':.22,'envelope-flap':.6,'envelope-draw':.7} as Record<string,number>)[names[new Uint8Array(data)[0]!]!]??3};}createBuffer(){return{getChannelData:()=>new Float32Array(100)};}}
let audio:typeof import('./experience-audio.js'),preferences:typeof import('../participation-audio.js');
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
beforeEach(async()=>{vi.resetModules();localStorage.clear();started.length=0;gains.length=0;vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,arrayBuffer:async()=>new Uint8Array([(()=>{const sample=names.indexOf(url.split('/').at(-1)!.replace('.mp3',''));if(sample<0)throw Error('Unmodelled audio '+url);return sample;})()]).buffer})));audio=await import('./experience-audio.js');preferences=await import('../participation-audio.js');await audio.enableEffectsAudio(true);await flush();});
afterEach(()=>{audio.silenceEffects();vi.unstubAllGlobals();});
test('online enables private samples while mode selection keeps the master preference and offline cancels them',async()=>{
 audio.schedulePrivateCue('private-one','BUTLER',0);await flush();expect(started).toHaveLength(0);
 preferences.setParticipationMode('ONLINE');expect(audio.effectsAudioEnabled()).toBe(true);audio.schedulePrivateCue('private-one','BUTLER',0);await flush();expect(started.map(v=>v.sample)).toContain(names.indexOf('butler-voice'));
 preferences.setParticipationMode('IN_PERSON');expect(started.every(v=>v.stopped)).toBe(true);await audio.enableEffectsAudio(false);preferences.setParticipationMode('ONLINE');expect(audio.effectsAudioEnabled()).toBe(false);
});
test('public impact is scheduled once and a fresh death outcome adds a separate scream without revealing early',async()=>{
 audio.scheduleCue('shot-fresh','SHOT',0,3);await flush();expect(started.filter(v=>v.sample===names.indexOf('shot'))).toHaveLength(1);expect(started.filter(v=>v.sample===names.indexOf('glass'))).toHaveLength(1);expect(started.filter(v=>v.sample===names.indexOf('scream'))).toHaveLength(0);
 audio.scheduleCue('shot-fresh','SHOT',980,3,false,{outcome:'DEATH',resultVisible:true});await flush();expect(started.filter(v=>v.sample===names.indexOf('scream'))).toHaveLength(1);
 audio.scheduleCue('shot-fresh','SHOT',1000,3,false,{outcome:'DEATH',resultVisible:true});audio.scheduleCue('shot-stale','SHOT',1500,3,false,{outcome:'DEATH',resultVisible:true});await flush();expect(started.filter(v=>v.sample===names.indexOf('scream'))).toHaveLength(1);
});
test('a surviving shot has the same glass impact, never a death sample; cancelled pending loads never start',async()=>{
 audio.scheduleCue('alive','SHOT',0,3,false,{outcome:'NO_DEATH',resultVisible:false});await flush();expect(started.some(v=>v.sample===names.indexOf('glass'))).toBe(true);expect(started.some(v=>v.sample===names.indexOf('scream'))).toBe(false);
 const count=started.length;preferences.setParticipationMode('ONLINE');audio.schedulePrivateCue('cancel-before-decode','DEMON',0);preferences.setParticipationMode('IN_PERSON');await flush();expect(started.length).toBe(count);
});
test('slow playback positions future cues at the scaled delay and never backfills past gunshots',async()=>{
 audio.scheduleCue('slow','SHOT',400,3,false,{rate:.5});await flush();const shot=started.find(v=>v.sample===names.indexOf('shot'));expect(shot?.at).toBeCloseTo(10+.9);const count=started.length;audio.cancelEventAudio('slow');audio.scheduleCue('late','SHOT',2000,3);await flush();expect(started.length).toBe(count);
});

test('unlocking an already running context does not rebroadcast or stop a private scene',async()=>{
 preferences.setParticipationMode('ONLINE');audio.schedulePrivateCue('touch-running','DEMON',0);await flush();const listener=vi.fn();window.addEventListener('ravens-effects-unlocked',listener);await audio.unlockEffectsAudio();await audio.unlockEffectsAudio();expect(listener).not.toHaveBeenCalled();expect(started.some(v=>v.sample===names.indexOf('wing-flap')&&!v.stopped)).toBe(true);window.removeEventListener('ravens-effects-unlocked',listener);
});

test('v4 night rings three times, dawn twice, and natural visual completion preserves the tail',async()=>{
 audio.scheduleCue('night-four','NIGHT_FALLS',0,4);await flush();const night=started.filter(s=>s.sample===names.indexOf('night-bell'));expect(night.map(s=>s.at)).toEqual([10.35,11.9,13.45]);audio.completeEventAudio('night-four');expect(night.every(s=>!s.stopped)).toBe(true);
 audio.scheduleCue('dawn-four','DAWN',0,4);await flush();expect(night.every(s=>s.stopped)).toBe(true);const dawn=started.filter(s=>s.sample===names.indexOf('dawn-bell'));expect(dawn.map(s=>s.at)).toEqual([10.35,12.95]);audio.cancelEventAudio('dawn-four');expect(dawn.every(s=>s.stopped)).toBe(true);
});
test('master mute always wins over paper sound and explicit book cancel stops pending sources',async()=>{
 await audio.enableEffectsAudio(false);audio.playSemantic('paper-turn',{variant:0,scope:'book'});await flush();expect(started).toHaveLength(0);await audio.enableEffectsAudio(true);audio.playSemantic('paper-turn',{variant:0,scope:'book'});await flush();expect(started.map(s=>s.sample)).toContain(names.indexOf('paper-turn-1'));audio.cancelSemantic('book');expect(started.every(s=>s.stopped)).toBe(true);
});
test.each([1,2,3,4] as const)('empty execution v%s keeps only wind; no release, blade, impact or death cue',async(version)=>{
 audio.scheduleCue('empty-'+version,'EXECUTION',0,version,true);await flush();expect(started.map(s=>names[s.sample])).toEqual(['guillotine-wind']);
 audio.scheduleCue('empty-'+version,'EXECUTION',1300,version,true,{outcome:'NONE',resultVisible:true});await flush();expect(started).toHaveLength(1);
});

test('pause immediately cancels a cue that was due less than 40ms in the future',async()=>{audio.scheduleCue('near-future','SHOT',825,4);await flush();const future=started.filter(s=>s.at>10);expect(future.length).toBeGreaterThan(0);audio.cancelEventAudio('near-future');expect(future.every(s=>s.stopped&&s.stopAt===10)).toBe(true);});
test('a former Baron inherits with the succession theme instead of disclosing old prop audio',async()=>{preferences.setParticipationMode('ONLINE');audio.scheduleRoleCue({version:1,id:'succession',kind:'ROLE_CHANGE',themeRoleId:'baron',shown:{type:'NEW_ROLE',roleId:'imp'}},0);await flush();expect(started.some(s=>s.sample===names.indexOf('role-scarlet_woman'))).toBe(true);expect(started.some(s=>s.sample===names.indexOf('role-baron'))).toBe(false);});

test('in-person mode suppresses private menu feedback while public menu foley remains available',async()=>{audio.playSemantic('open',{scope:'private'});await flush();expect(started).toHaveLength(0);audio.playSemantic('open',{scope:'ui'});await flush();expect(started.some(s=>s.sample===names.indexOf('ui-open'))).toBe(true);preferences.setParticipationMode('ONLINE');const count=started.length;audio.playSemantic('open',{scope:'private'});await flush();expect(started.length).toBe(count+1);});

const submitted=(role:string)=>({version:1 as const,id:'submit-'+role,kind:'ACTION_SUBMITTED' as const,themeRoleId:role,shown:{type:'TARGET_SUBMITTED' as const,action:role==='monk'?'PROTECT' as const:'KILL' as const,seats:[2]}});
test('monk action restores the exact accepted v1 shield and its metal transient lands at 700ms',async()=>{
 preferences.setParticipationMode('ONLINE');const scene=submitted('monk');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();
 expect(fetch).toHaveBeenCalledWith('/audio/effects/v1/shield.mp3');expect(started).toHaveLength(1);expect(started[0]?.sample).toBe(names.indexOf('shield'));expect(started[0]?.at).toBeCloseTo(10.418);expect(audio.roleAudioCues(scene)[0]?.[2]).toBe(.74);
});
test('imp action separates both rip cues without duplicating the generic wing theme',async()=>{
 preferences.setParticipationMode('ONLINE');const scene=submitted('imp');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();
 expect(started.some(s=>s.sample===names.indexOf('role-imp'))).toBe(false);expect(started.filter(s=>s.sample===names.indexOf('slash-left')).map(s=>s.at)).toEqual([11.615,12.815]);expect(started.filter(s=>s.sample===names.indexOf('slash-right')).map(s=>s.at)).toEqual([12.165,13.365]);
 audio.cancelEventAudio('private:'+scene.id);expect(started.every(s=>s.stopped)).toBe(true);
});
test('closing a slow single-track audition cancels its eventual decode',async()=>{
 let finish:()=>void=()=>{};vi.mocked(fetch).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=()=>resolve({ok:true,arrayBuffer:async()=>new Uint8Array([names.indexOf('shield')]).buffer} as Response);}));
 const pending=audio.auditionSample('v1:shield');await flush();audio.silenceEffects();finish();await pending;await flush();expect(started).toHaveLength(0);
});

test('explicit replay gets fresh audio but duplicate scheduling of the same playback stays idempotent',async()=>{
 preferences.setParticipationMode('ONLINE');const scene=submitted('monk');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0,{playbackId:'first'});audio.scheduleRoleCue(scene,0,{playbackId:'first'});await flush();expect(started).toHaveLength(1);audio.cancelEventAudio('private:first');audio.scheduleRoleCue(scene,0,{playbackId:'replay'});await flush();expect(started).toHaveLength(2);
});

test('scene kind wins over its recipient role and Butler identity keeps the accepted voice',async()=>{
 preferences.setParticipationMode('ONLINE');const imp=submitted('imp');
 const opening={...imp,id:'start',kind:'EVIL_START' as const,shown:{type:'EVIL_START' as const,infoId:'start-info'}};
 const continuation={...imp,id:'continued',kind:'OLD_DEMON_CONTINUATION' as const,shown:{type:'CONTINUATION' as const}};
 expect(audio.roleAudioCues(opening).map(c=>c[1])).toEqual(['v6:envelope-seal','v6:envelope-flap','v6:envelope-draw']);
 expect(audio.roleAudioCues(continuation).map(c=>c[1])).toEqual(['wing-air']);
 const identity={...submitted('butler'),id:'intro',kind:'IDENTITY' as const,shown:{type:'IDENTITY' as const,roleId:'butler',summary:'介绍'}};
 await audio.prepareRoleAudio(identity);audio.scheduleRoleCue(identity,0);await flush();expect(started.find(s=>names[s.sample]==='butler-voice')?.at).toBe(11.45);
});

test('intact poison uses v4 stopper and stream, with cough only on submission and v4 audition routing',async()=>{
 preferences.setParticipationMode('ONLINE');const action=submitted('poisoner'),identity={...action,kind:'IDENTITY' as const,shown:{type:'IDENTITY' as const,roleId:'poisoner',summary:'介绍'}};
 expect(audio.roleAudioCues(identity).some(c=>c[1].startsWith('cough'))).toBe(false);
 expect(audio.roleAudioCues(action).some(c=>c[1].startsWith('cough'))).toBe(true);
 await audio.prepareRoleAudio(action);audio.scheduleRoleCue(action,0);await flush();
 expect(fetch).toHaveBeenCalledWith('/audio/effects/v4/poison-cork.mp3');expect(fetch).toHaveBeenCalledWith('/audio/effects/v4/poison-pour.mp3');expect(started.some(s=>names[s.sample]==='poison-bottle')).toBe(false);
 await audio.auditionSample('v4:coffin-settle');await flush();expect(fetch).toHaveBeenCalledWith('/audio/effects/v4/coffin-settle.mp3');
});

test('resume continues a spoken tail from its offset, while seek skips the past and rip attacks never replay',async()=>{
 preferences.setParticipationMode('ONLINE');const butler=submitted('butler');await audio.prepareRoleAudio(butler);audio.scheduleRoleCue(butler,0);await flush();context.currentTime=11.8;audio.cancelEventAudio('private:'+butler.id);audio.scheduleRoleCue(butler,1800,{mode:'RESUME'});await flush();
 const voice=started.filter(s=>names[s.sample]==='butler-voice'&&!s.stopped);expect(voice).toHaveLength(1);expect(voice[0]?.offset).toBeCloseTo(.35);expect(voice[0]?.at).toBe(11.8);
 audio.cancelEventAudio('private:'+butler.id);const count=started.length;audio.scheduleRoleCue(butler,1800,{mode:'SEEK'});await flush();expect(started).toHaveLength(count);
 const imp=submitted('imp');await audio.prepareRoleAudio(imp);audio.scheduleRoleCue(imp,1900,{mode:'RESUME'});await flush();expect(started.slice(count).map(s=>names[s.sample])).toEqual(['slash-right','slash-left','slash-right']);expect(started[count]?.at).toBeCloseTo(12.065);
});

test('a shield paused in its lead-in preserves the future contact without restarting the transient',async()=>{
 preferences.setParticipationMode('ONLINE');const monk=submitted('monk');await audio.prepareRoleAudio(monk);audio.scheduleRoleCue(monk,500,{mode:'RESUME'});await flush();expect(started).toHaveLength(1);expect(started[0]?.offset).toBeCloseTo(.082);
 audio.cancelEventAudio('private:'+monk.id);audio.scheduleRoleCue(monk,900,{mode:'RESUME'});await flush();expect(started).toHaveLength(1);
});

test('new material peaks and pouring onset land on the shared visual contacts',()=>{
 const manifest=JSON.parse(readFileSync(resolve('apps/web/public/audio/effects/v4/manifest.json'),'utf8')) as {files:Array<{id:string;peakOffsetMs:number;onsetOffsetMs:number}>};
 const media=new Map(manifest.files.map(r=>[r.id,r]));
 for(const [i,cue]of audio.roleAudioCues(submitted('chef')).entries())expect(cue[0]+media.get(cue[1].slice(3))!.peakOffsetMs).toBeCloseTo([650,1000,1350][i]!,3);
 const poison=audio.roleAudioCues(submitted('poisoner'));
 expect(poison[0]![0]+media.get('poison-cork')!.peakOffsetMs).toBeCloseTo(700,3);expect(poison[1]![0]+media.get('poison-pour')!.onsetOffsetMs).toBeCloseTo(950,3);
});

test('seek back can play the now-future contact once in its new epoch without replaying past cues',async()=>{
 preferences.setParticipationMode('ONLINE');const scene=submitted('monk');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();context.currentTime=11;audio.cancelEventAudio('private:'+scene.id);
 audio.scheduleRoleCue(scene,100,{mode:'SEEK'});audio.scheduleRoleCue(scene,100,{mode:'SEEK'});await flush();expect(started).toHaveLength(2);expect(started[1]?.at).toBeCloseTo(11.318);expect(started[1]?.offset).toBe(0);
});

test('public bells and empty-stage wind continue at their offsets without duplicating future cues',async()=>{
 audio.scheduleCue('bell-resume','NIGHT_FALLS',0,4);await flush();context.currentTime=10.9;audio.cancelEventAudio('bell-resume');audio.scheduleCue('bell-resume','NIGHT_FALLS',900,4,false,{mode:'RESUME'});await flush();
 const playing=started.filter(s=>!s.stopped&&names[s.sample]==='night-bell');expect(playing).toHaveLength(3);expect(playing[0]?.offset).toBeCloseTo(.55);expect(playing[0]?.at).toBe(10.9);
 const count=started.length;audio.scheduleCue('bell-resume','NIGHT_FALLS',1800,4);await flush();expect(started).toHaveLength(count);
 audio.scheduleCue('wind-resume','EXECUTION',0,4,true);await flush();context.currentTime=11.9;audio.cancelEventAudio('wind-resume');audio.scheduleCue('wind-resume','EXECUTION',1300,4,true,{mode:'RESUME'});await flush();expect(started.filter(s=>!s.stopped&&names[s.sample]==='guillotine-wind').at(-1)?.offset).toBe(1);
});

test.each(['SHOT','NOMINATION','VOTE_RESULT'] as const)('public %s seek recorded while paused can play its future contact once again',async kind=>{
 audio.scheduleCue('public-seek',kind,0,4);await flush();const sample=kind==='SHOT'?'shot':kind==='NOMINATION'?'nomination':'vote-stamp',heard=()=>started.filter(s=>names[s.sample]===sample).length;expect(heard()).toBe(1);
 context.currentTime=11.5;audio.cancelEventAudio('public-seek');audio.scheduleCue('public-seek',kind,0,4,false,{mode:'SEEK',seekKey:1,paused:true});await flush();expect(heard()).toBe(1);
 audio.scheduleCue('public-seek',kind,0,4,false,{mode:'RESUME'});audio.scheduleCue('public-seek',kind,0,4);await flush();expect(heard()).toBe(2);
});

test('seek does not backfill an earlier ringing bell when the controller subsequently changes to resume',async()=>{
 audio.scheduleCue('no-seek-tail','NIGHT_FALLS',1000,4,false,{mode:'SEEK',seekKey:1});await flush();expect(started.map(s=>s.at)).toEqual([10.9,12.45]);
 audio.scheduleCue('no-seek-tail','NIGHT_FALLS',1016,4,false,{mode:'RESUME'});await flush();expect(started).toHaveLength(2);
});

test('only actually-started public voice and finale tails resume; seek and unheard results stay silent',async()=>{
 audio.scheduleCue('dawn-tail','DAWN',1800,4,false,{outcome:'DEATH',resultVisible:true});await flush();context.currentTime=10.2;audio.cancelEventAudio('dawn-tail');audio.scheduleCue('dawn-tail','DAWN',2000,4,false,{outcome:'DEATH',resultVisible:true,mode:'RESUME'});await flush();
 const voice=started.filter(s=>!s.stopped&&names[s.sample]?.startsWith('hurt-night'));expect(voice).toHaveLength(1);expect(voice[0]?.offset).toBeCloseTo(.2);
 audio.scheduleCue('final-tail','GAME_OVER',900,4,false,{outcome:'GOOD',resultVisible:true});await flush();context.currentTime=11.2;audio.cancelEventAudio('final-tail');audio.scheduleCue('final-tail','GAME_OVER',1900,4,false,{outcome:'GOOD',resultVisible:true,mode:'RESUME'});await flush();expect(started.filter(s=>!s.stopped&&names[s.sample]==='good').at(-1)?.offset).toBe(1);
 const count=started.length;audio.scheduleCue('unheard-final','GAME_OVER',1000,4,false,{outcome:'GOOD',resultVisible:true,mode:'RESUME'});audio.scheduleCue('seek-final','GAME_OVER',1000,4,false,{outcome:'GOOD',resultVisible:true,mode:'SEEK',seekKey:1});audio.scheduleCue('seek-final','GAME_OVER',1050,4,false,{outcome:'GOOD',resultVisible:true,mode:'RESUME'});await flush();expect(started).toHaveLength(count);
});


test('preview sound and volume reach the master without changing room privacy or preferences',async()=>{
 await audio.enableEffectsAudio(false);preferences.setParticipationMode('IN_PERSON');
 const leave=audio.beginEffectsPreview();await audio.enableEffectsAudio(true);audio.setEffectsPreviewVolume(.31);
 const scene=submitted('monk');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();
 expect(started).toHaveLength(1);expect(gains.at(-1)?.gain.value).toBe(.31);
 audio.setEffectsPreviewVolume(0);expect(gains.at(-1)?.gain.value).toBe(0);expect(preferences.participationMode()).toBe('IN_PERSON');expect(localStorage.getItem('ravens_effects_audio')).toBe('off');
 leave();expect(audio.effectsAudioEnabled()).toBe(false);expect(started[0]?.stopped).toBe(true);expect(gains.at(-1)?.gain.value).toBe(.72);
});


test('four demon contacts use audible v5 stems, compensate decoded attack energy and stay uncancelled by the voice/source cap',async()=>{
 preferences.setParticipationMode('ONLINE');const scene=submitted('imp');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();
 const slashes=started.filter(s=>names[s.sample]?.startsWith('slash-'));expect(slashes).toHaveLength(4);expect(slashes.every(s=>!s.stopped)).toBe(true);expect(slashes.map(s=>Math.round((s.at-10)*1000+85))).toEqual([1700,2250,2900,3450]);
 expect(fetch).toHaveBeenCalledWith('/audio/effects/v5/slash-left.mp3');expect(fetch).toHaveBeenCalledWith('/audio/effects/v5/slash-right.mp3');expect(started.some(s=>names[s.sample]?.startsWith('hurt-'))).toBe(false);
 const manifest=JSON.parse(readFileSync(resolve('apps/web/public/audio/effects/v5/manifest.json'),'utf8'));expect(manifest.files.map((f:{contactOffsetMs:number})=>f.contactOffsetMs)).toEqual([85,85]);
});
test('generic press/select/success are quiet while bell, material scene and book cues remain distinct',async()=>{
 audio.playSemantic('press');audio.playSemantic('select');audio.playSemantic('success');await flush();expect(started).toHaveLength(0);
 audio.playSemantic('paper-turn',{variant:0});audio.scheduleCue('retained-bell','NIGHT_FALLS',0,4);await flush();expect(started.some(s=>names[s.sample]==='paper-turn-1')).toBe(true);expect(started.filter(s=>names[s.sample]==='night-bell')).toHaveLength(3);
});


test('the total switch gates paper owners without enabling in-person private sound or overriding preview',async()=>{
 await audio.enableEffectsAudio(false);const owner={};expect(await audio.prepareBookAudio(owner)).toBe(false);audio.playSemantic('paper-turn',{variant:0});await flush();expect(started).toHaveLength(0);
 await audio.enableEffectsAudio(true);expect(await audio.prepareBookAudio(owner)).toBe(true);expect(preferences.participationMode()).toBe('IN_PERSON');audio.playSemantic('paper-turn',{variant:0});await flush();expect(started.map(s=>names[s.sample])).toEqual(['paper-turn-1']);expect(gains.at(-2)?.gain.value).toBe(.65);
 await audio.enableEffectsAudio(false);expect(started[0]?.stopped).toBe(true);expect(await audio.prepareBookAudio(owner)).toBe(false);audio.releaseBookAudio(owner);audio.playSemantic('paper-turn');await flush();expect(started).toHaveLength(1);
 const leave=audio.beginEffectsPreview();const previewOwner={};expect(await audio.prepareBookAudio(previewOwner)).toBe(false);audio.releaseBookAudio(previewOwner);leave();
});

test('a new gesture retries resume synchronously while an older automatic request remains pending',async()=>{
 context.state='suspended';let rejectOld:(error:Error)=>void=()=>{};const resume=vi.fn().mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{rejectOld=reject;})).mockImplementationOnce(async()=>{context.state='running';});context.resume=resume;
 const first=audio.unlockEffectsAudio(),second=audio.unlockEffectsAudio();expect(resume).toHaveBeenCalledTimes(2);await second;rejectOld(new Error('old automatic request'));await first;expect(audio.effectsAudioStatus()).toBe('');
});

test('no total preference defaults on, explicit total off wins, and obsolete music/book preferences do not gate sound',async()=>{
 vi.resetModules();localStorage.clear();localStorage.setItem('ravens_lobby_music','off');localStorage.setItem('ravens_book_audio','off');const fresh=await import('./experience-audio.js');expect(fresh.effectsAudioEnabled()).toBe(true);
 localStorage.setItem('ravens_effects_audio','off');vi.resetModules();const muted=await import('./experience-audio.js');expect(muted.effectsAudioEnabled()).toBe(false);
});


test('role detail group one lands decoded material onsets and seal peak on the shared contacts',async()=>{
 const {cinematicTiming:c}=await import('./cinematic-timing.js');
 const manifest=JSON.parse(readFileSync(resolve('apps/web/public/audio/effects/v6/manifest.json'),'utf8')) as {files:Array<{id:string;onsetOffsetMs:number;peakOffsetMs:number}>};const media=new Map(manifest.files.map(r=>[r.id,r]));
 const fixtures=[{scene:submitted('washerwoman'),at:[c.washer.dipStart,c.washer.scrubStart,c.washer.dripStart,c.washer.dipStart]},{scene:submitted('fortune_teller'),at:[c.crystal.start,c.crystal.answer]},{scene:submitted('investigator'),at:[c.investigator.scanStart,c.investigator.turn]},{scene:{...submitted('imp'),kind:'EVIL_START' as const,shown:{type:'EVIL_START' as const,infoId:'group-one'}},at:[c.envelope.seal,c.envelope.flapStart,c.envelope.paperStart]}];
 for(const {scene,at}of fixtures)for(const [i,cue]of audio.roleAudioCues(scene).entries()){const data=media.get(cue[1].slice(3))!;expect(cue[0]+(cue[3]==='transient'?data.peakOffsetMs:data.onsetOffsetMs)).toBeCloseTo(at[i]!,3);expect(cue[1]).toMatch(/^v6:/);}
});
test('new washer layers remain private online, retain four audible sources and resume only their living tails',async()=>{
 const scene=submitted('washerwoman');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();expect(started).toHaveLength(0);preferences.setParticipationMode('ONLINE');await audio.prepareRoleAudio(scene);audio.scheduleRoleCue(scene,0);await flush();expect(started.map(s=>names[s.sample])).toEqual(['washer-dip','washer-scrub','washer-drops','washer-whisper']);expect(started.every(s=>!s.stopped)).toBe(true);expect(fetch).toHaveBeenCalledWith('/audio/effects/v6/washer-whisper.mp3');
 context.currentTime=11.9;audio.cancelEventAudio('private:'+scene.id);const count=started.length;audio.scheduleRoleCue(scene,1900,{mode:'RESUME'});await flush();expect(started.slice(count).map(s=>names[s.sample])).toEqual(['washer-drops','washer-whisper']);expect(started.slice(count).every(s=>s.offset>0)).toBe(true);
});
test('oracle ambience and investigator friction do not encode hidden YES/NO or stamp impacts',()=>{
 const base={...submitted('fortune_teller'),kind:'INFORMATION' as const};const yes={...base,shown:{type:'DIVINATION' as const,value:'YES' as const,seats:[2,3] as [number,number]}},no={...base,shown:{type:'DIVINATION' as const,value:'NO' as const,seats:[2,3] as [number,number]}};
 expect(audio.roleAudioCues(yes)).toEqual(audio.roleAudioCues(no));expect(audio.roleAudioCues(yes).map(c=>c[1])).toEqual(['v6:crystal-resonance','v6:crystal-shiver']);expect(audio.roleAudioCues(submitted('investigator')).some(c=>c[1]==='role-investigator')).toBe(false);
});
