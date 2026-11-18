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
const original = await importReference(sharp, path.join(project, 'art_source/reference/onyankopon_walk_sheet.jpg'), 'onyankopon');

const alpha = (frame, x, y) => frame[(y * size + x) * 4 + 3];
// Align each fur column vertically so a tilting torso does not look like a
// recolored coat. No horizontal shift, scaling or color adjustment is allowed.
for (const [slot, frame] of frames.entries()) {
  let total = 0, columns = 0;
  for (let x = 176; x < 257; x += 2) {
    let best = Infinity;
    for (let dy = -12; dy <= 12; dy += 0.5) {
      let difference = 0, samples = 0;
      for (let y = 176; y < 209; y += 2) {
        const first = (y * size + x) * 4;
        const row = Math.floor(y + dy), fraction = y + dy - row;
        const second = (row * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          const aligned = frame[second + c] * (1 - fraction) + frame[second + size * 4 + c] * fraction;
          difference += Math.abs(frames[0][first + c] - aligned);
          samples++;
        }
      }
      best = Math.min(best, difference / samples);
    }
    total += best;
    columns++;
  }
  const difference = total / columns;
  assert.ok(difference <= 6, `F0${slot + 1} coat pattern changes after alignment (${difference.toFixed(1)} RGB levels)`);
}

function bellyEdge(frame) {
  const heights = [207, 211, 215, 219, 223].map(x => {
    let y = 235;
    while (y < 277 && alpha(frame, x, y) >= 100) y++;
    return y;
  });
  return heights.sort((a, b) => a - b)[2];
}
function backEdge(frame) {
  let y = 100;
  while (y < 180 && alpha(frame, 215, y) < 128) y++;
  return y;
}
// Compare coat depth at the source torso height, independently of the new
// weight-transfer motion. Read the displacement from pixels, not metadata.
const sourceBack = backEdge(original.cells[3]);
const bellyDifference = frames.map((frame, slot) =>
  bellyEdge(frame) - (backEdge(frame) - sourceBack) - bellyEdge(yuriFrames[slot]));
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

for (const [slot, donor] of [4, 3].entries()) {
  for (const y of [280, 295, 308, 320]) {
    const width = rightForelegWidth(frames[slot], y);
    const expected = rightForelegWidth(original.cells[donor], y);
    assert.ok(width >= expected - 3,
      `F0${slot + 1} foreleg at y=${y} is ${width}px wide; original shape is ${expected}px`);
  }
}

const generated = path.dirname(assets);
const {onyankopon: {walkCorrection: walk}} = JSON.parse(fs.readFileSync(path.join(generated, 'reference-import.json'), 'utf8'));
const cycle = sharp(path.join(generated, 'onyankopon_walk_cycle.png'));
const poses = await Promise.all(Array.from({length: 24}, (_, pose) =>
  cycle.clone().extract({left: pose % 6 * size, top: Math.floor(pose / 6) * size, width: size, height: size})
    .raw().toBuffer()));
const movement = walk.stride / poses.length;
// Measure the opaque back outline at the shoulder. A tiny translation can
// disappear at desktop size even if a nonzero bob exists in the generator.
const shoulderBack = poses.map(pose => {
  let edge = 425;
  for (let x = 284; x <= 302; x += 3) {
    let y = 120;
    while (y < 180 && alpha(pose, x, y) < 128) y++;
    edge = Math.min(edge, y);
  }
  return edge;
});
const shoulderTravel = (Math.max(...shoulderBack) - Math.min(...shoulderBack)) * 224 / 425;
assert.ok(shoulderTravel >= 3.5 && shoulderTravel <= 6.5,
  `Shoulder motion is ${shoulderTravel.toFixed(1)}px at desktop size`);
