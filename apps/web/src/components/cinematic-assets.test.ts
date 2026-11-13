import {guillotineGeometry} from './public-motion.js';
import {expect,test} from 'vitest';
test('new vapor uses green RGB across visible alpha rather than a white matte',async()=>{
 const {default:sharp}=await import('sharp');const {readFileSync}=await import('node:fs');
 const {data}=await sharp(readFileSync(new URL('../../public/art/effects/v5/poison-vapour.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let visible=0,white=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]!>20){visible++;if(data[i]!>data[i+1]!*.65+6||data[i+2]!>data[i+1]!*.4+6)white++;}
 expect(visible).toBeGreaterThan(1000);expect(white).toBe(0);
});

test('large portrait aperture matches the actual broad frame transparency',async()=>{
 const {default:sharp}=await import('sharp');const {readFileSync}=await import('node:fs');
 const {data,info}=await sharp(readFileSync(new URL('../../public/art/effects/v6/guillotine-frame.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),g=guillotineGeometry;
 const alpha=(x:number,y:number)=>{const px=Math.round((x-g.frame.x)/g.frame.width*info.width),py=Math.round((y-g.frame.y)/g.frame.height*info.height);return data[(py*info.width+px)*4+3]!;};
 expect(g.neck.diameter).toBeGreaterThan(80);expect(g.frame.width/g.frame.height).toBeGreaterThan(1);
 for(let i=0;i<12;i++){const a=i*Math.PI/6;expect(alpha(g.neck.x+Math.cos(a)*g.neck.diameter*.42,g.neck.y+Math.sin(a)*g.neck.diameter*.42)).toBeLessThan(8);}
 expect(alpha(g.neck.x,g.neck.y)).toBe(0);
 expect(alpha(g.neck.x+g.neck.diameter*.65,g.neck.y)).toBeGreaterThan(200);
});

test('actual wide steel edge passes the whole portrait aperture by impact',async()=>{
 const {default:sharp}=await import('sharp');const {readFileSync}=await import('node:fs');
 const {data,info}=await sharp(readFileSync(new URL('../../public/art/effects/v6/guillotine-blade.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true}),g=guillotineGeometry;
 for(let x=g.neck.x-g.neck.diameter/2;x<=g.neck.x+g.neck.diameter/2;x+=2){
  const px=Math.round((x-g.blade.x)/g.blade.width*info.width);let bottom=-1;
  for(let y=0;y<info.height;y++)if(data[(y*info.width+px)*4+3]!>150)bottom=y;
  expect(bottom).toBeGreaterThan(0);
  const edgeAtImpact=g.blade.y+g.blade.travel+bottom/info.height*g.blade.height;
  expect(edgeAtImpact).toBeGreaterThan(g.neck.y+g.neck.diameter/2);
 }
});
