export type PlayerController = 'HUMAN' | 'BOT';
export interface RoomTimeline {mode:'WALL'|'MANUAL';offsetMs:number;manualNowMs?:number;epoch:number}
export interface BotControlView {autoNominate?:boolean;requestedMode:'RUNNING'|'PAUSED';effectiveMode:'RUNNING'|'PAUSED'|'SUSPENDED';pace:'NORMAL'|'SLOW';version:number;attentionRequired:boolean}
export type BotTestCommand = 'END_DAY' | 'NOMINATE_ONCE' | 'SHOOT_ONCE';
export interface ControlResult {executedCount?:number;message?:string;actorSeat?:number;actorNickname?:string;status:'APPLIED'|'UNCHANGED'|'WAITING'|'ADVANCED';added?:number;removed?:number}
export const botControlProperties = {expectedControlVersion:{type:'integer',minimum:0}} as const;
