import {avatarChoices,trustedAvatar} from '@ravens/contracts';
const key='ravens_guest_profile_v1';
export const guestNames='鲁迅 老舍 巴金 冰心 张爱玲 钱钟书 沈从文 余华 莫言 王小波 刘慈欣 三毛 金庸 古龙 李白 杜甫 苏轼 李清照 曹雪芹 莎士比亚 海明威 托尔斯泰 雨果 狄更斯 卡夫卡 马尔克斯 村上春树 东野圭吾 阿加莎 博尔赫斯 史泰龙 卓别林 成龙 周星驰 梁朝伟 周润发 刘德华 张国荣 巩俐 梅丽尔 赫本 汤姆汉克斯 基努里维斯 莱昂纳多 斯皮尔伯格 诺兰 黑泽明 宫崎骏 张艺谋 李安 王家卫 徐克 奥特曼 皮卡丘 犬夜叉 孙悟空 哪吒 葫芦娃 哆啦A梦 大雄 柯南 小兰 路飞 索隆 鸣人 卡卡西 樱木花道 流川枫 龙猫 哈利波特 赫敏 甘道夫 夏洛克 福尔摩斯 钢铁侠 蝙蝠侠 蜘蛛侠 马里奥 路易吉 林克 塞尔达 星之卡比 劳拉 士官长 克劳德 春丽 不知火舞 但丁 桐生一马 奎托斯 旺达 GPT 豆包 DeepSeek Kimi Claude Codex'.split(' ');
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
