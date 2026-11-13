import {avatarChoices,trustedAvatar} from '@ravens/contracts';
const key='ravens_guest_profile_v1';
export const guestNames='史泰龙 奥特曼 皮卡丘 奶龙 冰霜大脚板 犬夜叉 胖虎 小夫 哆啦A梦 大雄 哆啦美 汤姆 杰瑞 史努比 加菲猫 海绵宝宝 派大星 章鱼哥 蟹老板 痞老板 小黄人 格鲁 功夫熊猫 阿宝 无牙仔 史迪仔 史瑞克 绿巨人 死侍 雷神 钢铁侠 蝙蝠侠 蜘蛛侠 蚁人 黑豹 毒液 洛基 孙悟空 猪八戒 沙悟净 哪吒 敖丙 葫芦娃 黑猫警长 海尔兄弟 喜羊羊 懒羊羊 沸羊羊 灰太狼 红太狼 小灰灰 熊大 熊二 光头强 猪猪侠 超人强 波比 菲菲 大耳朵图图 蜡笔小新 野原广志 肥嘟嘟左卫门 阿呆 小猪佩奇 乔治 龙猫 小煤球 无脸男 波妞 柯南 怪盗基德 毛利小五郎 樱木花道 流川枫 路飞 索隆 乔巴 乌索普 布鲁克 鸣人 卡卡西 迈特凯 一拳超人 赛亚人 贝吉塔 弗利萨 派蒙 可莉 荒泷一斗 钟离 马里奥 路易吉 耀西 瓦里奥 星之卡比 索尼克 林克 塞尔达 盖伦 提莫 墨菲特 石头人 蒙多 亚索 塔姆 巴德 吉格斯 吉良吉影 阿童木 擎天柱 威震天 大黄蜂 哥斯拉 金刚 宇宙大烧麦 炸毛土豆 暴走饭团 脆皮香蕉 迷路小熊 电饭煲战神 快乐大脚丫'.split(' ');
export interface GuestProfile {version:1;nickname:string;avatar:string;updatedAt:number}
let memory:GuestProfile|undefined;
let memoryUnpersisted=false;
export function validNickname(value:unknown):value is string{return typeof value==='string'&&!!value.trim()&&value.trim().length<=24&&!/[\u0000-\u001f\u007f]/.test(value);}
export function randomIndex(length:number){try{const v=new Uint32Array(1),limit=Math.floor(0x100000000/length)*length;do{crypto.getRandomValues(v);}while(v[0]!>=limit);return v[0]!%length;}catch{return Math.floor(Math.random()*length);}}
export function randomGuestProfile(currentNickname?:string):GuestProfile{const names=guestNames.filter(name=>name!==currentNickname?.trim());return{version:1,nickname:names[randomIndex(names.length)]!,avatar:avatarChoices[randomIndex(avatarChoices.length)]!.url,updatedAt:Date.now()};}
export function saveGuestProfile(value:Pick<GuestProfile,'nickname'|'avatar'>,notify=true){
  if(!validNickname(value.nickname)||!trustedAvatar(value.avatar))throw new Error('请填写有效昵称并选择头像');
  memory={version:1,nickname:value.nickname.trim(),avatar:value.avatar,updatedAt:Date.now()};
  let persisted=true;try{localStorage.setItem(key,JSON.stringify(memory));}catch{persisted=false;}memoryUnpersisted=!persisted;
  if(notify)window.dispatchEvent(new Event('ravens:guest-profile'));return{profile:memory,persisted};
}
export function loadGuestProfile():GuestProfile{
  if(memoryUnpersisted&&memory)return memory;
  let raw:Partial<GuestProfile>|undefined;
  try{raw=JSON.parse(localStorage.getItem(key)??'null')??undefined;}catch{}
  if(raw?.version===1&&validNickname(raw.nickname)&&trustedAvatar(raw.avatar)){memory=raw as GuestProfile;return memory;}
  if(!raw&&memory)return memory;
  let legacy:{nickname?:string;avatar?:string}|undefined;
  try{legacy=JSON.parse(localStorage.getItem('ravens_room_session')??'null')??undefined;}catch{}
  const fallback=memory??randomGuestProfile();return saveGuestProfile({nickname:validNickname(raw?.nickname)?raw!.nickname!:validNickname(legacy?.nickname)?legacy!.nickname!:fallback.nickname,avatar:trustedAvatar(raw?.avatar)??trustedAvatar(legacy?.avatar)??fallback.avatar},false).profile;
}
export const guestProfileStorageKey=key;
