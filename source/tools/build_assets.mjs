import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {importReference,SOURCES,CELL_SIZE,FRAME_COUNT,CYCLE_MS} from './import_reference.mjs';
const require=createRequire(import.meta.url);
const sharp=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp')):require('sharp');
const [,,sourceDir,outputDir]=process.argv;
if(!sourceDir||!outputDir) throw new Error('usage: build_assets.mjs <reference-dir> <output-dir>');
const n=CELL_SIZE,frames=[],reports={};
for(const dir of [outputDir,path.join(outputDir,'walk')]) fs.mkdirSync(dir,{recursive:true});
// Remove only obsolete generated frames from the superseded 16-frame build.
for(const name of Object.keys(SOURCES)) {
  fs.rmSync(path.join(outputDir,`${name}_walk16.png`),{force:true});
  for(let i=9;i<=16;i++) fs.rmSync(path.join(outputDir,'walk',`${name}_walk_${String(i).padStart(2,'0')}.png`),{force:true});
}
function encode(rgba) {
  const chunks=[];
  for(let p=0;p<n*n;) {
    const transparent=rgba[p*4+3]===0;
    let run=1;
    while(run<127&&p+run<n*n&&(rgba[(p+run)*4+3]===0)===transparent) run++;
    chunks.push(Buffer.from([run|(transparent?128:0)]));
    if(!transparent) {
      const bgra=Buffer.alloc(run*4);
      for(let i=0;i<run;i++) {
        const q=(p+i)*4,d=i*4,a=rgba[q+3];
        bgra[d]=Math.round(rgba[q+2]*a/255);bgra[d+1]=Math.round(rgba[q+1]*a/255);
        bgra[d+2]=Math.round(rgba[q]*a/255);bgra[d+3]=a;
      }
      chunks.push(bgra);
    }
    p+=run;
  }
  return Buffer.concat(chunks);
}
for(const name of Object.keys(SOURCES)) {
  const sourcePath=path.join(sourceDir,SOURCES[name].file);
  const {cells,report}=await importReference(sharp,sourcePath,name);
  for(let slot=0;slot<FRAME_COUNT;slot++) {
    const png=await sharp(cells[slot],{raw:{width:n,height:n,channels:4}})
      .png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    fs.writeFileSync(path.join(outputDir,'walk',`${name}_walk_${String(slot+1).padStart(2,'0')}.png`),png);
    frames.push(encode(cells[slot]));
  }
  // Assemble fixed cells without moving them or changing any decoded RGB.
  const sheet=Buffer.alloc(n*4*n*2*4);
  for(let slot=0;slot<FRAME_COUNT;slot++) for(let y=0;y<n;y++) {
    const dest=((Math.floor(slot/4)*n+y)*n*4+(slot%4)*n)*4;
    cells[slot].copy(sheet,dest,y*n*4,(y+1)*n*4);
  }
  await sharp(sheet,{raw:{width:n*4,height:n*2,channels:4}})
    .png({compressionLevel:9,adaptiveFiltering:true}).toFile(path.join(outputDir,`${name}_walk8.png`));
  reports[name]=report;
}
const header=Buffer.alloc(24+frames.length*8);header.write('MKCT',0,'ascii');
[1,n,n,2,FRAME_COUNT].forEach((v,i)=>header.writeUInt32LE(v,4+i*4));
let offset=header.length;
frames.forEach((bytes,i)=>{header.writeUInt32LE(offset,24+i*8);header.writeUInt32LE(bytes.length,28+i*8);offset+=bytes.length;});
const blob=Buffer.concat([header,...frames]);
fs.writeFileSync(path.join(outputDir,'sprites.rle'),blob);
fs.writeFileSync(path.join(outputDir,'reference-import.json'),JSON.stringify(reports,null,2));
fs.writeFileSync(path.join(outputDir,'asset-report.json'),JSON.stringify({version:'1.8.1',width:n,height:n,cats:2,
  framesPerCat:FRAME_COUNT,walkingFramesPerCat:FRAME_COUNT,frameOrder:'F01..F08',normalCycleMs:CYCLE_MS.normal,
  cycleMs:CYCLE_MS,encodedBytes:blob.length,uncompressedBytes:2*FRAME_COUNT*n*n*4,
  sourceRgbPreserved:true,alphaEstimated:true,displayFormat:'premultiplied BGRA'},null,2));
console.log(`sprites: 2 cats x ${FRAME_COUNT} frames, ${n} x ${n}, ${blob.length} bytes`);
