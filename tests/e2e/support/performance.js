// Local test server only. Observes real UI playback; never drives or mutates the game.
const report=document.createElement('output');report.id='local-performance-report';report.hidden=true;document.body.append(report);
let run=0,active;
const foreground=()=>document.visibilityState==='visible'&&document.hasFocus();
const checkForeground=()=>{if(active&&!foreground())active.foregroundThroughout=false;};
document.addEventListener('visibilitychange',checkForeground);window.addEventListener('blur',checkForeground);
const publish=()=>{report.textContent=JSON.stringify(active?.result??{state:'idle'});};publish();
const failures=[];window.addEventListener('error',event=>{const target=event.target;if(target instanceof HTMLImageElement||target instanceof SVGImageElement)failures.push(target.currentSrc||target.getAttribute('href')||target.getAttribute('src'));},true);
if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{if(active)active.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));}).observe({type:'longtask',buffered:true});
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button');if(!button||!button.textContent.includes('天亮 ·'))return;
 const serial=++run,start=performance.now(),gaps=[],firstFailure=failures.length;let last=start;active={tasks:[],foregroundThroughout:foreground(),result:{state:'sampling',label:button.textContent.trim()}};publish();
 const frame=now=>{if(serial!==run)return;checkForeground();gaps.push(now-last);last=now;if(now-start<6800){requestAnimationFrame(frame);return;}
  const sorted=gaps.slice(2).sort((a,b)=>a-b),percentile=q=>Number((sorted[Math.floor((sorted.length-1)*q)]??0).toFixed(2));
  const valid=active.foregroundThroughout;
  active.result={state:'complete',label:button.textContent.trim(),foregroundThroughout:valid,frameSampleValid:valid,frames:gaps.length,medianFrameMs:valid?percentile(.5):null,p95FrameMs:valid?percentile(.95):null,maxFrameMs:valid?percentile(1):null,framesOver50ms:valid?sorted.filter(v=>v>50).length:null,longTasks:active.tasks.filter(t=>t.start>=start),failedImages:failures.slice(firstFailure),resources:performance.getEntriesByType('resource').filter(r=>/\/art\/|\/assets\/|\/audio\//.test(r.name)).map(r=>({path:new URL(r.name).pathname,durationMs:Number(r.duration.toFixed(1)),transferBytes:r.transferSize,decodedBytes:r.decodedBodySize}))};publish();
 };requestAnimationFrame(frame);
},true);
