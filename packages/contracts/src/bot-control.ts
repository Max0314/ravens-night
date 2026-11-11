export type PlayerController = 'HUMAN' | 'BOT';
export interface RoomTimeline {mode:'WALL'|'MANUAL';offsetMs:number;manualNowMs?:number;epoch:number}
export interface BotControlView {requestedMode:'RUNNING'|'PAUSED';effectiveMode:'RUNNING'|'PAUSED'|'SUSPENDED';pace:'NORMAL'|'SLOW';version:number;attentionRequired:boolean}
export interface ControlResult {status:'APPLIED'|'UNCHANGED'|'WAITING'|'ADVANCED';added?:number;removed?:number}
export const botControlProperties = {expectedControlVersion:{type:'integer',minimum:0}} as const;
