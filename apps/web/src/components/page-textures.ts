type Capture={key:string;generation:number;element:HTMLElement;width:number;height:number;done:(canvas:HTMLCanvasElement|undefined)=>void};
export const releaseTexture=(canvas:HTMLCanvasElement)=>{canvas.width=0;canvas.height=0;};

/** html2canvas cannot be aborted: timed-out work keeps the single flight until it settles. */
export class PageTextureCache {
  private generation=0;private running=false;private queued:Capture|undefined;private disposed=false;
  private textures=new Map<string,HTMLCanvasElement>();
  get epoch(){return this.generation;}
  get(key:string){return this.textures.get(key);}
  retain(keys:string[]){for(const[key,canvas]of this.textures)if(!keys.includes(key)){releaseTexture(canvas);this.textures.delete(key);}}
  invalidate(){this.generation++;for(const canvas of this.textures.values())releaseTexture(canvas);this.textures.clear();this.queued?.done(undefined);this.queued=undefined;}
  dispose(){this.disposed=true;this.invalidate();}
  prepare(key:string,element:HTMLElement,width:number,height:number):Promise<HTMLCanvasElement|undefined>{
    if(this.disposed||width<=0||height<=0)return Promise.resolve(undefined);
    const existing=this.get(key);if(existing)return Promise.resolve(existing);
    return new Promise(resolve=>{
      this.queued?.done(undefined);
      this.queued={key,element,width,height,generation:this.generation,done:resolve};
      this.pump();
    });
  }
  private pump(){
    if(this.running||!this.queued||this.disposed)return;
    const job=this.queued;this.queued=undefined;this.running=true;
    let delivered=false;const deliver=(canvas:HTMLCanvasElement|undefined)=>{if(delivered)return;delivered=true;job.done(canvas);};
    const timeout=window.setTimeout(()=>deliver(undefined),200);
    void this.capture(job).then(canvas=>{
      if(this.disposed||job.generation!==this.generation||delivered){if(canvas)releaseTexture(canvas);deliver(undefined);return;}
      if(canvas){this.textures.set(job.key,canvas);while(this.textures.size>2){const first=this.textures.keys().next().value!;releaseTexture(this.textures.get(first)!);this.textures.delete(first);}}
      deliver(canvas);
    }).catch(()=>deliver(undefined)).finally(()=>{window.clearTimeout(timeout);this.running=false;this.pump();});
  }
  private async capture(job:Capture){
    const original=[job.element,...job.element.querySelectorAll<HTMLElement>('*')];
    // html2canvas's renderer does not implement CSS filters. Keep filtered art on the live DOM path.
    if(original.some(node=>{const style=getComputedStyle(node),backdrop=style.backdropFilter||style.getPropertyValue('-webkit-backdrop-filter');return !!(style.filter&&style.filter!=='none'||backdrop&&backdrop!=='none');}))return undefined;
    const module=await import('html2canvas');
    if(this.disposed||job.generation!==this.generation)return undefined;
    const clone=job.element.cloneNode(true) as HTMLElement;
    const holder=document.createElement('div');holder.className='guide-sheet guide-capture-host';holder.setAttribute('aria-hidden','true');holder.inert=true;
    Object.assign(holder.style,{position:'fixed',left:'-20000px',top:'0',width:`${job.width}px`,height:`${job.height}px`,overflow:'hidden',pointerEvents:'none'});
    Object.assign(clone.style,{position:'relative',inset:'auto',width:`${job.width}px`,height:`${job.height}px`,opacity:'1',transform:'none',overflow:'hidden'});
    clone.removeAttribute('hidden');
    for(const node of [clone,...clone.querySelectorAll<HTMLElement>('*')]){
      node.removeAttribute('id');node.removeAttribute('tabindex');node.setAttribute('aria-hidden','true');
      for(const attr of Array.from(node.attributes))if(attr.name.startsWith('on'))node.removeAttribute(attr.name);
      if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node.isContentEditable){holder.remove();return undefined;}
    }
    // cloneNode does not preserve scroll offsets. Copy only the visible bounded page surface.
    const copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
    holder.append(clone);document.body.append(holder);
    for(let i=0;i<copies.length;i++){copies[i]!.scrollTop=original[i]?.scrollTop??0;copies[i]!.scrollLeft=original[i]?.scrollLeft??0;}
    try{
      await document.fonts?.ready;
      await Promise.allSettled(Array.from(clone.querySelectorAll('img')).map(img=>{
        if(new URL(img.currentSrc||img.src,location.href).origin!==location.origin){img.remove();return Promise.resolve();}
        img.loading='eager';return img.decode?.()??Promise.resolve();
      }));
      if(this.disposed||job.generation!==this.generation)return undefined;
      const scale=Math.min(1.5,1024/job.width,1536/job.height,Math.sqrt(1_600_000/(job.width*job.height)));
      // NodeNext models this CJS package's default as a namespace; Vite resolves its browser entry to the callable default.
      const render=module.default as unknown as (element:HTMLElement,options:Record<string,unknown>)=>Promise<HTMLCanvasElement>;
      return await render(clone,{allowTaint:false,useCORS:false,scale,width:job.width,height:job.height,windowWidth:window.innerWidth,windowHeight:window.innerHeight,backgroundColor:'#12100b',logging:false,removeContainer:true});
    }finally{holder.remove();}
  }
}

export interface PageTextureTarget {key:string;element:HTMLElement;width:number;height:number}
/** Keep the current page ahead of its speculative neighbor in the latest-only capture queue. */
export async function preparePagePair(cache:PageTextureCache,current:PageTextureTarget|undefined,neighbor:PageTextureTarget|undefined,isCurrent:()=>boolean){
  const generation=cache.epoch;
  if(current)await cache.prepare(current.key,current.element,current.width,current.height);
  if(cache.epoch!==generation||!isCurrent())return;
  if(neighbor)await cache.prepare(neighbor.key,neighbor.element,neighbor.width,neighbor.height);
}
