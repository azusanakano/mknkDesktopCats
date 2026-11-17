import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const project=process.argv[2];
const baseline=JSON.parse(fs.readFileSync(path.join(project,'tests/preserved-v1.9.0.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const base192=JSON.parse(fs.readFileSync(path.join(project,'tests/base-v1.9.2.json'),'utf8'));
// Remove the specific Onyankopon-only rendering hooks before comparing
// the rest of main.c against the immutable baselines.
const stripPawHold=s=>s
  .replace('#include "onyankopon_walk.h"\n','')
  .replace('  int renderedPawShift;\n','')
  .replace('int size, frame, hearts, pawShift, sameContent;','int size, frame, hearts, sameContent;')
  .replace('  pawShift = pet->id == 1 && frame < FRAME_SIT ? onyankopon_paw_shift(&pet->reference, (unsigned int)size) : 0;\n','')
  .replace('pet->renderedHearts == hearts &&\n                pet->renderedPawShift == pawShift;', 'pet->renderedHearts == hearts;')
  .replace('  if (pawShift) onyankopon_hold_forepaws(pet->pixels, size, pet->direction, pawShift);\n','')
  .replace('    pet->renderedPawShift = pawShift;\n','');
const existingSource=file=>{
  const text=fs.readFileSync(path.join(project,file),'utf8').replaceAll('\r\n','\n');
  return file==='src/main.c'?stripPawHold(text):text;
};
for(const [file,expected] of Object.entries(base192.unchangedRuntimeFiles))
  assert(hash(existingSource(file))===expected,`Runtime outside the forepaw correction changed: ${file}`);
// Exclude only the explicitly requested version UI integration. The remaining
// main.c code and all original motion files must still match v1.9.0 exactly.
const normalize=s=>s.replace(/v1\.9\.[012]/g,'vVERSION')
  .replace('#include "version_ui.h"\n','')
  .replaceAll('(const WCHAR*)APP_TITLE_VERSION_W','W("ゆりちゃん ＆ オニャンコポン  vVERSION")')
  .replace('  CALL(AppendMenuW)(menu, MF_STRING, ID_VERSION_INFO, W("バージョン情報…"));\n','')
  .replace('  if (handle_version_info(id)) return;\n','');
const preservedLogic=Object.entries(baseline.logic).filter(([file])=>file!=='tests/render_test.c');
for(const [file,expected] of preservedLogic) {
  const actual=hash(normalize(existingSource(file)));
  assert(actual===expected,`Existing behavior/rendering/import code changed: ${file}`);
}
const currentRest=JSON.parse(fs.readFileSync(path.join(project,'build/assets/rest-import.json'),'utf8'));
assert(isDeepStrictEqual(currentRest,baseline.restRgba),'Rest crop, scale, placement, or RGBA changed');
for(const [file,expected] of Object.entries(baseline.restPng))
  assert(hash(fs.readFileSync(path.join(project,'build/assets/rest',file)))===expected,`Rest PNG bytes changed: ${file}`);
const reportPath=path.join(project,'build/reference-validation.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
report.preservedFromV190={result:'PASS',logicFilesChecked:preservedLogic.length,
  mainCodeChange:'version UI and Onyankopon forepaw rendering',restPngFilesByteIdentical:Object.keys(baseline.restPng).length,
  allRestRgbaAndImportParametersUnchanged:true,walkTimingAndWindowMovementUnchanged:true,
  behaviorAndSettingsCodeUnchanged:true};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.preservedFromV190));
