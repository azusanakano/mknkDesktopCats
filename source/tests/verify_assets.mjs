import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const file=process.argv[2];
if(!file) throw new Error('sprites.rle path is required');
const blob=fs.readFileSync(file),project=path.resolve(path.dirname(file),'../..');
assert(blob.length>=24,'truncated asset header');
assert(blob.subarray(0,4).toString('ascii')==='MKCT','bad asset magic');
const version=blob.readUInt32LE(4),width=blob.readUInt32LE(8),height=blob.readUInt32LE(12),cats=blob.readUInt32LE(16),frames=blob.readUInt32LE(20);
assert(version===1&&width===256&&height===256&&cats===2&&frames===8,'bad asset header');
const approved=[['yuri','0bf76a9c44b7e02f58e3a2d83c40de963538bf1e03c5196661f9e2f2e954d1a8'],
  ['onyankopon','964d41964b7e778b4803a8ae94d38733edfdb64f56b513e146e7449c888043a0']];
const sourceRgba=[];
for(const [name,expected] of approved){
  const bytes=fs.readFileSync(path.join(project,'art_source/reference',name+'_walk_sheet.png'));
  assert(hash(bytes)===expected,'source hash mismatch: '+name);
  const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  assert(info.width===1024&&info.height===512&&info.channels===4,'source must be 1024 x 512 RGBA');
  sourceRgba.push(data);
}
const hashes=new Set(),coverages=[];
let nextOffset=24+cats*frames*8,checkedPixels=0,partialAlphaPixels=0;
assert(blob.length>=nextOffset,'truncated asset table');
for(let index=0;index<cats*frames;index++){
  const offset=blob.readUInt32LE(24+index*8),size=blob.readUInt32LE(28+index*8);
  assert(offset===nextOffset&&size>0&&offset+size<=blob.length,`frame ${index}: bad/non-contiguous range`);
  nextOffset=offset+size;
  const output=Buffer.alloc(width*height*4);
  let source=offset,pixel=0;
  while(source<offset+size&&pixel<width*height){
    const tag=blob[source++],run=tag&0x7f;
    assert(run&&pixel+run<=width*height,`frame ${index}: bad run`);
    if(tag&0x80) pixel+=run;
    else{
      const bytes=run*4;
      assert(source+bytes<=offset+size,`frame ${index}: truncated pixels`);
      blob.copy(output,pixel*4,source,source+bytes);source+=bytes;pixel+=run;
    }
  }
  assert(pixel===width*height&&source===offset+size,`frame ${index}: incomplete decode`);
  const rgba=sourceRgba[Math.floor(index/frames)],slot=index%frames,left=slot%4*256,top=Math.floor(slot/4)*256;
  let visible=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4,s=((top+y)*1024+left+x)*4,a=rgba[s+3];
    assert(output[p]===Math.round(rgba[s+2]*a/255)&&output[p+1]===Math.round(rgba[s+1]*a/255)&&output[p+2]===Math.round(rgba[s]*a/255)&&output[p+3]===a,
      `frame ${index}: premultiplied source mismatch at ${x},${y}`);
    if(a)visible++;if(a>0&&a<255)partialAlphaPixels++;checkedPixels++;
  }
  assert(visible>0,`frame ${index}: empty frame`);
  coverages.push(visible/(width*height));hashes.add(hash(output));
}
assert(nextOffset===blob.length,'trailing bytes in asset bundle');
assert(hashes.size===cats*frames,'duplicate sprite frames detected');
assert(partialAlphaPixels>0,'native partial alpha was lost');
console.log(JSON.stringify({result:'PASS',version,width,height,cats,frames,encodedBytes:blob.length,
  uniqueFrames:hashes.size,sourcePremultipliedPixelsChecked:checkedPixels,partialAlphaPixels,
  minCoverage:Math.min(...coverages),maxCoverage:Math.max(...coverages)},null,2));
