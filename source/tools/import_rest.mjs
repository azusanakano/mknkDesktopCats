import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {CELL_SIZE,FRAME_COUNT as WALK_COUNT} from './import_reference.mjs';

// The original six authored nonwalking poses are restored from the lossless
// source sheets, not from the damaged 256px uniform-grid runtime crops.
// In particular, stretched paws and raised tails crossed the old grid lines.
export const REST_ACTIONS=Object.freeze(['sit','sleep','stretch','paw','jump','alert']);
export const REST_COUNT=REST_ACTIONS.length;
export const REST_GROUND=349;
export const REST_SOURCES=Object.freeze({
  yuri:{file:'yuri_green.png',sha256:'772171219af97671b62e5d0ae758aca1edf29dbce4e393db5bad31d79d482307',
    scale:1.025,rects:[[106,377,306,671],[364,474,671,659],[677,373,1041,685],
      [1118,428,1390,673],[24,718,310,982],[322,721,636,999]]},
  onyankopon:{file:'onyankopon_green.png',sha256:'781c359d466ae83fa1521149ec5c951e1ebe2314d39e3e9cd8f3a39a09b614a5',
    scale:1.08,rects:[[103,365,282,660],[374,488,658,655],[691,371,1073,674],
      [1123,432,1421,660],[47,701,311,950],[422,704,645,992]]}
});
export const REST=Object.freeze(REST_ACTIONS.map((action,index)=>Object.freeze({
  action,legacyFrame:4+index,runtimeFrame:WALK_COUNT+index
})));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const byte=x=>Math.max(0,Math.min(255,Math.round(x)));

// Match v1.3.1's green-screen alpha and edge decontamination formula.
function legacyChroma(rgb) {
  const out=Buffer.alloc(rgb.length/3*4);
  for(let p=0,q=0;p<rgb.length;p+=3,q+=4) {
    const r=rgb[p],g=rgb[p+1],b=rgb[p+2],excess=g-Math.max(r,b);
    const a=g>150&&excess>=125?0:g>115&&excess>38?byte((125-excess)*255/87):255;
    if(!a) continue;
    const coverage=a/255;
    out[q]=byte(r/coverage);out[q+1]=byte((g-(1-coverage)*255)/coverage);
    out[q+2]=byte(b/coverage);out[q+3]=a;
  }
  return out;
}

// Remove detached pen marks/dust just as the old importer did, now on one
// complete cat instead of an arbitrary grid cell that could cut off paws.
function cleanEdges(rgba,w,h) {
  const labels=new Int32Array(w*h),queue=new Int32Array(w*h);
  let label=0,largest=0,largestSize=0;
  for(let i=0;i<w*h;i++) {
    if(labels[i]||rgba[i*4+3]<=8) continue;
    label++;let head=0,tail=1;queue[0]=i;labels[i]=label;
    while(head<tail) {
      const p=queue[head++],x=p%w,y=Math.floor(p/w);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if(!dx&&!dy) continue;
        const nx=x+dx,ny=y+dy;
        if(nx<0||nx>=w||ny<0||ny>=h) continue;
        const next=ny*w+nx;
        if(!labels[next]&&rgba[next*4+3]>8) {labels[next]=label;queue[tail++]=next;}
      }
    }
    if(tail>largestSize) {largest=label;largestSize=tail;}
  }
  let removedPixels=0;
  for(let i=0;i<w*h;i++) if(labels[i]&&labels[i]!==largest) {
    rgba.fill(0,i*4,i*4+4);removedPixels++;
  }
  const original=Buffer.from(rgba);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const p=(y*w+x)*4,a=original[p+3];if(!a) continue;
    let edge=a<250;
    for(let dy=-2;!edge&&dy<=2;dy++) for(let dx=-2;!edge&&dx<=2;dx++) {
      const nx=x+dx,ny=y+dy;
      if(nx>=0&&nx<w&&ny>=0&&ny<h&&original[(ny*w+nx)*4+3]<12) edge=true;
    }
    if(edge) rgba[p+1]=Math.min(rgba[p+1],Math.max(rgba[p],rgba[p+2])+3);
  }
  return removedPixels;
}

