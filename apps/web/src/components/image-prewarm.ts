export type ImagePreparation={ready:string[];failed:string[];timedOut:string[]};
type LoadResult={src:string;status:'ready'|'failed'|'timedOut'};
type Entry={src:string;promise:Promise<LoadResult>;resolve:(result:LoadResult)=>void;image?:HTMLImageElement;status:'queued'|'loading'|'ready';bytes:number};
export const imagePrewarmLimits={entries:48,decodedBytes:32*1024*1024,concurrency:4,timeoutMs:4500} as const;

/** Holds only bounded image URLs/pixels, never scene payloads or private projections. */
export class ImagePrewarmCache{
 private entries=new Map<string,Entry>();private queue:Entry[]=[];private active=0;private bytes=0;
 ready(urls:readonly string[]){return new Set(urls.filter(src=>this.entries.get(src)?.status==='ready'));}
 async prepare(urls:readonly string[],onProgress?:(result:ImagePreparation)=>void):Promise<ImagePreparation>{
  const result:ImagePreparation={ready:[],failed:[],timedOut:[]};
  await Promise.all([...new Set(urls)].map(async src=>{const item=await this.load(src);result[item.status].push(src);onProgress?.({ready:[...result.ready],failed:[...result.failed],timedOut:[...result.timedOut]});}));return result;
 }
 private evict(){for(const [src,entry]of this.entries){if(entry.status!=='ready')continue;this.entries.delete(src);this.bytes-=entry.bytes;return true;}return false;}
 private load(src:string):Promise<LoadResult>{
  const found=this.entries.get(src);if(found){this.entries.delete(src);this.entries.set(src,found);return found.promise;}
  while(this.entries.size>=imagePrewarmLimits.entries)if(!this.evict())return Promise.resolve({src,status:'timedOut'});
  let settle!:(result:LoadResult)=>void;const promise=new Promise<LoadResult>(resolve=>{settle=resolve;}),entry:Entry={src,promise,resolve:settle,status:'queued',bytes:0};
  this.entries.set(src,entry);this.queue.push(entry);this.pump();return promise;
 }
 private pump(){while(this.active<imagePrewarmLimits.concurrency&&this.queue.length){const entry=this.queue.shift()!;this.start(entry);}}
 private start(entry:Entry){
  this.active++;entry.status='loading';let done=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const finish=(status:LoadResult['status'])=>{if(done)return;done=true;clearTimeout(timer);const image=entry.image;if(image){image.onload=null;image.onerror=null;}
   if(status==='ready'&&image){entry.status='ready';entry.bytes=image.naturalWidth*image.naturalHeight*4;this.bytes+=entry.bytes;while(this.bytes>imagePrewarmLimits.decodedBytes)if(!this.evict())break;}
   else{this.entries.delete(entry.src);image?.removeAttribute?.('src');}
   this.active--;entry.resolve({src:entry.src,status});this.pump();
  };
  if(typeof Image==='undefined'){finish('failed');return;}
  const image=new Image();entry.image=image;image.decoding='async';
  const usable=()=>image.naturalWidth>0&&image.naturalHeight>0;
  image.onload=()=>finish(usable()?'ready':'failed');image.onerror=()=>finish('failed');timer=setTimeout(()=>finish('timedOut'),imagePrewarmLimits.timeoutMs);
  image.src=entry.src;
  // onload + real dimensions is renderable even when WeChat rejects decode(). A hung decode never holds playback.
  if(image.complete){finish(usable()?'ready':'failed');return;}
  if(typeof image.decode==='function')void image.decode().then(()=>{if(usable())finish('ready');},()=>{if(image.complete&&!usable())finish('failed');});
 }
}
export const imagePrewarmCache=new ImagePrewarmCache();
export const prewarmImages=(urls:readonly string[],onProgress?:(result:ImagePreparation)=>void)=>imagePrewarmCache.prepare(urls,onProgress);
export const readyImages=(urls:readonly string[])=>imagePrewarmCache.ready(urls);
