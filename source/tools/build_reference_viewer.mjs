import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SOURCES,CELL_SIZE,FRAME_COUNT,CYCLE_MS} from './import_reference.mjs';
const [,,project,output]=process.argv;
if(!project||!output) throw new Error('usage: build_reference_viewer.mjs <source-dir> <output.html>');
const data=Object.entries(SOURCES).map(([name,source])=>{
  const original=fs.readFileSync(path.join(project,'art_source/reference',source.file));
  if(crypto.createHash('sha256').update(original).digest('hex')!==source.sha256) throw new Error(`Unapproved source: ${name}`);
  return {name,groundExclusive:source.groundExclusive,
    original:'data:image/png;base64,'+original.toString('base64'),
    sheet:'data:image/png;base64,'+fs.readFileSync(path.join(project,'build/assets',name+'_walk8.png')).toString('base64')};
});
const template=fs.readFileSync(path.join(project,'tools/walk_viewer_template.html'),'utf8');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,template.replace('__IMAGE_DATA__',JSON.stringify(data))
  .replace('__VIEWER_CONFIG__',JSON.stringify({cellSize:CELL_SIZE,frames:FRAME_COUNT,cycleMs:CYCLE_MS,commonGround:242})));
console.log('Two-cat 8-frame offline viewer written');
