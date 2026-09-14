import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ?require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const project=process.argv[2],n=425,sourceCell=512,ground=349;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Independent approved-source constants: never import expectations from the
// production importer. JPEG source bytes remain exact; runtime RGB is resampled.
const columnOrigins=[0,512,1024,1536],scale=n/sourceCell;
const approved=[
  {name:'yuri',sha256:'9d989f4a5198569387e402bdc47518928fd62902f97861d848a4e32da4be4e75',
    sourceWidth:2048,sourceHeight:1024,rowOrigins:[21,504],rowHeights:[512,512]},
  {name:'onyankopon',sha256:'212a0fb69d8d926dbbc690d1a731e8a91266433d86be05c6c5a47cf8644dfb66',
    sourceWidth:2048,sourceHeight:1012,rowOrigins:[21,501],rowHeights:[512,511]}
];
const imports=JSON.parse(fs.readFileSync(path.join(project,'build/assets/reference-import.json'),'utf8'));
const blob=fs.readFileSync(path.join(project,'build/assets/sprites.rle'));
const exe=fs.readFileSync(path.join(project,'dist/mknkDesktopCats.exe'));
assert(exe.indexOf(blob)>=0,'EXE does not contain the complete current asset bundle');
assert(blob.subarray(0,4).toString()==='MKCT','Wrong RLE signature');
assert([1,n,n,2,14].every((value,i)=>blob.readUInt32LE(4+i*4)===value),'Wrong RLE geometry or frame counts');
function runtimeFrame(index) {
  let at=blob.readUInt32LE(24+index*8);
  const end=at+blob.readUInt32LE(28+index*8),out=Buffer.alloc(n*n*4);
  assert(at>=24+28*8&&end<=blob.length&&end>at,'Invalid runtime frame range');
  let pixel=0;
  while(at<end) {
    const tag=blob[at++],count=tag&127;
    assert(count>0&&pixel+count<=n*n,'Invalid runtime run');
    if(!(tag&128)) {
      assert(at+count*4<=end,'Truncated runtime pixel run');
      blob.copy(out,pixel*4,at,at+count*4);at+=count*4;
    }
    pixel+=count;
  }
  assert(pixel===n*n&&at===end,'Incomplete runtime frame');
  return out;
}
let preResizePixels=0,transformedPixels=0,visibleTotal=0,greenBackgroundRemoved=0;
let neutralCorePreserved=0,partialAlphaPixels=0,paddingPixels=0;
let discardedBackgroundPixels=0,reusedBackgroundPixels=0;
const cats=[];
for(let catIndex=0;catIndex<approved.length;catIndex++) {
  const spec=approved[catIndex],{name,sourceWidth,sourceHeight,rowOrigins,rowHeights}=spec;
  const input=fs.readFileSync(path.join(project,'art_source/reference',name+'_walk_sheet.jpg'));
  assert(hash(input)===spec.sha256,'Original uploaded JPEG bytes changed: '+name);
  const {data:original,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert(info.width===sourceWidth&&info.height===sourceHeight&&info.channels===4,'Wrong original geometry: '+name);
  const imported=imports[name];
  assert(imported.sha256===spec.sha256&&imported.sourceWidth===sourceWidth&&imported.sourceHeight===sourceHeight,'Import report source mismatch: '+name);
  assert(imported.frames.length===8&&imported.cellSize===n&&imported.displayGroundExclusive===ground,'Import report frame geometry mismatch');
  assert(same(imported.rowOrigins,rowOrigins)&&same(imported.rowHeights,rowHeights),'Unapproved row extraction geometry');
  const {data:sheet,info:sheetInfo}=await sharp(path.join(project,'build/assets',name+'_walk8.png')).raw().toBuffer({resolveWithObject:true});
  assert(sheetInfo.width===n*4&&sheetInfo.height===n*2&&sheetInfo.channels===4,'Wrong transparent contact sheet geometry');
  const files=fs.readdirSync(path.join(project,'build/assets/walk')).filter(x=>x.startsWith(name+'_walk_')&&x.endsWith('.png'));
  assert(files.length===8,'Expected exactly eight walking PNGs per cat');
  const usedSource=new Uint8Array(sourceWidth*sourceHeight),frames=[];
  let maximumBottom=0,catGreenRemoved=0,catNeutralPreserved=0,catDiscarded=0,catReused=0;
  for(let slot=0;slot<8;slot++) {
    const row=Math.floor(slot/4),col=slot%4,left=columnOrigins[col],top=rowOrigins[row];
    const width=sourceCell,height=rowHeights[row],crop={x:left,y:top,width,height};
    const padding={right:0,bottom:sourceCell-height},record=imported.frames[slot];
    assert(record.frame===slot+1&&same(record.crop,crop)&&same(record.padding,padding),'Frame order / crop / source padding changed');
    assert(record.sourceCellSize===sourceCell&&same(record.resized,{width:n,height:n})&&record.scale===scale,'Nonuniform or unapproved image scaling');
    const cropRgb=Buffer.alloc(width*height*3),keyed=Buffer.alloc(sourceCell*sourceCell*4);
    let greenRemoved=0,neutralPreserved=0;
    // Derive the pre-resize source crop and matte independently, including RGB
    // under transparent pixels. The cat receives no per-frame translation.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const sourcePixel=(top+y)*sourceWidth+left+x,s=sourcePixel*4;
      const p=(y*sourceCell+x)*4,q=(y*width+x)*3;
      const r=original[s],g=original[s+1],b=original[s+2],sourceAlpha=original[s+3];
      const excess=g-Math.max(r,b);
      const alpha=Math.round(sourceAlpha*Math.max(0,Math.min(1,(40-excess)/32)));
      cropRgb[q]=r;cropRgb[q+1]=g;cropRgb[q+2]=b;
      keyed[p]=r;keyed[p+1]=g;keyed[p+2]=b;keyed[p+3]=alpha;
      // The fixed row rectangles overlap only in empty inter-row background.
      if(usedSource[sourcePixel]) {
        assert(excess>=60&&alpha===0,'Source overlap duplicates visible foreground');catReused++;
      }
      usedSource[sourcePixel]++;
      if(excess>=60){assert(alpha===0,'Obvious green must be transparent');greenRemoved++;}
      if(excess<=0&&sourceAlpha){assert(alpha===sourceAlpha,'Neutral/brown/black fur must remain solid');neutralPreserved++;}
      preResizePixels++;
    }
    paddingPixels+=sourceCell*(sourceCell-height);
    assert(record.cropRgbSha256===hash(cropRgb),'Pre-resize source crop RGB hash mismatch: '+name+' F'+(slot+1));
    assert(record.preResizeRgbaSha256===hash(keyed),'Pre-resize alpha / RGB / padding hash mismatch: '+name+' F'+(slot+1));
    assert(greenRemoved>100000&&neutralPreserved>30000,'Missing source green background or solid fur core');
    const expected=await sharp(keyed,{raw:{width:sourceCell,height:sourceCell,channels:4}})
      .resize(n,n,{kernel:'lanczos3'}).raw().toBuffer();
    const {data:png,info:frameInfo}=await sharp(path.join(project,'build/assets/walk',`${name}_walk_${String(slot+1).padStart(2,'0')}.png`)).raw().toBuffer({resolveWithObject:true});
    assert(frameInfo.width===n&&frameInfo.height===n&&frameInfo.channels===4,'Wrong runtime walking PNG geometry');
    assert(png.equals(expected),`Uniformly resampled RGBA differs: ${name} F${slot+1}`);
    assert(record.rgbaSha256===hash(png),'Imported/runtime RGBA hash mismatch');
    for(let y=0;y<n;y++) {
      const sheetAt=((row*n+y)*n*4+col*n)*4;
      assert(png.subarray(y*n*4,(y+1)*n*4).equals(sheet.subarray(sheetAt,sheetAt+n*4)),'PNG / contact sheet frame order mismatch');
    }
    const raw=runtimeFrame(catIndex*14+slot);
    let visible=0,bottom=0,partial=0,opaque=0;
    for(let pixel=0;pixel<n*n;pixel++) {
      const p=pixel*4,a=png[p+3],x=pixel%n,y=Math.floor(pixel/n);
      assert(raw[p]===Math.round(png[p+2]*a/255)&&raw[p+1]===Math.round(png[p+1]*a/255)
        &&raw[p+2]===Math.round(png[p]*a/255)&&raw[p+3]===a,'Walking PNG / embedded runtime RLE differs');
      if(a){visible++;bottom=Math.max(bottom,y+1);if(a===255)opaque++;else partial++;}
      if(x===0||y===0||x===n-1||y===n-1)assert(a===0,'Foreground reaches runtime image boundary');
      transformedPixels++;
    }
    assert(visible>20000&&visible<80000&&opaque>20000,'Unexpected runtime visible/solid fur coverage');
    assert(bottom<=ground,'Runtime foreground exceeds preserved placement reference');
    assert(record.visiblePixels===visible&&record.groundExclusive===bottom,'Import report measured visibility mismatch');
    visibleTotal+=visible;maximumBottom=Math.max(maximumBottom,bottom);partialAlphaPixels+=partial;
    catGreenRemoved+=greenRemoved;catNeutralPreserved+=neutralPreserved;
    frames.push({frame:slot+1,crop,sourceCellSize:sourceCell,padding,resized:{width:n,height:n},scale,
      cropRgbSha256:hash(cropRgb),preResizeRgbaSha256:hash(keyed),rgbaSha256:hash(png),
      visiblePixels:visible,opaquePixels:opaque,groundExclusive:bottom,partialAlphaPixels:partial,
      sourceGreenBackgroundPixelsRemoved:greenRemoved,sourceNeutralCorePixelsPreserved:neutralPreserved});
  }
  for(let pixel=0;pixel<usedSource.length;pixel++)if(!usedSource[pixel]) {
    const s=pixel*4;
    assert(original[s+1]-Math.max(original[s],original[s+2])>=60,'Crop discarded non-background source pixels');catDiscarded++;
  }
  assert(maximumBottom<=ground&&maximumBottom>=ground-3,'Unexpected maximum foreground bottom');
  assert(new Set(frames.map(f=>f.cropRgbSha256)).size===8,'Duplicate source frame');
  assert(new Set(frames.map(f=>f.rgbaSha256)).size===8,'Duplicate transformed frame');
  greenBackgroundRemoved+=catGreenRemoved;neutralCorePreserved+=catNeutralPreserved;
  discardedBackgroundPixels+=catDiscarded;reusedBackgroundPixels+=catReused;
  cats.push({name,sourceSha256:spec.sha256,sourceWidth,sourceHeight,rowOrigins,rowHeights,
    displayGroundExclusive:ground,maximumVisibleBottom:maximumBottom,discardedBackgroundPixels:catDiscarded,
    reusedBackgroundPixels:catReused,frames});
}
const version=fs.readFileSync(path.join(project,'VERSION'),'utf8').trim();
assert(version==='1.9.3','Unexpected replacement release version');
for(const text of ['mknkDesktopCats','\\mknkDesktopCats','\\settings.ini','v'+version])
  assert(exe.includes(Buffer.from(text,'utf16le')),'Missing app identity/version: '+text);
