import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const project=process.argv[2],assert=(ok,why)=>{if(!ok)throw new Error(why);};
if(!project)throw new Error('source project path is required');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const approved=[['yuri','0bf76a9c44b7e02f58e3a2d83c40de963538bf1e03c5196661f9e2f2e954d1a8'],
  ['onyankopon','964d41964b7e778b4803a8ae94d38733edfdb64f56b513e146e7449c888043a0']];
const blob=fs.readFileSync(path.join(project,'build/assets/sprites.rle'));
const exe=fs.readFileSync(path.join(project,'dist/mknkDesktopCats.exe'));
assert(blob.subarray(0,4).toString()==='MKCT'&&blob.readUInt32LE(4)===1&&blob.readUInt32LE(8)===256&&blob.readUInt32LE(12)===256&&blob.readUInt32LE(16)===2&&blob.readUInt32LE(20)===8,'Unexpected asset header');
assert(exe.indexOf(blob)>=0,'EXE does not contain the exact tested asset bundle');
function decode(index){
  const output=Buffer.alloc(256*256*4);
  let offset=blob.readUInt32LE(24+index*8),end=offset+blob.readUInt32LE(28+index*8),pixel=0;
  assert(offset>=152&&end<=blob.length,'Invalid RLE range');
  while(offset<end){
    const tag=blob[offset++],run=tag&127;
    assert(run&&pixel+run<=256*256,'Invalid RLE');
    if(!(tag&128)){assert(offset+run*4<=end,'Truncated RLE');blob.copy(output,pixel*4,offset,offset+run*4);offset+=run*4;}
    pixel+=run;
  }
  assert(pixel===256*256&&offset===end,'Incomplete RLE');return output;
}
let rgbaChecks=0,foregroundPixels=0,partialAlphaPixels=0;const cats=[];
for(let cat=0;cat<2;cat++){
  const [name,expected]=approved[cat];
  const source=fs.readFileSync(path.join(project,'art_source/reference',name+'_walk_sheet.png'));
  assert(hash(source)===expected,'User-supplied source changed: '+name);
  const {data:rgba,info}=await sharp(source).raw().toBuffer({resolveWithObject:true});
  assert(info.width===1024&&info.height===512&&info.channels===4,'Unexpected source dimensions/alpha');
  const sheet=fs.readFileSync(path.join(project,'build/assets',name+'_walk8.png'));
  assert(source.equals(sheet),'Contact sheet must retain exact source file bytes: '+name);
  const frameFiles=fs.readdirSync(path.join(project,'build/assets/walk')).filter(f=>f.startsWith(name+'_walk_')&&f.endsWith('.png'));
  assert(frameFiles.length===8,'Expected exactly eight frame files: '+name);
  const frames=[];
  for(let slot=0;slot<8;slot++){
    const raw=decode(cat*8+slot);
    const {data:png,info:pngInfo}=await sharp(path.join(project,'build/assets/walk',`${name}_walk_${String(slot+1).padStart(2,'0')}.png`)).raw().toBuffer({resolveWithObject:true});
    assert(pngInfo.width===256&&pngInfo.height===256&&pngInfo.channels===4,'Unexpected frame dimensions/alpha');
    const left=slot%4*256,top=Math.floor(slot/4)*256;
    let visible=0,partial=0;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const q=(y*256+x)*4,s=((top+y)*1024+left+x)*4,a=rgba[s+3];
      assert(png[q]===rgba[s]&&png[q+1]===rgba[s+1]&&png[q+2]===rgba[s+2]&&png[q+3]===a,
        `Original RGBA or crop coordinate changed: ${name} F${slot+1} ${x},${y}`);
      assert(raw[q]===Math.round(rgba[s+2]*a/255)&&raw[q+1]===Math.round(rgba[s+1]*a/255)&&raw[q+2]===Math.round(rgba[s]*a/255)&&raw[q+3]===a,
        `Embedded premultiplied BGRA changed: ${name} F${slot+1} ${x},${y}`);
      rgbaChecks++;if(a){visible++;foregroundPixels++;}if(a>0&&a<255){partial++;partialAlphaPixels++;}
    }
    frames.push({frame:slot+1,assetIndex:cat*8+slot,visiblePixels:visible,partialAlphaPixels:partial,rgbaSha256:hash(png),premultipliedBgraSha256:hash(raw)});
  }
  assert(new Set(frames.map(f=>f.rgbaSha256)).size===8,'Repeated frame: '+name);
  cats.push({name,sourceSha256:hash(source),frames});
}
for(const text of ['mknkDesktopCats','\\mknkDesktopCats','\\settings.ini','v1.8.0'])
  assert(exe.includes(Buffer.from(text,'utf16le')),'Missing expected identity/version: '+text);
assert(partialAlphaPixels>0,'Native partial alpha is missing');
const report={result:'PASS',version:'1.8.0',cats,allSourcePixelsChecked:rgbaChecks,
  exactOriginalRgbaPixels:rgbaChecks,exactVisibleRgbAtOriginalCoordinates:foregroundPixels,partialAlphaPixels,
  rgbaOrCoordinateMismatches:0,sourcePoseWarp:false,sourceFrameReordering:false,sourcePerFrameAlignment:false,
  embeddedAssetBytesVerified:blob.length,exeBytes:exe.length,exeSha256:hash(exe),
  transparency:'original PNG alpha preserved byte-for-byte; embedded display pixels premultiplied BGRA',
  originalImageContainsTiming:false,normalCycleMs:1200,cycleMs:{slow:2400,normal:1200,fast:800},
  windowsDesktopLaunchTested:false,windowsCpuMeasured:false};
fs.writeFileSync(path.join(project,'build/reference-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({result:'PASS',cats:2,framesPerCat:8,allSourcePixelsChecked:rgbaChecks,
  exactOriginalRgbaPixels:rgbaChecks,partialAlphaPixels,embeddedAssetBytesVerified:blob.length}));
