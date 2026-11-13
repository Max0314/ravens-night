export type VictoryCause='DEMON'|'MAYOR'|'SAINT'|'OTHER';
/** Reasons are public only at GAME_OVER's reveal point. Preview text is a legacy fallback. */
export function victoryCause(reason?:string):VictoryCause{
 if(reason==='demon-dead')return 'DEMON';
 if(reason==='mayor-final-three')return 'MAYOR';
 if(reason==='saint-executed')return 'SAINT';
 if(reason?.includes('圣徒'))return 'SAINT';
 if(reason?.includes('镇长'))return 'MAYOR';
 if(reason?.includes('恶魔死亡'))return 'DEMON';
 return 'OTHER';
}
export function victoryCaption(reason:string|undefined,fallback:string){
 return ({'demon-dead':'恶魔已经死亡，善良阵营获胜。','mayor-final-three':'镇长达成三人存活且无人处决，善良阵营获胜。','saint-executed':'圣徒因处决死亡，邪恶阵营获胜。','final-two':'仅剩两名存活玩家，邪恶阵营获胜。'} as Record<string,string>)[reason??'']??fallback;
}
