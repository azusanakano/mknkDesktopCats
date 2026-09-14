import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SOURCES} from './import_reference.mjs';
const [,,project,output]=process.argv;
if(!project||!output) throw new Error('usage: build_reference_viewer.mjs <source-dir> <output.html>');
const artwork=path.join(project,'build/assets');
const reports=JSON.parse(fs.readFileSync(path.join(artwork,'reference-import.json'),'utf8'));
const asset=JSON.parse(fs.readFileSync(path.join(artwork,'asset-report.json'),'utf8'));
const restReports=JSON.parse(fs.readFileSync(path.join(artwork,'rest-import.json'),'utf8'));
const restActions=['sit','sleep','stretch','paw','jump','alert'];
const walkingFrames=asset.walkingFramesPerCat;
if(walkingFrames!==8 || asset.framesPerCat!==walkingFrames+restActions.length)
  throw new Error('Expected eight walking frames and six restored poses');
const data=Object.entries(SOURCES).map(([name,source])=>{
  const report=reports[name];
  const original=fs.readFileSync(path.join(project,'art_source/reference',source.file));
  if(crypto.createHash('sha256').update(original).digest('hex')!==source.sha256) throw new Error(`Unapproved source: ${name}`);
  if(report.sha256!==source.sha256 || report.cellSize!==asset.width ||
     report.frames.length!==walkingFrames) throw new Error(`Stale import report: ${name}`);
  const restReport=restReports[name];
  if(!restReport || restReport.cellSize!==asset.width)
    throw new Error(`Missing or stale restored-pose report: ${name}`);
  const rest=Object.fromEntries(restActions.map(action=>[action,
    'data:image/png;base64,'+fs.readFileSync(path.join(artwork,'rest',`${name}_${action}.png`)).toString('base64')]));
  return {name,groundExclusive:report.displayGroundExclusive,
    restGroundExclusive:restReport.displayGroundExclusive,rest,
    sourceWidth:report.sourceWidth,sourceHeight:report.sourceHeight,sourceCellSize:report.sourceCellSize,
    columns:report.columns,rows:report.rows,crops:report.frames.map(frame=>frame.crop),
    original:'data:image/jpeg;base64,'+original.toString('base64'),
    sheet:'data:image/png;base64,'+fs.readFileSync(path.join(artwork,name+'_walk8.png')).toString('base64')};
});
const template=fs.readFileSync(path.join(project,'tools/walk_viewer_template.html'),'utf8');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,template.replace('__IMAGE_DATA__',JSON.stringify(data))
  .replaceAll('__APP_VERSION__',asset.version)
  .replace('__VIEWER_CONFIG__',JSON.stringify({cellSize:asset.width,frames:walkingFrames,
    restActions,cycleMs:asset.cycleMs,
    commonGround:Math.max(...data.flatMap(p=>[p.groundExclusive,p.restGroundExclusive]))})));
console.log('Two-cat offline viewer written: 8 walking frames and 6 restored poses per cat');
