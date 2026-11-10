import type { Account } from './account.js';
import { RoomError } from '../rooms/errors.js';
import { trustedAvatar } from './avatar.js';
export interface AccountProfile { sub:string; revision:number; nickname:string|null; avatar:string|null }
export function profileView(account:Account,profile?:AccountProfile) {
  return {revision:profile?.revision??0,nickname:profile?.nickname??account.name.slice(0,24),avatar:profile?.avatar??account.picture??null,nicknameOverride:profile?.nickname??null,avatarOverride:profile?.avatar??null,defaultNickname:account.name.slice(0,24),defaultAvatar:account.picture??null};
}
export function validateProfile(nickname:string|null,avatar:string|null) {
  const clean=nickname?.trim()??null;
  if(clean!==null&&(!clean||clean.length>24||/[\u0000-\u001f\u007f]/.test(clean)))throw new RoomError('INVALID_PROFILE','昵称请输入1至24个字符',400,false);
  if(avatar!==null&&!trustedAvatar(avatar))throw new RoomError('INVALID_PROFILE','请选择可用头像',400,false);
  return {nickname:clean,avatar};
}
