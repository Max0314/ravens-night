export type ParticipationMode='ONLINE'|'IN_PERSON';
const key='ravens_participation_audio_v1';
let mode:ParticipationMode=read();
function read():ParticipationMode{try{const v=JSON.parse(localStorage.getItem(key)??'null');return v?.version===1&&v.mode==='ONLINE'?'ONLINE':'IN_PERSON';}catch{return 'IN_PERSON';}}
export function participationMode(){return mode;}
export function privateAudioAllowed(){return mode==='ONLINE';}
export function setParticipationMode(next:ParticipationMode){mode=next;try{localStorage.setItem(key,JSON.stringify({version:1,mode}));}catch{/* This tab still remembers the selection. */}window.dispatchEvent(new Event('ravens:participation-audio'));}
