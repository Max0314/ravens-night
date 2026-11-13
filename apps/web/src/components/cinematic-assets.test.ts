import {expect,test} from 'vitest';
test('new vapor uses green RGB across visible alpha rather than a white matte',async()=>{
 const {default:sharp}=await import('sharp');const {readFileSync}=await import('node:fs');
 const {data}=await sharp(readFileSync(new URL('../../public/art/effects/v5/poison-vapour.webp',import.meta.url))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let visible=0,white=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]!>20){visible++;if(data[i]!>data[i+1]!*.65+6||data[i+2]!>data[i+1]!*.4+6)white++;}
 expect(visible).toBeGreaterThan(1000);expect(white).toBe(0);
});
