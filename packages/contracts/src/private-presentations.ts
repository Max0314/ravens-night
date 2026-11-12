/** Only the result actually shown to this player; never the storyteller's hidden truth. */
export type PrivateShownResult =
  | { type:'IDENTITY'; roleId:string; summary:string }
  | { type:'TARGET_SUBMITTED'; action:'POISON'|'PROTECT'|'MASTER'|'KILL'|'DIVINE'|'INSPECT'; seats:number[] }
  | { type:'CANDIDATES'; roleId:string; seats:[number,number] }
  | { type:'NO_OUTSIDER' }
  | { type:'COUNT'; value:0|1|2|3|4|5|6|7|8|9|10|11|12 }
  | { type:'DIVINATION'; value:'YES'|'NO'; seats:[number,number] }
  | { type:'SHOWN_ROLE'; roleId:string; seat:number }
  | { type:'GRIMOIRE'; historySeq:number }
  | { type:'EVIL_START'; infoId:string }
  | { type:'NEW_ROLE'; roleId:'imp' }
  | { type:'CONTINUATION' };
export type PrivateSceneKind='IDENTITY'|'ACTION_SUBMITTED'|'INFORMATION'|'EVIL_START'|'ROLE_CHANGE'|'OLD_DEMON_CONTINUATION';
export interface PrivateSceneDescriptor { version:1;id:string;kind:PrivateSceneKind;themeRoleId:string;shown:PrivateShownResult }
export type PresentationDisposition='COMPLETE'|'SKIP';
export interface PresentationAckRequest {roomInstanceId:string;gameId:string;entries:Array<{historySeq:number;disposition:PresentationDisposition}>}
export interface PresentationAckResponse {roomInstanceId:string;gameId:string;acked:PresentationAckRequest['entries'];revision:number}