function bounds(rgba,w,h) {
  let minX=w,minY=h,maxX=-1,maxY=-1,visiblePixels=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(rgba[(y*w+x)*4+3]) {
    minX=Math.min(minX,x);minY=Math.min(minY,y);
    maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);visiblePixels++;
  }
  if(!visiblePixels) throw new Error('Empty restored pose');
  return {minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1,visiblePixels};
}

export async function importRest(sharp,sourceDir,name) {
  const spec=REST_SOURCES[name];if(!spec) throw new Error(`Unknown cat: ${name}`);
  const source=fs.readFileSync(path.join(sourceDir,spec.file));
  if(hash(source)!==spec.sha256) throw new Error(`Unapproved restored source: ${name}`);
  const meta=await sharp(source).metadata();
  if(meta.width!==1448||meta.height!==1086) throw new Error('Unexpected original rest sheet dimensions');
  const cells=[],records=[];
  for(const mapping of REST) {
    const index=mapping.legacyFrame-4;
    const [x,y,right,bottom]=spec.rects[index];
    const sourceRect={left:x,top:y,width:right-x,height:bottom-y};
    const rgb=await sharp(source).removeAlpha().extract(sourceRect).raw().toBuffer();
    const keyed=legacyChroma(rgb),w=sourceRect.width,h=sourceRect.height;
    const removedDetachedPixels=cleanEdges(keyed,w,h);
    const originalBounds=bounds(keyed,w,h);
    if(originalBounds.minX<1||originalBounds.minY<1||originalBounds.maxX>=w-1||originalBounds.maxY>=h-1)
      throw new Error(`${name}/${mapping.action}: original pose touches extraction boundary`);
    // One scale per cat for all six complete poses. No limb transforms,
    // per-pose stretch or new paintings. Scale is a display choice, not a
    // measurement of real anatomy or gait.
    const width=Math.round(w*spec.scale),height=Math.round(h*spec.scale);
    const scaled=await sharp(keyed,{raw:{width:w,height:h,channels:4}})
      .resize(width,height,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer();
    const scaledBounds=bounds(scaled,width,height);
    const left=Math.round((CELL_SIZE-scaledBounds.width)/2)-scaledBounds.minX;
    const top=REST_GROUND-1-scaledBounds.maxY;
    if(left<0||top<0||left+width>CELL_SIZE||top+height>CELL_SIZE)
      throw new Error(`${name}/${mapping.action}: normalized pose exceeds canvas`);
    const cell=Buffer.alloc(CELL_SIZE*CELL_SIZE*4);
    for(let row=0;row<height;row++) scaled.copy(cell,((top+row)*CELL_SIZE+left)*4,row*width*4,(row+1)*width*4);
    const outputBounds=bounds(cell,CELL_SIZE,CELL_SIZE);
    if(outputBounds.minX<1||outputBounds.minY<1||outputBounds.maxX>=CELL_SIZE-1||outputBounds.maxY+1!==REST_GROUND)
      throw new Error(`${name}/${mapping.action}: restored pose clipping or floor mismatch`);
    cells.push(cell);
    records.push({...mapping,sourceRect,sourceBounds:originalBounds,removedDetachedPixels,
      keyedCropRgbaSha256:hash(keyed),outputPlacement:{left,top,width,height},outputBounds,
      groundExclusive:outputBounds.maxY+1,rgbaSha256:hash(cell)});
  }
  return {cells,report:{name,source:spec.file,sha256:spec.sha256,sourceVersion:'1.3.1',
    sourceWidth:meta.width,sourceHeight:meta.height,cellSize:CELL_SIZE,
    displayGroundExclusive:REST_GROUND,wholeImageScale:spec.scale,sourcePosePreserved:true,
    wholeImagePlacement:true,poseWarp:false,newArtwork:false,originalRuntimeCropTruncationCorrected:true,
    alphaGroundTruthAvailable:false,
    alphaMethod:'Original v1.3.1 green-screen key, largest foreground component cleanup, and edge green decontamination.',
    displayScaleNote:'Fixed per-cat whole-body scale approximates current walk body height; historical artwork retains its original fur pattern and drawing style.',
    frames:records}};
}
