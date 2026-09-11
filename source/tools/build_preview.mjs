import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const sharp = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp')) : require('sharp');
const [,, oldBlobPath, newBlobPath, outDir] = process.argv;
if (!oldBlobPath || !newBlobPath || !outDir) throw new Error('old sprites.rle, new sprites.rle, output directory required');
const oldBlob = fs.readFileSync(oldBlobPath), newBlob = fs.readFileSync(newBlobPath);
const walkIds = [0,12,1,13,2,14,3,15];
fs.mkdirSync(outDir, {recursive:true});
function decode(blob, index) {
  let p = blob.readUInt32LE(24+index*8), pixel=0;
  const end=p+blob.readUInt32LE(28+index*8), out=Buffer.alloc(256*256*4);
  while(p<end){
    const tag=blob[p++],run=tag&127;
    if(tag&128) pixel+=run;
    else {
      for(let i=0;i<run;i++,pixel++,p+=4){
        const q=pixel*4,a=blob[p+3];
        out[q]=a?Math.min(255,Math.round(blob[p+2]*255/a)):0;
        out[q+1]=a?Math.min(255,Math.round(blob[p+1]*255/a)):0;
        out[q+2]=a?Math.min(255,Math.round(blob[p]*255/a)):0;
        out[q+3]=a;
      }
    }
  }
  return out;
}
const sprites=[[],[]];
for(let cat=0;cat<2;cat++){
  for(let i=0;i<4;i++) sprites[cat].push(await sharp(decode(oldBlob,cat*12+i),
    {raw:{width:256,height:256,channels:4}}).png().toBuffer());
  for(let i=0;i<8;i++) sprites[cat].push(await sharp(decode(newBlob,cat*16+walkIds[i]),
    {raw:{width:256,height:256,channels:4}}).png().toBuffer());
}
const bg=Buffer.from(`<svg width="600" height="610" xmlns="http://www.w3.org/2000/svg">
<rect width="600" height="610" fill="#f1f3f4"/>
<path d="M 300 42 V 578" stroke="#c6cdd3"/>
<g font-family="sans-serif" font-size="20" fill="#263344" text-anchor="middle">
<text x="150" y="29">Before: 4 frames</text><text x="450" y="29">v1.1.0: 8 frames</text></g>
<g font-family="sans-serif" font-size="14" fill="#536276">
<text x="22" y="65">Yuri</text><text x="22" y="338">Onyankopon</text>
<text x="22" y="600">Sprite comparison / normal speed / 600 ms per cycle</text></g>
<path d="M 16 300 H 584 M 16 570 H 584" stroke="#b7c0c6"/>
</svg>`);
for(let t=0;t<120;t++){
  const oldFrame=Math.floor(t/6)%4, newFrame=Math.floor(t/3)%8;
  const png=await sharp(bg).composite([
    {input:sprites[0][oldFrame],left:16,top:58},
    {input:sprites[0][4+newFrame],left:316,top:58},
    {input:sprites[1][oldFrame],left:16,top:328},
    {input:sprites[1][4+newFrame],left:316,top:328},
  ]).png().toBuffer();
  fs.writeFileSync(path.join(outDir,`frame-${String(t).padStart(3,'0')}.png`),png);
}
console.log('preview: 120 frames at 40 fps, five walk cycles, original and new embedded sprites');
