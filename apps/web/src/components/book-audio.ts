/** A short paper rustle, started only by a handbook gesture. */
export function createBookAudio() {
  let context: AudioContext | undefined, playing: AudioBufferSourceNode | undefined, disposed = false, sequence=0;
  const silence=()=>{sequence++;try{playing?.stop();}catch{/* Already stopped. */}playing=undefined;};
  return {
    turn() {
      const Audio = window.AudioContext ?? (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
      if (!Audio || disposed) return;
      try {
        context ??= new Audio();
        const ctx=context, requested=performance.now(), request=++sequence;
        const play=()=>{
          if(disposed || request!==sequence || ctx.state!=='running' || performance.now()-requested>250)return;
          try{playing?.stop();}catch{/* The previous page has finished. */}
          const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.19),ctx.sampleRate),data=buffer.getChannelData(0);
          for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/data.length);
          const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
          source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1500;filter.Q.value=.55;gain.gain.value=.055;
          source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);playing=source;
          source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();if(playing===source)playing=undefined;};
          source.start();
        };
        if(ctx.state==='running')play();else void ctx.resume().then(play).catch(()=>{});
      } catch { /* Audio restrictions never block navigation. */ }
    },
    silence,
    dispose() { disposed=true;silence();if(context)void context.close().catch(()=>{}); },
  };
}
