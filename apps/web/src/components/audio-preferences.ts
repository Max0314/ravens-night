export type AudioChannel='music'|'effects';
export interface ChannelPreference {enabled:boolean;volume:number}
export interface AudioPreferences {version:1;music:ChannelPreference;effects:ChannelPreference}
export const audioPreferencesKey='ravens_audio_channels_v1';
export const audioPreferencesEvent='ravens:audio-preferences';
const defaults:AudioPreferences={version:1,music:{enabled:true,volume:.8},effects:{enabled:true,volume:.72}};
const channel=(value:unknown,fallback:ChannelPreference):ChannelPreference=>{
 const v=value&&typeof value==='object'?value as Partial<ChannelPreference>:{};
 return{enabled:typeof v.enabled==='boolean'?v.enabled:fallback.enabled,volume:typeof v.volume==='number'&&Number.isFinite(v.volume)&&v.volume>=0&&v.volume<=1?v.volume:fallback.volume};
};
export function parseAudioPreferences(raw:string|null):AudioPreferences{
 let value:Partial<AudioPreferences>|undefined;try{const parsed=JSON.parse(raw??'null');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.version===1)value=parsed;}catch{/* Use independent defaults for malformed local data. */}
 return{version:1,music:channel(value?.music,defaults.music),effects:channel(value?.effects,defaults.effects)};
}
function read(){try{return parseAudioPreferences(localStorage.getItem(audioPreferencesKey));}catch{return parseAudioPreferences(null);}}
let preferences=read();
/** Return a copy so callers cannot mutate the stored state without its event. */
export function audioPreferences():AudioPreferences{return{version:1,music:{...preferences.music},effects:{...preferences.effects}};}
function save(next:AudioPreferences){preferences=next;try{localStorage.setItem(audioPreferencesKey,JSON.stringify(next));}catch{/* These settings remain effective for this tab. */}window.dispatchEvent(new Event(audioPreferencesEvent));}
export function setAudioChannelEnabled(name:AudioChannel,value:boolean){if(typeof value!=='boolean'||preferences[name].enabled===value)return;save({...preferences,[name]:{...preferences[name],enabled:value}});}
export function setAudioChannelVolume(name:AudioChannel,value:number){if(!Number.isFinite(value)||value<0||value>1||preferences[name].volume===value)return;save({...preferences,[name]:{...preferences[name],volume:value}});}