for (let i = 0; i < poses.length; i++) {
  assert.ok(Math.abs(shoulderBack[(i + 1) % poses.length] - shoulderBack[i]) <= 3,
    `Shoulder jumps between poses ${i} and ${(i + 1) % poses.length}`);
}
// A foot-only shuffle can pass the sole-drift checks. Also require comparable
// forward/backward extension to Yuri and visible motion high on each limb.
const forePawXs = walk.pawPositions.map(paws => paws[3].x);
const foreExtension = Math.max(...forePawXs) - Math.min(...forePawXs);
assert.ok(foreExtension >= 110,
  `Foreleg extension is ${foreExtension.toFixed(1)}px; Yuri spans about 120px at this size`);
const hindExtension = [];
for (const [leg, side, minimum] of [[0, 'far', 78], [2, 'near', 62]]) {
  const paws = walk.pawPositions.map(pose => pose[leg]);
  const wrap = i => (i + paws.length) % paws.length;
  const liftOff = paws.findIndex((paw, i) => !paw.planted && paws[wrap(i - 1)].planted);
  assert.ok(liftOff >= 0, `Missing ${side} hind toe-off`);
  const ground = paws[wrap(liftOff - 1)].y;
  // Measure against the hip and only at ground level or just above it.
  // Throwing the paw further back after lifting it is not a longer push-off.
  const steps = [-1, 0, 1].map(offset => wrap(liftOff + offset)).filter(i => ground - paws[i].y <= 8);
  const extension = Math.max(...steps.map(i => walk.legJoints[i][leg][1][0] - paws[i].x));
  assert.ok(extension >= minimum,
    `${side} hind paw reaches only ${extension.toFixed(1)}px behind the hip at toe-off`);
  hindExtension.push(extension);
}
for (const [name, bounds] of [
  ['hip', {x: 100, y: 209, width: 50, height: 30}],
  ['shoulder', {x: 282, y: 207, width: 47, height: 30}],
]) {
  let changed = 0, sampled = 0;
  for(let y=bounds.y;y<bounds.y+bounds.height;y++)for(let x=bounds.x;x<bounds.x+bounds.width;x++) {
    const p=(y*size+x)*4;
    // The body bob has the same phase half a gait cycle apart.
    const q=p;
    const difference=Math.abs(poses[0][p]-poses[12][q])+Math.abs(poses[0][p+1]-poses[12][q+1])+Math.abs(poses[0][p+2]-poses[12][q+2]);
    if(poses[0][p+3]>=128&&poses[12][q+3]>=128) {
      sampled++;
      if(difference>27)changed++;
    }
  }
  assert.ok(changed/sampled>=0.45, `${name} is held fixed while the paws move (${(changed/sampled*100).toFixed(0)}% changed)`);
}
for(let leg=0;leg<4;leg++) {
  const angles=walk.legJoints.map(joints=>Math.atan2(
    joints[leg][2][0]-joints[leg][1][0],joints[leg][2][1]-joints[leg][1][1])*180/Math.PI);
  assert.ok(Math.max(...angles)-Math.min(...angles)>=35, `Leg ${leg} does not swing at its attachment`);
  if(leg%2===0) {
    assert.ok(Math.max(...angles)-Math.min(...angles)<=70,
      `Hind thigh rotates too far: ${(Math.max(...angles)-Math.min(...angles)).toFixed(1)} degrees`);
    const bends=walk.legJoints.map(joints=>{
      const [knee,hock,ankle]=joints[leg].slice(2,5);
      const calf=[hock[0]-knee[0],hock[1]-knee[1]];
      const metatarsal=[ankle[0]-hock[0],ankle[1]-hock[1]];
      return Math.acos(Math.max(-1,Math.min(1,
        (calf[0]*metatarsal[0]+calf[1]*metatarsal[1])/
        (Math.hypot(...calf)*Math.hypot(...metatarsal)))))*180/Math.PI;
    });
    assert.ok(bends.filter(angle=>angle>15).length>=18,
      'Hock remains straight instead of flexing independently');
    const kneeFlexion=walk.legJoints.map(joints=>{
      const [hip,knee,hock]=joints[leg].slice(1,4);
      const thigh=[knee[0]-hip[0],knee[1]-hip[1]];
      const calf=[hock[0]-knee[0],hock[1]-knee[1]];
      return Math.acos(Math.max(-1,Math.min(1,
        (thigh[0]*calf[0]+thigh[1]*calf[1])/(Math.hypot(...thigh)*Math.hypot(...calf)))))*180/Math.PI;
    });
    assert.ok(Math.max(...kneeFlexion)<=45, 'Hind knee folds too deeply during recovery');
    assert.ok(Math.max(...bends)<=105, 'Hock folds too deeply during recovery');
  } else {
    const elbowFlexion=walk.legJoints.map(joints=>{
      const [shoulder,elbow,,wrist]=joints[leg].slice(1,5);
      const upper=[elbow[0]-shoulder[0],elbow[1]-shoulder[1]];
      const lower=[wrist[0]-elbow[0],wrist[1]-elbow[1]];
      return Math.acos(Math.max(-1,Math.min(1,
        (upper[0]*lower[0]+upper[1]*lower[1])/(Math.hypot(...upper)*Math.hypot(...lower)))))*180/Math.PI;
    });
    assert.ok(Math.max(...elbowFlexion)<=45,
      `Fore elbow folds too deeply: ${Math.max(...elbowFlexion).toFixed(1)} degrees`);
  }
}
const contacts = new Array(4).fill(0);
const observed = new Array(4).fill(0);

