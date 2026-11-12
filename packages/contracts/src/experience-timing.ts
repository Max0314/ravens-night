import type { ExperienceKind } from './experience.js';
export type PresentationVersion = 1 | 2 | 3;
const durations = {
  1: { NOTICE: 0, NIGHT_FALLS: 2000, SHOT: 4500, NOMINATION: 1000, VOTE_RESULT: 2500, EXECUTION: 4500, DAWN: 5000, GAME_OVER: 5000 },
  2: { NOTICE: 0, NIGHT_FALLS: 5000, SHOT: 6000, NOMINATION: 1800, VOTE_RESULT: 3500, EXECUTION: 6000, DAWN: 6500, GAME_OVER: 7000 },
  3: { NOTICE: 0, NIGHT_FALLS: 3600, SHOT: 2600, NOMINATION: 800, VOTE_RESULT: 1200, EXECUTION: 2800, DAWN: 4200, GAME_OVER: 5200 },
} as const;
export function experienceTiming(kind: ExperienceKind, version: PresentationVersion = 1) {
  if(!durations[version])throw new Error('Unsupported presentation version');
  const duration = durations[version][kind];
  if(version===3){
    const resultOffset=kind==='SHOT'?850:kind==='EXECUTION'?1000:kind==='DAWN'?1400:kind==='GAME_OVER'?900:0;
    const cues:ReadonlyArray<readonly[number,string]>=kind==='SHOT'?[[200,'cock'],[850,'shot'],[1650,'tail']]:kind==='EXECUTION'?[[180,'frame'],[1000,'mechanism']]:kind==='DAWN'?[[300,'dawn']]:kind==='NIGHT_FALLS'?[[300,'bell']]:kind==='GAME_OVER'?[]:kind==='NOMINATION'?[[120,'nominate']]:kind==='VOTE_RESULT'?[[120,'paper']]:[];
    return{duration,resultOffset,cues};
  }
  const resultOffset = ['SHOT', 'EXECUTION'].includes(kind) ? (version === 2 ? 3600 : 2800) : ['DAWN', 'GAME_OVER'].includes(kind) ? (version === 2 ? 2800 : 2100) : 0;
  const cues: ReadonlyArray<readonly [number, string]> = kind === 'SHOT' ? (version === 2 ? [[1800,'cock'],[3600,'shot'],[5400,'bell']] : [[1200,'cock'],[2800,'shot'],[4100,'bell']])
    : kind === 'EXECUTION' ? (version === 2 ? [[500,'bell'],[3600,'mechanism'],[4800,'bell']] : [[300,'bell'],[2800,'mechanism'],[3600,'bell']])
    : kind === 'DAWN' ? (version === 2 ? [[600,'bell'],[2200,'bell']] : [[400,'bell'],[1500,'bell']])
    : kind === 'NIGHT_FALLS' ? [[version === 2 ? 500 : 300,'bell']] : [[350,'paper']];
  return { duration, resultOffset, cues };
}

/** v3 public announcements never gate a legal action or occupy the cinematic queue. */
export function isNonBlockingExperience(kind:ExperienceKind,version:PresentationVersion=1):boolean{return version===3&&(kind==="NOMINATION"||kind==="VOTE_RESULT");}