assert(partialAlphaPixels>0,'Expected smooth matte/resampled alpha edges');
const report={result:'PASS',version,cats,walkingFramesPerCat:8,restFramesPerCat:6,totalFramesPerCat:14,
  walkSource:'2026-09-14 uploaded Gemini_Generated_Image JPEG sheets',originalSourceBytesVerified:true,
  sourceCropRgbPreservedBeforeResize:true,exactPreResizeSourceRgbPixels:preResizePixels,preResizeSourceRgbMismatches:0,
  sourceUniformScale:scale,sourceCellSize:sourceCell,runtimeRgbResampled:true,resamplingKernel:'lanczos3',
  transformedRgbaPixelsChecked:transformedPixels,transformedRgbaMismatches:0,
  walkPoseOrderMatchesNewSources:true,uniformResampledRgbaMatchesNewSources:true,
  visiblePixels:visibleTotal,greenBackgroundPixelsRemoved:greenBackgroundRemoved,neutralCorePixelsPreserved:neutralCorePreserved,
  partialAlphaPixels,paddingPixels,discardedBackgroundPixels,reusedBackgroundPixels,
  sourceCropCoordinateMismatches:0,sourcePoseWarp:false,sourceFrameReordering:false,sourcePerFrameAlignment:false,
  rowLayoutNormalization:true,cellSize:n,alphaEstimated:true,alphaGroundTruthAvailable:false,
  embeddedAssetBytesVerified:blob.length,runtimeWalkPremultipliedPixelsChecked:transformedPixels,
  exeBytes:exe.length,exeSha256:hash(exe),normalCycleMs:1200,cycleMs:{slow:2400,normal:1200,fast:800},
  windowsDesktopLaunchTested:false,windowsCpuMeasured:false};
fs.writeFileSync(path.join(project,'build/reference-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({result:'PASS',cats:2,framesPerCat:8,originalSourceBytesVerified:true,
  exactPreResizeSourceRgbPixels:preResizePixels,transformedRgbaPixelsChecked:transformedPixels,
  transformedRgbaMismatches:0,runtimeRgbResampled:true,resamplingKernel:'lanczos3',
  discardedBackgroundPixels,reusedBackgroundPixels,alphaEstimated:true,embeddedAssetBytesVerified:blob.length}));
