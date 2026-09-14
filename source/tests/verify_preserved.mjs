import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const project=process.argv[2];
const baseline=JSON.parse(fs.readFileSync(path.join(project,'tests/preserved-v1.9.0.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const base192=JSON.parse(fs.readFileSync(path.join(project,'tests/base-v1.9.2.json'),'utf8'));
for(const [file,expected] of Object.entries(base192.unchangedRuntimeFiles))
  assert(hash(fs.readFileSync(path.join(project,file)))===expected,`v1.9.2 runtime changed: ${file}`);
// Exclude only the explicitly requested version UI integration. The remaining
// main.c code and all original motion files must still match v1.9.0 exactly.
const normalize=s=>s.replace(/v1\.9\.[012]/g,'vVERSION')
  .replace('#include "version_ui.h"\n','')
  .replaceAll('(const WCHAR*)APP_TITLE_VERSION_W','W("ゆりちゃん ＆ オニャンコポン  vVERSION")')
  .replace('  CALL(AppendMenuW)(menu, MF_STRING, ID_VERSION_INFO, W("バージョン情報…"));\n','')
  .replace('  if (handle_version_info(id)) return;\n','');
for(const [file,expected] of Object.entries(baseline.logic)) {
  const actual=hash(Buffer.from(normalize(fs.readFileSync(path.join(project,file),'utf8'))));
  assert(actual===expected,`Existing behavior/rendering/import code changed: ${file}`);
}
const currentRest=JSON.parse(fs.readFileSync(path.join(project,'build/assets/rest-import.json'),'utf8'));
assert(isDeepStrictEqual(currentRest,baseline.restRgba),'Rest crop, scale, placement, or RGBA changed');
for(const [file,expected] of Object.entries(baseline.restPng))
  assert(hash(fs.readFileSync(path.join(project,'build/assets/rest',file)))===expected,`Rest PNG bytes changed: ${file}`);
const reportPath=path.join(project,'build/reference-validation.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
report.actualBase={requestedVersion:'1.8.1',exactRequestedVersionAvailable:false,
  version:'1.9.2',runtimeFilesByteIdentical:Object.keys(base192.unchangedRuntimeFiles).length,
  brandChanged:false,settingsAndExeNameChanged:false};
report.preservedFromV190={result:'PASS',logicFilesChecked:Object.keys(baseline.logic).length,
  mainCodeChange:'version labels and About-menu integration only',restPngFilesByteIdentical:Object.keys(baseline.restPng).length,
  allRestRgbaAndImportParametersUnchanged:true,walkTimingAndMotionLogicUnchanged:true,
  behaviorAndSettingsCodeUnchanged:true};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.preservedFromV190));
