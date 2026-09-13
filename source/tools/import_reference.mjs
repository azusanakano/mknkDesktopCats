import fs from 'node:fs';
import crypto from 'node:crypto';

export const SOURCES = Object.freeze({
  yuri: {file:'yuri_walk_sheet.png',sha256:'0bf76a9c44b7e02f58e3a2d83c40de963538bf1e03c5196661f9e2f2e954d1a8',groundExclusive:242},
  onyankopon: {file:'onyankopon_walk_sheet.png',sha256:'964d41964b7e778b4803a8ae94d38733edfdb64f56b513e146e7449c888043a0',groundExclusive:228}
});
export const CELL_SIZE = 256;
export const FRAME_COUNT = 8;
export const CYCLE_MS = Object.freeze({slow:2400,normal:1200,fast:800});
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

// These exact PNGs were supplied on 2026-09-13. Copy every source RGBA byte,
// including transparent RGB. No matte, recoloring, translation, or new poses.
export async function importReference(sharp,inputPath,name) {
  const source=SOURCES[name],input=fs.readFileSync(inputPath);
  if(!source || hash(input)!==source.sha256) throw new Error(`Unapproved source: ${name}`);
  const metadata=await sharp(input).metadata();
  if(metadata.format!=='png'||metadata.width!==1024||metadata.height!==512||metadata.channels!==4||!metadata.hasAlpha||metadata.depth!=='uchar')
    throw new Error('Expected the supplied 1024 x 512 RGBA PNG');
  const {data:rgba,info}=await sharp(input).raw().toBuffer({resolveWithObject:true});
  if(info.width!==1024||info.height!==512||info.channels!==4) throw new Error('Unexpected source decode');
  const n=CELL_SIZE,cells=[],records=[];
  for(let slot=0;slot<FRAME_COUNT;slot++) {
    const left=(slot%4)*n,top=Math.floor(slot/4)*n,cell=Buffer.alloc(n*n*4);
    for(let y=0;y<n;y++) rgba.copy(cell,y*n*4,((top+y)*1024+left)*4,((top+y)*1024+left+n)*4);
    let visible=0,partial=0,minX=n,minY=n,maxX=-1,maxY=-1;
    for(let p=0;p<n*n;p++) {
      const a=cell[p*4+3];
      if(!a) continue;
      visible++;if(a<255) partial++;
      minX=Math.min(minX,p%n);maxX=Math.max(maxX,p%n);
      minY=Math.min(minY,Math.floor(p/n));maxY=Math.max(maxY,Math.floor(p/n));
    }
    if(!visible) throw new Error(`${name} F${slot+1}: empty source frame`);
    cells.push(cell);
    records.push({frame:slot+1,crop:{x:left,y:top,width:n,height:n},visiblePixels:visible,
      partialAlphaPixels:partial,bounds:{minX,minY,maxX,maxY},rgbaSha256:hash(cell)});
  }
  return {cells,report:{name,source:source.file,sha256:hash(input),sourceWidth:1024,sourceHeight:512,
    columns:4,rows:2,cellSize:n,frames:records,order:'row-major: F01..F08',perFrameTranslation:false,
    poseWarp:false,interpolation:false,rgbModified:false,alphaModified:false,
    alphaMethod:'original PNG alpha preserved byte-for-byte',sourceHasTiming:false,
    defaultCycleMs:CYCLE_MS.normal,cycleMs:CYCLE_MS,displayGroundExclusive:source.groundExclusive}};
}
