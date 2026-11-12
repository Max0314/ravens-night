/** One media element; a new user selection invalidates older play promises. */
export class AuditionPlayer {
  constructor(audio,notify=()=>{}) {
    this.audio=audio;this.notify=notify;this.token=0;this.current=undefined;
    for(const event of ['play','pause','ended'])audio.addEventListener(event,()=>this.notify({current:this.current,playing:!audio.paused,error:''}));
    audio.addEventListener('error',()=>this.notify({current:this.current,playing:false,error:'声音加载失败，请点击该素材重试。'}));
  }
  async select(row) {
    const token=++this.token;
    this.audio.pause();this.current=row;this.audio.src=row.file;this.audio.load();
    this.notify({current:row,playing:false,error:''});
    try {await this.audio.play();}catch(error){if(this.token===token&&error?.name!=='AbortError')this.notify({current:row,playing:false,error:'播放未开始，请再点击一次；也可尝试手机浏览器打开。'});}
  }
  pause(){++this.token;this.audio.pause();}
  toggle(row){if(this.current?.id!==row.id||this.audio.paused||this.audio.error)return this.selectOrResume(row);this.pause();}
  async selectOrResume(row){
    if(this.current?.id!==row.id||this.audio.error)return this.select(row);
    const token=++this.token;
    try{await this.audio.play();}catch(error){if(token===this.token&&error?.name!=='AbortError')this.notify({current:row,playing:false,error:'请再次点击播放。'});}
  }
}
