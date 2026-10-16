// Only opaque public account keys select local UI namespaces. No credential is stored here.
let context='guest';
try{context=sessionStorage.getItem('ravens_account_context')??'guest';}catch{}
export const roomSessionKey=()=>context==='guest'?'ravens_room_session':`ravens_room_session:account:${context}`;
if(typeof window!=='undefined')window.addEventListener('fribench:account-change',event=>{
  const detail=(event as CustomEvent<{authenticated:boolean;accountKey?:string}>).detail;
  const next=detail?.authenticated&&detail.accountKey?detail.accountKey:'guest';if(next===context)return;
  context=next;try{sessionStorage.setItem('ravens_account_context',next);}catch{}
  window.location.reload();
});
