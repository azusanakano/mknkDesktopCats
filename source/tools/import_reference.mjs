import fs from 'node:fs';
import crypto from 'node:crypto';

// The two exact JPEG sheets supplied for v1.9.3. Their original file bytes are
// retained. Cropping and the chroma matte do not recolor the decoded RGB; a
// separate uniform resampling step fits the existing 425px runtime canvas.
export const SOURCES = Object.freeze({
  yuri: Object.freeze({
    file:'yuri_walk_sheet.jpg',
    sha256:'9d989f4a5198569387e402bdc47518928fd62902f97861d848a4e32da4be4e75',
    width:2048,height:1024,rowOrigins:Object.freeze([21,504]),
    rowHeights:Object.freeze([512,512]),groundExclusive:349
  }),
  onyankopon: Object.freeze({
    file:'onyankopon_walk_sheet.jpg',
    sha256:'212a0fb69d8d926dbbc690d1a731e8a91266433d86be05c6c5a47cf8644dfb66',
    width:2048,height:1012,rowOrigins:Object.freeze([21,501]),
    rowHeights:Object.freeze([512,511]),groundExclusive:349
  })
});
export const SOURCE_WIDTH = 2048;
// Legacy/default exports describe yuri. Use SOURCES[name] for each actual sheet.
export const SOURCE_HEIGHT = 1024;
export const SOURCE_CELL_SIZE = 512;
export const CELL_SIZE = 425;
export const FRAME_COUNT = 8;
export const COLUMN_BOUNDS = Object.freeze([0,512,1024,1536,2048]);
export const ROW_ORIGINS = SOURCES.yuri.rowOrigins;
export const ROW_HEIGHTS = SOURCES.yuri.rowHeights;
export const RESIZE_KERNEL = 'lanczos3';
export const CYCLE_MS = Object.freeze({slow:2400,normal:1200,fast:800});
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function keyedAlpha(r,g,b,sourceAlpha) {
  const excess=g-Math.max(r,b);
  if(excess<=8) return sourceAlpha;
  if(excess>=40) return 0;
  return Math.round(sourceAlpha*(40-excess)/32);
}

function measure(rgba,width,height) {
  let visible=0,partial=0,opaque=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const a=rgba[(y*width+x)*4+3];
    if(!a) continue;
    visible++;if(a===255) opaque++;else partial++;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  return {visiblePixels:visible,opaquePixels:opaque,partialAlphaPixels:partial,
    bounds:{minX,minY,maxX,maxY},groundExclusive:maxY+1};
}