function sole(frame, paw, overlapping) {
  if (Math.abs(paw.x - overlapping.x) < 34 && Math.abs(paw.y - overlapping.y) < 16) return null;
  const soleRows = [];
  for (let y = Math.round(paw.y + 1); y >= paw.y - 5; y--) {
    let row = [];
    for (let x = Math.round(paw.x - 20); x <= paw.x + 20; x++) {
      if (alpha(frame, x, y) >= 128) row.push(x);
    }
    if (row.length === 0) continue;
    soleRows.push(...row);
    if (soleRows.length >= 12) break;
  }
  assert.ok(soleRows.length >= 8, 'Missing opaque sole at the annotated planted foot');
  return soleRows.reduce((sum, x) => sum + x, 0) / soleRows.length;
}

let maxSlide = 0;
for (let i = 0; i < poses.length; i++) {
  const next = (i + 1) % poses.length;
  const feet = walk.pawPositions[i], nextFeet = walk.pawPositions[next];
  assert.ok(feet.filter(paw => paw.planted).length >= 2, 'A walking pose lost support');
  for (let leg = 0; leg < feet.length; leg++) {
    const paw = feet[leg], following = nextFeet[leg], other = (leg + 2) % 4;
    if (!paw.planted && following.planted) contacts[leg]++;
    if (!paw.planted || !following.planted) continue;
    assert.ok(Math.abs(following.x - paw.x + movement) < 0.001 && following.y === paw.y,
      `Paw ${leg} drifts while planted between poses ${i} and ${next}`);
    // At push-off the pad rolls off the planted toe, so its centroid moves.
    // Measure the flat part of stance when the full sole has ground contact.
    if(Math.max(Math.abs(paw.pitch??0),Math.abs(following.pitch??0))>3)continue;
    const first = sole(poses[i], paw, feet[other]);
    const last = sole(poses[next], following, nextFeet[other]);
    if (first === null || last === null) continue;
    observed[leg]++;
    maxSlide = Math.max(maxSlide, Math.abs(last - first + movement));
  }
}
assert.ok(contacts.every(count => count === 1), 'Each paw should touch down once each cycle');
assert.ok(observed.every(count => count >= 3), 'Not enough isolated sole samples for all four feet');
assert.ok(maxSlide <= 4, `Rasterized sole drift ${maxSlide.toFixed(1)}px at 425px`);
console.log(`onyankopon walk: stable coat, belly depth, F01/F02 leg width, ${shoulderTravel.toFixed(1)}px shoulder travel at 224px, visible hip/shoulder swing, ${foreExtension.toFixed(1)}px foreleg extension, ${hindExtension.map(px => px.toFixed(1)).join('/')}px hind extension at toe-off, ${maxSlide.toFixed(1)}px maximum sole drift at 425px PASS`);
