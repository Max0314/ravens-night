// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {decodePageImages,PageTextureCache,preparePagePair} from './page-textures.js';
const capture=vi.hoisted(()=>({run:vi.fn()}));
vi.mock('html2canvas',()=>({default:capture.run}));
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks();document.body.innerHTML='';});
test('timeout does not start a second capture; invalidated late canvases are discarded',async()=>{
  vi.useFakeTimers();let finish!:(canvas:HTMLCanvasElement)=>void;
  capture.run.mockImplementationOnce(()=>new Promise<HTMLCanvasElement>(resolve=>{finish=resolve;})).mockResolvedValueOnce(document.createElement('canvas'));
  const cache=new PageTextureCache(),element=document.createElement('div');element.textContent='public handbook';document.body.append(element);
  const first=cache.prepare('first',element,300,600);await vi.waitFor(()=>expect(capture.run).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(201);expect(await first).toBeUndefined();
  const second=cache.prepare('second',element,300,600);expect(capture.run).toHaveBeenCalledOnce();
  cache.invalidate();const old=document.createElement('canvas');old.width=300;finish(old);await vi.waitFor(()=>expect(old.width).toBe(0));
  expect(await second).toBeUndefined();expect(document.querySelector('.guide-capture-host')).toBeNull();cache.dispose();
});

test('prewarming waits for the current page before queuing a neighbor behind an invalidated in-flight capture',async()=>{
  vi.useFakeTimers();let finish!:(canvas:HTMLCanvasElement)=>void;
  const current=document.createElement('canvas'),neighbor=document.createElement('canvas');
  capture.run.mockImplementationOnce(()=>new Promise<HTMLCanvasElement>(resolve=>{finish=resolve;})).mockResolvedValueOnce(current).mockResolvedValueOnce(neighbor);
  const cache=new PageTextureCache(),element=document.createElement('div');element.textContent='public page';document.body.append(element);
  const old=cache.prepare('old',element,300,600);await vi.waitFor(()=>expect(capture.run).toHaveBeenCalledOnce());cache.invalidate();
  const warm=preparePagePair(cache,{key:'current',element,width:300,height:600},{key:'neighbor',element,width:300,height:600},()=>true);
  expect(capture.run).toHaveBeenCalledOnce();finish(document.createElement('canvas'));await old;await warm;
  expect(capture.run).toHaveBeenCalledTimes(3);expect(cache.get('current')).toBe(current);expect(cache.get('neighbor')).toBe(neighbor);expect(cache.get('old')).toBeUndefined();cache.dispose();
});


test('filtered paintings keep their original lighting and skip unsupported raster capture',async()=>{
  const cache=new PageTextureCache(),element=document.createElement('div'),image=document.createElement('img');image.style.filter='brightness(0.77) saturate(0.7)';element.append(image);document.body.append(element);
  expect(await cache.prepare('filtered',element,300,600)).toBeUndefined();expect(capture.run).not.toHaveBeenCalled();expect(image.style.filter).toBe('brightness(0.77) saturate(0.7)');expect(document.querySelector('.guide-capture-host')).toBeNull();cache.dispose();
});


test('prewarming decodes the actual painting and frame nodes without replacing them or failing the whole page on one decode error',async()=>{
  const root=document.createElement('div'),painting=document.createElement('img'),frame=document.createElement('img');painting.decode=vi.fn(async()=>{});frame.decode=vi.fn(async()=>{throw Error('unavailable frame');});root.append(painting,frame);
  await decodePageImages(root);expect(painting.decode).toHaveBeenCalledOnce();expect(frame.decode).toHaveBeenCalledOnce();expect(root.children[0]).toBe(painting);expect(root.children[1]).toBe(frame);expect(capture.run).not.toHaveBeenCalled();
});

test('masked full art stays on the live DOM renderer so its image-to-copy fade is preserved',async()=>{
  const cache=new PageTextureCache(),element=document.createElement('div'),image=document.createElement('img');image.style.maskImage='linear-gradient(black, transparent)';element.append(image);document.body.append(element);
  expect(await cache.prepare('masked',element,300,600)).toBeUndefined();expect(capture.run).not.toHaveBeenCalled();expect(image.style.maskImage).toBe('linear-gradient(black, transparent)');cache.dispose();
});
