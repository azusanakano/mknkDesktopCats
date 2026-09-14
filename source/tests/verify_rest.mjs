// Validate restored-pose provenance and visible geometry independently of the
// importer. The newest walk files are covered by verify_reference.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ?require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const project=process.argv[2],n=425,ground=349;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const actions=['sit','sleep','stretch','paw','jump','alert'];
const approved={
  yuri:{sha256:'772171219af97671b62e5d0ae758aca1edf29dbce4e393db5bad31d79d482307',scale:1.025,
    rects:[[106,377,306,671],[364,474,671,659],[677,373,1041,685],[1118,428,1390,673],[24,718,310,982],[322,721,636,999]]},
  onyankopon:{sha256:'781c359d466ae83fa1521149ec5c951e1ebe2314d39e3e9cd8f3a39a09b614a5',scale:1.08,
    rects:[[103,365,282,660],[374,488,658,655],[691,371,1073,674],[1123,432,1421,660],[47,701,311,950],[422,704,645,992]]}
};
const reports=JSON.parse(fs.readFileSync(path.join(project,'build/assets/rest-import.json'),'utf8'));
let checkedPixels=0,coreSamples=0,sourceMarginPixels=0;
const allHashes=new Set(),cats=[];
for(const [name,spec] of Object.entries(approved)) {
  const input=fs.readFileSync(path.join(project,'art_source/rest',name+'_green.png'));
  assert(hash(input)===spec.sha256,`Original restored source changed: ${name}`);
  const {data:source,info:sourceInfo}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert(sourceInfo.width===1448&&sourceInfo.height===1086&&sourceInfo.channels===3,'Wrong historical source dimensions');
  const report=reports[name];
  assert(report.sha256===spec.sha256&&report.wholeImageScale===spec.scale,'Rest report source/scale mismatch');
  assert(report.frames.length===6&&report.cellSize===n&&report.displayGroundExclusive===ground,'Rest report geometry mismatch');
  const files=fs.readdirSync(path.join(project,'build/assets/rest')).filter(f=>f.startsWith(name+'_')&&f.endsWith('.png'));
  assert(files.length===6,`Unexpected restored file count: ${name}`);
  const catFrames=[];
  for(let index=0;index<6;index++) {
    const action=actions[index],frame=report.frames[index],[left,top,right,bottom]=spec.rects[index];
    const width=right-left,height=bottom-top;
    assert(frame.action===action&&frame.runtimeFrame===8+index&&frame.legacyFrame===4+index,'Rest action mapping changed');
    assert(JSON.stringify(frame.sourceRect)===JSON.stringify({left,top,width,height}),'Unapproved rest extraction rectangle');
    let edgeTotal=0,edgeGreen=0;
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(x===left||x===right-1||y===top||y===bottom-1) {
      const s=(y*1448+x)*3,r=source[s],g=source[s+1],b=source[s+2];
      edgeTotal++; if(g>150&&g-Math.max(r,b)>=125)edgeGreen++;
    }
    // Ony's paw crop has five detached neighboring ink pixels at the edge.
    // The intact cat is surrounded by green and has a four-pixel keyed margin.
    assert(edgeGreen/edgeTotal>=0.99,'Rest crop cuts through substantial foreground');
    sourceMarginPixels+=edgeGreen;
    const sb=frame.sourceBounds;
    assert(sb.minX>=4&&sb.minY>=4&&sb.maxX<=width-5&&sb.maxY<=height-5,'Historical cat reaches crop boundary');
    const {data:png,info}=await sharp(path.join(project,'build/assets/rest',`${name}_${action}.png`)).raw().toBuffer({resolveWithObject:true});
    assert(info.width===n&&info.height===n&&info.channels===4,'Wrong restored PNG geometry');
    assert(hash(png)===frame.rgbaSha256,'Rest PNG/report pixel hash mismatch');
    let minX=n,minY=n,maxX=-1,maxY=-1,visible=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
      const p=(y*n+x)*4,a=png[p+3];checkedPixels++;
      if(a) {minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);visible++;}
      if(x===0||y===0||x===n-1||y===n-1)assert(a===0,'Rest foreground clipped by output canvas');
    }
    assert(visible>n*n*.03&&visible<n*n*.60,'Rest foreground empty or covers background');
    assert(minX>=1&&minY>=1&&maxX<n-1&&maxY+1===ground,'Rest floor or output crop mismatch');
    const measured={minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1,visiblePixels:visible};
    assert(JSON.stringify(measured)===JSON.stringify(frame.outputBounds),'Reported/rest measured bounds disagree');
    const place=frame.outputPlacement;
    assert(place.width===Math.round(width*spec.scale)&&place.height===Math.round(height*spec.scale),'Rest body scale is not the fixed per-cat value');
    assert(Math.abs(measured.width/sb.width-spec.scale)<.06&&Math.abs(measured.height/sb.height-spec.scale)<.06,'Rest proportions changed');
    // Sample smooth, opaque source cores far from edges. Uniform scaling must
    // preserve their actual colors and alpha; do not trust a provenance flag.
    let samples=0;
    for(let sy=sb.minY+5;sy<=sb.maxY-5;sy+=4)for(let sx=sb.minX+5;sx<=sb.maxX-5;sx+=4) {
      const sp=((top+sy)*1448+left+sx)*3;
      const rgb=[source[sp],source[sp+1],source[sp+2]],low=[...rgb],high=[...rgb];
      let flat=true;
      for(let dy=-4;dy<=4&&flat;dy++)for(let dx=-4;dx<=4&&flat;dx++) {
        const q=((top+sy+dy)*1448+left+sx+dx)*3;
        if(source[q+1]>115&&source[q+1]-Math.max(source[q],source[q+2])>38)flat=false;
        for(let c=0;c<3;c++){low[c]=Math.min(low[c],source[q+c]);high[c]=Math.max(high[c],source[q+c]);}
        if(high.some((v,c)=>v-low[c]>64))flat=false;
      }
      if(!flat)continue;
      const dx=place.left+Math.floor((sx+.5)*place.width/width),dy=place.top+Math.floor((sy+.5)*place.height/height);
      const q=(dy*n+dx)*4;
      assert(png[q+3]===255&&rgb.every((v,c)=>png[q+c]>=low[c]-2&&png[q+c]<=high[c]+2),`Rest core color/position changed: ${name}/${action}`);
      samples++;
    }
    assert(samples>20,`Not enough independent rest core samples: ${name}/${action}`);
    coreSamples+=samples; allHashes.add(frame.rgbaSha256);
    catFrames.push({action,runtimeFrame:frame.runtimeFrame,rgbaSha256:frame.rgbaSha256,coreSamples:samples,groundExclusive:maxY+1});
  }
  cats.push({name,sourceSha256:spec.sha256,sourceVersion:'1.3.1',frames:catFrames});
}
assert(allHashes.size===12,'Duplicate restored poses');
const result={result:'PASS',version:fs.readFileSync(path.join(project,'VERSION'),'utf8').trim(),cats,restoredFrames:12,pixelsChecked:checkedPixels,independentSourceCoreSamples:coreSamples,
  historicalCropGreenMarginPixels:sourceMarginPixels,sourcePoseWarp:false,groundExclusive:ground,windowsDesktopLaunchTested:false};
fs.writeFileSync(path.join(project,'build/rest-validation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({result:'PASS',restoredFrames:12,pixelsChecked:checkedPixels,independentSourceCoreSamples:coreSamples,groundExclusive:ground}));
