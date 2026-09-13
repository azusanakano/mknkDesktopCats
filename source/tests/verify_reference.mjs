import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ?require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const project=process.argv[2],n=384,assert=(v,m)=>{if(!v)throw new Error(m);};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const approved=[['yuri','78e670d6afe8cb87643abfe1c37089a4c433bcc639a6b40932921d4de5ff0bbe',364],
  ['onyankopon','555c51736a7b7078ab4c77686633d805a2b527367853ad58a2ab6d900f808ac2',343]];
const blob=fs.readFileSync(path.join(project,'build/assets/sprites.rle'));
const exe=fs.readFileSync(path.join(project,'dist/mknkDesktopCats.exe'));
assert(exe.indexOf(blob)>=0,'EXE does not contain current asset bundle');
let checked=0,visibleTotal=0,removedBrightPixels=0;const cats=[];
for(const [name,sha,ground] of approved){
  const input=fs.readFileSync(path.join(project,'art_source/reference',name+'_walk_sheet.jpeg'));
  assert(hash(input)===sha,'Original JPEG changed: '+name);
  const {data:rgb,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert(info.width===n*4&&info.height===n*2&&info.channels===3,'wrong original size');
  const sheet=await sharp(path.join(project,'build/assets',name+'_walk8.png')).raw().toBuffer();
  assert(sheet.length===n*n*8*4,'wrong transparent sheet size');
  const fileCount=fs.readdirSync(path.join(project,'build/assets/walk')).filter(x=>x.startsWith(name+'_walk_')&&x.endsWith('.png')).length;
  assert(fileCount===8,'Expected exactly eight frame PNGs');
  const frames=[];let maximumBottom=0;
  for(let slot=0;slot<8;slot++){
    const png=await sharp(path.join(project,'build/assets/walk',`${name}_walk_${String(slot+1).padStart(2,'0')}.png`)).raw().toBuffer();
    assert(png.length===n*n*4,'wrong frame size');
    const left=slot%4*n,top=Math.floor(slot/4)*n;let visible=0,bottom=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const p=(y*n+x)*4,s=((top+y)*n*4+left+x)*3,t=((top+y)*n*4+left+x)*4;
      assert(png[p]===rgb[s]&&png[p+1]===rgb[s+1]&&png[p+2]===rgb[s+2],`Decoded JPEG RGB/crop changed: ${name} F${slot+1}`);
      assert(png.subarray(p,p+4).equals(sheet.subarray(t,t+4)),'Frame / contact sheet differs');
      const a=png[p+3];assert(a===0||a===255,'Unexpected mask alpha');
      if(a){visible++;bottom=Math.max(bottom,y+1);}
      else if(Math.max(rgb[s],rgb[s+1],rgb[s+2])>80)removedBrightPixels++;
      checked++;
    }
    assert(visible>20000&&visible<80000,'Unexpected visible pixels');
    visibleTotal+=visible;maximumBottom=Math.max(maximumBottom,bottom);
    frames.push({frame:slot+1,crop:{x:left,y:top,width:n,height:n},visiblePixels:visible,groundExclusive:bottom,rgbaSha256:hash(png)});
  }
  assert(maximumBottom===ground,'Fixed placement ground does not match asset maximum');
  assert(new Set(frames.map(f=>f.rgbaSha256)).size===8,'Duplicate pose');
  cats.push({name,sourceSha256:sha,frames});
}
for(const text of ['mknkDesktopCats','\\mknkDesktopCats','\\settings.ini','v1.8.1'])assert(exe.includes(Buffer.from(text,'utf16le')),'Missing app identity/version');
const report={result:'PASS',version:'1.8.1',cats,allSourceRgbPixelsChecked:checked,exactSourceRgbPixels:checked,
  visiblePixels:visibleTotal,removedBrightPixels,sourceRgbOrCoordinateMismatches:0,
  sourcePoseWarp:false,sourceFrameReordering:false,sourcePerFrameAlignment:false,
  alphaEstimated:true,alphaGroundTruthAvailable:false,embeddedAssetBytesVerified:blob.length,
  exeBytes:exe.length,exeSha256:hash(exe),normalCycleMs:1200,cycleMs:{slow:2400,normal:1200,fast:800},
  windowsDesktopLaunchTested:false,windowsCpuMeasured:false};
fs.writeFileSync(path.join(project,'build/reference-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({result:'PASS',cats:2,framesPerCat:8,exactSourceRgbPixels:checked,removedBrightPixels,alphaEstimated:true,embeddedAssetBytesVerified:blob.length}));
