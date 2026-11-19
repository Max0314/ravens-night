import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import sharp from 'sharp';

const bundle=await build({entryPoints:['apps/web/src/components/night-arrival-motion.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {nightWindowAtlas,nightWindowRegions,nightWindowGrid:grid}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const plate=resolve('apps/web/public/art/effects/v5/night-town.webp');
const atlas=resolve('apps/web/public'+nightWindowAtlas);
await mkdir(resolve(atlas,'..'),{recursive:true});

const tiles=await Promise.all(nightWindowRegions.map(async (region,index)=>{
  const {x,y,width,height}=region;
  const source=await sharp(plate).extract({left:x,top:y,width,height}).removeAlpha().raw().toBuffer();
  const pixels=Buffer.alloc(width*height*4);
  for(let row=0;row<height;row++){
    for(let column=0;column<width;column++){
      const i=row*width+column,r=source[i*3],g=source[i*3+1],b=source[i*3+2];
      const light=Math.max(0,Math.min(1,(r+g-2*b-13)/48));
      const edge=Math.min(1,column/3,row/3,(width-1-column)/3,(height-1-row)/3);
      const unlit=Math.min(55,Math.round((r+g+b)*.16));
      pixels.set([Math.round(unlit*.69),Math.round(unlit*.88),unlit,Math.round(222*light*edge)],i*4);
    }
  }
  return {
    input:await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer(),
    left:index%grid.columns*grid.tileWidth+1,
    top:Math.floor(index/grid.columns)*grid.tileHeight+1,
  };
}));
await sharp({create:{width:grid.width,height:grid.height,channels:4,background:'#00000000'}})
  .composite(tiles).webp({lossless:true}).toFile(atlas);