export async function importReference(sharp,inputPath,name) {
  const input=fs.readFileSync(inputPath),spec=SOURCES[name];
  if(!spec || hash(input)!==spec.sha256) throw new Error(`Unapproved source: ${name}`);
  const {data:source,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==spec.width || info.height!==spec.height || info.channels!==4)
    throw new Error(`Expected the supplied ${spec.width} x ${spec.height} JPEG for ${name}`);

  // Full-width fixed cells retain the original column positions. Row origins
  // remove only green margins, not pose-specific pixels. The overlapping row
  // margins must also contain no foreground so no cat is duplicated or clipped.
  let omittedBackgroundPixels=0,overlapBackgroundPixels=0;
  for(let y=0;y<spec.height;y++) {
    const uses=spec.rowOrigins.reduce((count,top,row)=>
      count+Number(y>=top && y<top+spec.rowHeights[row]),0);
    if(uses===1) continue;
    for(let x=0;x<spec.width;x++) {
      const p=(y*spec.width+x)*4;
      if(keyedAlpha(source[p],source[p+1],source[p+2],source[p+3])!==0)
        throw new Error(`${name}: non-background pixel in ${uses?'overlapping':'omitted'} margin (${x},${y})`);
      if(uses===0) omittedBackgroundPixels++;else overlapBackgroundPixels++;
    }
  }

  const n=CELL_SIZE,s=SOURCE_CELL_SIZE,cells=[],records=[];
  for(let slot=0;slot<FRAME_COUNT;slot++) {
    const col=slot%4,row=Math.floor(slot/4);
    const left=COLUMN_BOUNDS[col],top=spec.rowOrigins[row];
    const width=s,height=spec.rowHeights[row];
    const preResize=Buffer.alloc(s*s*4),cropRgb=Buffer.alloc(width*height*3);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const p=(y*s+x)*4,t=((top+y)*spec.width+left+x)*4,q=(y*width+x)*3;
      const r=source[t],g=source[t+1],b=source[t+2];
      // Copy decoded RGB verbatim, including pixels whose new alpha is zero.
      // No green de-spill, color correction, body warp, or component filtering.
      preResize[p]=r;preResize[p+1]=g;preResize[p+2]=b;
      cropRgb[q]=r;cropRgb[q+1]=g;cropRgb[q+2]=b;
      preResize[p+3]=keyedAlpha(r,g,b,source[t+3]);
    }
    const sourceStats=measure(preResize,s,s);
    if(sourceStats.visiblePixels<50000 || sourceStats.visiblePixels>90000)
      throw new Error(`${name} F${slot+1}: bad source coverage ${sourceStats.visiblePixels}`);
    const b=sourceStats.bounds;
    if(b.minX<2 || b.minY<2 || b.maxX>=width-2 || b.maxY>=height-2)
      throw new Error(`${name} F${slot+1}: clipped source foreground`);

    // All sixteen whole-frame cells use exactly the same scale. This is spatial
    // resampling only: no new animation frames or individual pose translations.
    const cell=await sharp(preResize,{raw:{width:s,height:s,channels:4}})
      .resize(n,n,{fit:'fill',kernel:RESIZE_KERNEL}).raw().toBuffer();
    const stats=measure(cell,n,n);
    if(stats.visiblePixels<30000 || stats.visiblePixels>65000)
      throw new Error(`${name} F${slot+1}: bad runtime coverage ${stats.visiblePixels}`);
    if(stats.groundExclusive>spec.groundExclusive)
      throw new Error(`${name} F${slot+1}: foreground exceeds fixed ground`);
    cells.push(cell);
    records.push({frame:slot+1,crop:{x:left,y:top,width,height},
      sourceCellSize:s,padding:{right:s-width,bottom:s-height},
      resized:{width:n,height:n},scale:n/s,
      resampling:{kernel:RESIZE_KERNEL,scaleX:n/s,scaleY:n/s,alphaAware:true},
      cropRgbSha256:hash(cropRgb),preResizeRgbaSha256:hash(preResize),
      preResizeRgbPreserved:true,sourceBounds:sourceStats.bounds,
      sourceGroundExclusive:sourceStats.groundExclusive,
      ...stats,rgbaSha256:hash(cell)});
  }
  return {cells,report:{name,source:spec.file,sha256:hash(input),
    sourceWidth:spec.width,sourceHeight:spec.height,sourceFormat:'jpeg',
    sourceBytesPreserved:true,columns:4,rows:2,columnBounds:COLUMN_BOUNDS,
    rowOrigins:spec.rowOrigins,rowHeights:spec.rowHeights,sourceCellSize:s,cellSize:n,
    rowLayoutNormalization:true,
    rowLayoutNote:'Fixed row origins per supplied sheet; omitted and overlapping margins verified green. Shared source columns and uniform whole-frame 425/512 scaling; no individual pose alignment or redraw.',
    omittedBackgroundPixels,omittedForegroundPixels:0,
    overlapBackgroundPixels,overlapForegroundPixels:0,
    frames:records,order:'row-major: F01..F08',perFrameTranslation:false,
    poseWarp:false,interpolation:false,temporalInterpolation:false,
    spatialResampling:true,resampling:{kernel:RESIZE_KERNEL,width:n,height:n,scaleX:n/s,scaleY:n/s,alphaAware:true},
    preResizeRgbPreserved:true,sourceRgbPreserved:false,rgbModified:true,
    rgbModificationNote:'Decoded source RGB is copied exactly during crop/keying; alpha-aware uniform spatial resampling changes runtime RGB. No recoloring or green de-spill is applied.',
    alphaMethod:'Before resizing, alpha-only green chroma key: excess = G - max(R,B); preserve source alpha at excess <= 8, zero at >= 40, linear coverage between. Decoded source RGB stays unchanged until the whole RGBA cell is uniformly resampled.',
    alphaKey:{excessOpaqueMax:8,excessTransparentMin:40,sourceAlphaPreservedOrReduced:true},
    alphaGroundTruthAvailable:false,sourceHasTiming:false,defaultCycleMs:1200,cycleMs:CYCLE_MS,
    displayGroundExclusive:spec.groundExclusive}};
}
