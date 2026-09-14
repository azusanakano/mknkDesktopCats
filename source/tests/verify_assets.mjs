import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ?require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const assert=(v,m)=>{if(!v)throw new Error(m);};
const blob=fs.readFileSync(process.argv[2]),n=425,framesPerCat=14,count=2*framesPerCat,hashes=new Set();
const restNames=['sit','sleep','stretch','paw','jump','alert'];
assert(blob.subarray(0,4).toString()==='MKCT','bad magic');
assert([1,n,n,2,framesPerCat].every((v,i)=>blob.readUInt32LE(4+i*4)===v),'bad asset header');
let next=24+count*8,checked=0,minCoverage=1,maxCoverage=0;
for(let index=0;index<count;index++){
  const start=blob.readUInt32LE(24+index*8),end=start+blob.readUInt32LE(28+index*8);
  assert(start===next&&end>start&&end<=blob.length,'bad frame range');next=end;
  const cat=index<framesPerCat?'yuri':'onyankopon',slot=index%framesPerCat;
  const pngPath=slot<8 ? path.join('walk',`${cat}_walk_${String(slot+1).padStart(2,'0')}.png`)
    : path.join('rest',`${cat}_${restNames[slot-8]}.png`);
  const {data:rgba,info}=await sharp(path.join(path.dirname(process.argv[2]),pngPath)).raw().toBuffer({resolveWithObject:true});
  assert(info.width===n&&info.height===n&&info.channels===4,'bad PNG format');
  assert(rgba.length===n*n*4,'bad PNG dimensions');
  const raw=Buffer.alloc(n*n*4);let at=start,pixel=0,visible=0;
  while(at<end){const tag=blob[at++],run=tag&127;assert(run&&pixel+run<=n*n,'bad run');
    if(!(tag&128)){assert(at+run*4<=end,'truncated run');blob.copy(raw,pixel*4,at,at+run*4);at+=run*4;}pixel+=run;}
  assert(pixel===n*n&&at===end,'incomplete frame');
  for(let p=0;p<n*n;p++){const q=p*4,a=rgba[q+3];
    assert(raw[q]===Math.round(rgba[q+2]*a/255)&&raw[q+1]===Math.round(rgba[q+1]*a/255)&&raw[q+2]===Math.round(rgba[q]*a/255)&&raw[q+3]===a,'PNG / RLE mismatch');
    if(a)visible++;checked++;
    if(p<n||p>=n*(n-1)||p%n===0||p%n===n-1)assert(a===0,'clipped foreground');
  }
  const c=visible/(n*n);assert(c>(slot<8?0.15:0.03)&&c<0.60,'bad mask coverage');
  minCoverage=Math.min(minCoverage,c);maxCoverage=Math.max(maxCoverage,c);
  hashes.add(crypto.createHash('sha256').update(raw).digest('hex'));
}
assert(next===blob.length&&hashes.size===count,'trailing data / repeated frames');
console.log(JSON.stringify({result:'PASS',width:n,height:n,cats:2,framesPerCat,walkingFramesPerCat:8,restFramesPerCat:6,uniqueFrames:hashes.size,encodedBytes:blob.length,premultipliedPixelsChecked:checked,minCoverage,maxCoverage},null,2));
