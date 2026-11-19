import type {RoomView} from './api.js';

export function leaveRoomCopy(room:RoomView,mode:'PLAYER'|'DISPLAY'='PLAYER'){
  if(mode==='DISPLAY')return {message:'确认退出当前投屏？'};
  const active=room.state==='RUNNING'||room.state==='TUTORIAL';
  if(room.roomKind==='DEBUG_SOLO')return {
    message:active?'离开将结束本局并关闭单人调试房。下次仍可创建调试房。':'离开将关闭单人调试房。下次仍可创建调试房。',
  };
  if(active)return {message:'多人对局进行中。可以返回首页保留座位，对局结束或中止后即可离开。',blocked:true};
  return {message:'离开后需重新加入才能返回房间。'};
}
