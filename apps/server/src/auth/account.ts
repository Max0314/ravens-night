export type Account = {sub:string;name:string};
export function accountClient(secret=process.env.FRIBENCH_CLIENT_SECRET,origin=process.env.PUBLIC_ORIGIN??'https://clocktower.fribench.cn',fetcher:typeof fetch=fetch){
  const cache=new Map<string,{expires:number;pending:Promise<Account|null>}>();
  return async(header:string|undefined):Promise<Account|null>=>{
    const cookie=header?.split(';').map(value=>value.trim()).find(value=>value.startsWith('__Host-fribench_ravens_night='));
    if(!cookie||!/^__Host-fribench_ravens_night=[\w-]{43}$/.test(cookie))return null;
    if(!secret)throw Error('账号验证暂时不可用');
    const previous=cache.get(cookie);if(previous&&previous.expires>Date.now())return previous.pending;
    const entry={expires:Date.now()+5000,pending:(async()=>{
      const response=await fetcher(process.env.FRIBENCH_IDENTITY_ENDPOINT??'http://fribench-services-api-1:8080/internal/identity',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{host:new URL(origin).host,'x-fribench-app':'ravens-night',authorization:'Basic '+Buffer.from('fribench-ravens-night:'+secret).toString('base64'),cookie}});
      if(!response.ok)throw Error('账号验证暂时不可用');const value=await response.json() as {authenticated:boolean;sub?:string;name?:string};
      if(!value.authenticated)return null;if(!value.sub||typeof value.sub!=='string')throw Error('账号验证暂时不可用');return{sub:value.sub,name:value.name??'朋友'};
    })()};
    if(cache.size>=256)cache.clear();cache.set(cookie,entry);try{return await entry.pending;}catch(error){cache.delete(cookie);throw error;}
  };
}
