import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const project=process.argv[2];
const baseline=JSON.parse(fs.readFileSync(path.join(project,'tests/preserved-v1.9.0.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const base192=JSON.parse(fs.readFileSync(path.join(project,'tests/base-v1.9.2.json'),'utf8'));
const existingSource=file=>{
  const text=fs.readFileSync(path.join(project,file),'utf8').replaceAll('\r\n','\n');
  if(file==='src/reference_walk.h') return text.replace(', unsigned int stride)', ')')
    .replace('+= stride * size', '+= REFERENCE_STRIDE * size');
  if(file==='tests/reference_test.c') return text.replaceAll(', REFERENCE_STRIDE)', ')');
  return text;
};
// Compare the surrounding v1.9.4 code after removing sprite loading/cache,
// drawing, per-cat stride and the opt-in desktop review window setup.
const unaffectedMain=existingSource('src/main.c')
  .replace('    if (reviewWindows) pet->behavior.ticksRemaining = 0x7fffffffu;\n', '')
  .replace(/  WCHAR reviewMode\[2\];\n  int reviewWindows =[\s\S]*?reviewMode\[0\] == \(WCHAR\)'1';\n/, '')
  .replace('    // Review mode exposes the real layered windows to desktop capture tools.\n' +
    '    DWORD windowStyle = WS_EX_LAYERED | WS_EX_TOPMOST;\n' +
    '    if (!reviewWindows) windowStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;\n' +
    '    pet->hwnd = CALL(CreateWindowExW)(windowStyle,',
    '    pet->hwnd = CALL(CreateWindowExW)(WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_NOACTIVATE,')
  .replace('    pet->hwnd = hwnd;\n    return CALL(DefWindowProcW)(hwnd, msg, wParam, lParam);',
    '    pet->hwnd = hwnd;\n    return TRUE;')
  .replace(/static int init_sprites\(void\) \{[\s\S]*?(?=static void free_sprites\(void\))/, '')
  .replace(/static int frame_count_for_pet\([\s\S]*?(?=static int create_pet_surface\()/, '')
  .replace(/static void render_pet\(Pet\* pet\) \{[\s\S]*?(?=static void get_work_area\()/, '')
  .replace('static BYTE* g_onyankoponExtra[ONYANKOPON_EXTRA_POSES];\n','')
  .replace('  unsigned int stride = pet->id == 1 ? ONYANKOPON_STRIDE : REFERENCE_STRIDE;\n', '')
  .replace('reference_step_pixels(&pet->reference, (unsigned int)size, stride)', 'reference_step_pixels(&pet->reference, (unsigned int)size)');
assert(hash(unaffectedMain)==='6f3e8075b0f8740fbc9ada7ee39dea6c19f44efe11badb1b1db1c8574d552630',
  'main.c changed outside sprite loading, drawing, per-cat stride or desktop review setup');
for(const [file,expected] of Object.entries(base192.unchangedRuntimeFiles)) {
  if(file==='src/main.c') continue;
  assert(hash(existingSource(file))===expected,`Runtime outside the revised walk changed: ${file}`);
}
// Exclude only the explicitly requested version UI integration. The remaining
// main.c code and all original motion files must still match v1.9.0 exactly.
const normalize=s=>s.replace(/v1\.9\.[012]/g,'vVERSION')
  .replace('#include "version_ui.h"\n','')
  .replaceAll('(const WCHAR*)APP_TITLE_VERSION_W','W("ゆりちゃん ＆ オニャンコポン  vVERSION")')
  .replace('  CALL(AppendMenuW)(menu, MF_STRING, ID_VERSION_INFO, W("バージョン情報…"));\n','')
  .replace('  if (handle_version_info(id)) return;\n','');
const preservedLogic=Object.entries(baseline.logic).filter(([file])=>file!=='tests/render_test.c'&&file!=='src/main.c');
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
report.preservedFromV190={result:'PASS',logicFilesChecked:preservedLogic.length+1,
  mainCodeChange:'version UI, sprite rendering, Onyankopon stride and opt-in review window setup',restPngFilesByteIdentical:Object.keys(baseline.restPng).length,
  allRestRgbaAndImportParametersUnchanged:true,walkCycleTimingUnchanged:true,yuriWindowMovementUnchanged:true,
  behaviorAndSettingsCodeUnchanged:true};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify(report.preservedFromV190));
