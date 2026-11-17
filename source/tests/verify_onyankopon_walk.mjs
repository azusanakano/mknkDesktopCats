import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {importReference} from '../tools/import_reference.mjs';

const require = createRequire(import.meta.url);
const sharp = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp'))
  : require('sharp');
const project = fileURLToPath(new URL('../', import.meta.url));
const assets = process.argv[2] ?? path.join(project, 'build/assets/walk');
const size = 425;
const frames = await Promise.all(Array.from({length: 8}, (_, slot) =>
  sharp(path.join(assets, `onyankopon_walk_0${slot + 1}.png`)).ensureAlpha().raw().toBuffer()));
const yuriFrames = await Promise.all(Array.from({length: 8}, (_, slot) =>
  sharp(path.join(assets, `yuri_walk_0${slot + 1}.png`)).ensureAlpha().raw().toBuffer()));

const alpha = (frame, x, y) => frame[(y * size + x) * 4 + 3];
function bellyEdge(frame) {
  const heights = [207, 211, 215, 219, 223].map(x => {
    let y = 235;
    while (y < 277 && alpha(frame, x, y) >= 100) y++;
    return y;
  });
  return heights.sort((a, b) => a - b)[2];
}
const bellyDifference = frames.map((frame, slot) => bellyEdge(frame) - bellyEdge(yuriFrames[slot]));
assert.ok(Math.abs(bellyDifference.reduce((sum, n) => sum + n, 0) / frames.length) <= 4 &&
  bellyDifference.every(n => Math.abs(n) <= 8),
  `Belly depth should be comparable to Yuri: ${bellyDifference.join(', ')}px`);

function rightForelegWidth(frame, y) {
  let x = 405;
  while (x > 210 && alpha(frame, x, y) < 128) x--;
  const right = x;
  while (x > 210 && alpha(frame, x, y) >= 128) x--;
  return right - x;
}

const original = await importReference(sharp, path.join(project, 'art_source/reference/onyankopon_walk_sheet.jpg'), 'onyankopon');
for (const [slot, donor] of [4, 3].entries()) {
  for (const y of [280, 295, 308, 320]) {
    const width = rightForelegWidth(frames[slot], y);
    const expected = rightForelegWidth(original.cells[donor], y);
    assert.ok(width >= expected - 3,
      `F0${slot + 1} foreleg at y=${y} is ${width}px wide; original shape is ${expected}px`);
  }
}

function foot(frame, minX = 215, maxX = 405) {
  let bottom = 319;
  const pixels = [];
  for (let y = 320; y < 349; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (alpha(frame, x, y) < 128) continue;
      pixels.push({x, y});
      bottom = y;
    }
  }
  assert.ok(pixels.length, 'Expected a visible forepaw near the ground');
  const tips = pixels.filter(({y}) => y >= bottom - 4);
  return {x: tips.reduce((sum, tip) => sum + tip.x, 0) / tips.length, bottom};
}

const clock = fs.readFileSync(path.join(project, 'src/reference_walk.h'), 'utf8');
const stride = Number(clock.match(/#define REFERENCE_STRIDE (\d+)u/)[1]);
const movement = size * stride / (256 * frames.length);
const contacts = [
  frames.slice(0, 4).map(frame => foot(frame)),
  [foot(frames[4], 325), ...frames.slice(5).map(frame => foot(frame))],
];
let maxSlide = 0;
for (const stance of contacts) {
  for (let i = 1; i < stance.length; i++) {
    maxSlide = Math.max(maxSlide, Math.abs(stance[i].x - stance[i - 1].x + movement));
  }
}

let changed = 0;
let union = 0;
for (let y = 275; y < 349; y++) {
  for (let x = 212; x < 410; x++) {
    const end = alpha(frames[7], x, y) >= 128;
    const start = alpha(frames[0], x, y) >= 128;
    if (start || end) union++;
    if (start !== end) changed++;
  }
}
const seamChange = changed / union;
assert.ok(maxSlide <= 4 && seamChange >= 0.40,
  `Forepaw slip ${maxSlide.toFixed(1)}px (limit 4px); loop foreleg silhouette change ${(seamChange * 100).toFixed(0)}% (minimum 40%)`);
const outgoing = foot(frames[4], 270, 322);
assert.ok(Math.abs(outgoing.x - contacts[0][3].x + movement) <= 4,
  'Trailing forepaw slips during the transfer to the next stance');
for (const stance of contacts) {
  const heights = stance.map(({bottom}) => bottom);
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 3, 'Planted forepaw bobs off the floor');
}
console.log(`onyankopon walk: maximum stance slip ${maxSlide.toFixed(1)}px at 425px; loop silhouette changes ${(seamChange * 100).toFixed(0)}% PASS`);
