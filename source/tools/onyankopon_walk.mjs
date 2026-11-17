import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Eight named poses, each followed by two poses sampled from the same gait.
const header = fs.readFileSync(new URL('../src/onyankopon_walk.h', import.meta.url), 'utf8');
const constant = name => Number(header.match(new RegExp(`^#define ${name} (\\d+)u$`, 'm'))[1]);
export const WALK_POSES_PER_FRAME = constant('ONYANKOPON_WALK_POSES_PER_FRAME');
const ONYANKOPON_STRIDE = constant('ONYANKOPON_STRIDE');
export const WALK_CYCLE_COLUMNS = 6;
const referencePose = 4;
const tau = 2 * Math.PI;

// Coordinates on the 425px artwork. The uncut torso and the two near-side
// limbs share the same painted fur texture. Side cuts follow the gaps between
// legs and sit under the torso where the legs meet the body.
const bellyOutline = [
  [0, 221], [90, 221], [107, 230], [129, 233], [151, 245],
  [163, 262], [174, 274], [225, 274], [236, 263],
  [252, 250], [275, 245], [303, 246], [322, 246], [338, 252], [424, 246],
];
const hind = {
  start: 185, end: 347, width: 1.02,
  left: [[185, 91], [215, 89], [248, 99], [267, 110], [278, 106], [347, 101]],
  right: [[185, 168], [215, 172], [246, 169], [267, 167], [281, 159], [331, 178], [347, 178]],
  spine: [[128, 185], [131, 215], [141, 261], [121, 304], [139, 328], [158, 346], [158, 351]],
  toe: 158,
};
const fore = {
  start: 184, end: 346, width: 1.16,
  left: [[184, 269], [212, 268], [224, 273], [245, 282], [264, 284], [277, 284], [346, 289]],
  right: [[184, 339], [212, 349], [224, 352], [314, 352], [329, 361], [346, 361]],
  spine: [[304, 184], [307, 211], [307, 263], [319, 302], [327, 328], [344, 345], [344, 350]],
  toe: 344,
};

// Touchdowns proceed near fore, far hind, far fore, near hind, then repeat.
// Each hind paw lands one fifth of a cycle before the forepaw on its side.
// The far ground line is slightly higher in the side view.
const legs = [
  {art: hind, far: true, touch: 7 / 24, duty: 7 / 12, reach: 174, ground: 338, height: 14},
  {art: fore, far: true, touch: 1 / 2, duty: 5 / 8, reach: 357, ground: 338, height: 10},
  {art: hind, far: false, touch: 19 / 24, duty: 7 / 12, reach: 185, ground: 346, height: 16},
  {art: fore, far: false, touch: 0, duty: 5 / 8, reach: 369, ground: 346, height: 12},
];

const mix = (a, b, t) => a + (b - a) * t;
function fade(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function guide(points, x) {
  for (let i = 1; i < points.length; i++) {
    const [right, end] = points[i];
    if (x > right) continue;
    const [left, start] = points[i - 1];
    return mix(start, end, (x - left) / (right - left));
  }
  return points.at(-1)[1];
}

function layer(pixels, n, getAlpha) {
  const rgba = new Float32Array(pixels.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = (y * n + x) * 4;
    const a = pixels[p + 3] / 255 * getAlpha(x, y);
    rgba[p] = pixels[p] * a;
    // Remove the green JPEG edge spill from Onyankopon's working texture.
    rgba[p + 1] = Math.min(pixels[p + 1], Math.max(pixels[p], pixels[p + 2])) * a;
    rgba[p + 2] = pixels[p + 2] * a;
    rgba[p + 3] = a;
  }
  return rgba;
}

function bodyTexture(original, painted, n) {
  const body = Buffer.from(original);
  for (let y = 147; y <= 275; y++) for (let x = 79; x < 340; x++) {
    const p = (y * n + x) * 4;
    // The painted lower flank has continuous texture across the new fur.
    // Feather into the original face and tail high on the solid body.
    const tail = mix(fade(98, 120, x), 1, fade(174, 216, y));
    const face = mix(1 - fade(301, 339, x), 1, fade(194, 229, y));
    const weight = fade(147, 183, y) * tail * face * (1 - fade(333, 340, x));
    // Fit the painted belly to the same depth as Yuri's coat. Ease into
    // the unwarped thigh and chest so the strokes run across the join.
    const belly = fade(146, 174, x) * (1 - fade(224, 252, x));
    const sourceY = y + Math.max(0, y - 222) * 0.22 * belly;
    const row = Math.floor(sourceY), t = sourceY - row;
    const at = (row * n + x) * 4, next = at + n * 4;
    const sourceA = original[p + 3] * (1 - weight);
    const a0 = painted[at + 3] * weight * (1 - t);
    const a1 = painted[next + 3] * weight * t;
    const a = sourceA + a0 + a1;
    body[p + 3] = Math.round(a);
    if (!a) continue;
    for (let c = 0; c < 3; c++) body[p + c] = Math.round((original[p + c] * sourceA + painted[at + c] * a0 + painted[next + c] * a1) / a);
  }
  return layer(body, n, (x, y) => {
    const limit = guide(bellyOutline, x);
    return 1 - fade(limit - 1.1, limit + 0.9, y);
  });
}

function legTexture(painted, n, art) {
  return layer(painted, n, (x, y) => {
    if (y < art.start || y > art.end) return 0;
    const left = guide(art.left, y);
    const right = guide(art.right, y);
    const feather = mix(15, 3, fade(222, 278, y));
    return fade(art.start, art.start + 38, y) * fade(left - 2, left + feather, x) *
      (1 - fade(right - feather, right + 2, x));
  });
}

function pawAt(leg, time, stride) {
  // During stance the local paw travels exactly as far back as the cat
  // travels forward. A cubic swing matches the stance speed at both ends.
  const phase = ((time - leg.touch) % 1 + 1) % 1;
  if (phase < leg.duty) return {
    x: leg.reach - stride * phase, lift: 0, planted: true, phase,
    pitch: leg.art === hind ? 12 * fade(leg.duty * 0.78, leg.duty, phase) : 0,
  };
  const t = (phase - leg.duty) / (1 - leg.duty);
  const followThrough = -stride * (1 - leg.duty) * t * (1 - t) * (1 - 2 * t);
  const x = mix(leg.reach - stride * leg.duty, leg.reach, fade(0, 1, t)) + followThrough;
  const heightPhase = leg.art === hind ? t + 0.16 * Math.sin(Math.PI * t) : t;
  return {x, lift: leg.height * Math.sin(Math.PI * heightPhase) ** 1.35, planted: false, phase,
    pitch: leg.art === hind ? 12 * (1 - fade(0, 0.45, t)) - 10 * Math.sin(Math.PI * t) ** 2 : 0};
}

function paintRow(canvas, texture, n, y, sourceY, xOffset, width, axis, shade, opacity = 1) {
  const sy = Math.floor(sourceY), fy = sourceY - sy;
  if (sy < 0 || sy >= n - 1) return;
  const start = Math.max(0, Math.ceil(axis + width * -axis + xOffset));
  const end = Math.min(n, Math.floor(axis + width * (n - 1 - axis) + xOffset) + 1);
  for (let x = start; x < end; x++) {
    const from = axis + (x - axis - xOffset) / width;
    const sx = Math.floor(from), fx = from - sx;
    if (sx < 0 || sx >= n - 1) continue;
    const p = (sy * n + sx) * 4, q = (y * n + x) * 4;
    const at = c => mix(mix(texture[p + c], texture[p + 4 + c], fx),
      mix(texture[p + n * 4 + c], texture[p + n * 4 + 4 + c], fx), fy);
    const a = at(3) * opacity;
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) canvas[q + c] = shade * opacity * at(c) + (1 - a) * canvas[q + c];
    canvas[q + 3] = a + (1 - a) * canvas[q + 3];
  }
}

function elbow(root, end, upper, lower, bend) {
  const dx = end[0] - root[0], dy = end[1] - root[1];
  const distance = Math.hypot(dx, dy);
  const reach = Math.min(distance, upper + lower - 0.01);
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return [root[0] + (dx * along - bend * dy * height) / distance,
    root[1] + (dy * along + bend * dx * height) / distance];
}

function footPoint(leg, paw, x, y) {
  const pivotX = leg.art.toe + 8, pivotY = leg.art.spine[5][1];
  const angle = paw.pitch * Math.PI / 180;
  const padWidth = leg.art === fore ? 1.08 : 1;
  const dx = (x - pivotX) * padWidth, dy = y - pivotY;
  return [paw.x + 8 + dx * Math.cos(angle) - dy * Math.sin(angle),
    leg.ground - paw.lift + dx * Math.sin(angle) + dy * Math.cos(angle)];
}

function legJoints(leg, paw, bob) {
  const back = leg.art === hind;
  const shift = leg.far ? (back ? 5 : -8) : 0;
  const shoulderHeight = 207 - (leg.far ? 8 : 0);
  const root = [back ? 128 + shift : 306 + shift, (back ? 210 : shoulderHeight) + bob];
  const toeY = leg.ground - paw.lift;
  const ankle = footPoint(leg, paw, ...leg.art.spine[4]);
  let joint, shin;
  if (back) {
    const stance = paw.phase / leg.duty;
    const swing = (paw.phase - leg.duty) / (1 - leg.duty);
    // Distribute shortening over the knee and the hock. The knee's modest
    // flexion follows load and recovery rather than folding until the whole
    // two-link leg can reach a raised foot.
    const kneeFlexion = paw.planted
      ? 26 + 6 * Math.sin(Math.PI * stance) ** 2 - 8 * fade(0.5, 1, stance)
      : 18 + 18 * Math.sin(Math.PI * swing) ** 2 + 8 * fade(0.45, 1, swing);
    const flexion = kneeFlexion * Math.PI / 180;
    const thigh = 51, calf = 49, metatarsal = 35;
    const effective = Math.sqrt(thigh ** 2 + calf ** 2 + 2 * thigh * calf * Math.cos(flexion));
    shin = elbow(root, ankle, effective, metatarsal, 1);
    const direction = Math.atan2(shin[1] - root[1], shin[0] - root[0]) -
      Math.atan2(calf * Math.sin(flexion), thigh + calf * Math.cos(flexion));
    joint = [root[0] + thigh * Math.cos(direction), root[1] + thigh * Math.sin(direction)];
  } else {
    // Match the low foot clearance and the painted upper arm. The far
    // shoulder follows its raised ground plane to avoid a shortened elbow.
    joint = elbow(root, ankle, 52, 69, 1);
    shin = [mix(joint[0], ankle[0], 0.60), mix(joint[1], ankle[1], 0.60)];
  }
  // The attachment patch feathers onto the flank above the moving upper leg.
  return [[back ? 128 + shift : 304 + shift, leg.art.start + bob],
    root, joint, shin, ankle, [paw.x, toeY], [paw.x, toeY + 5]];
}

function spineAt(spine, guideSpine, y) {
  let index = 1;
  while (index < guideSpine.length - 1 && guideSpine[index][1] < y) index++;
  const t = (y - guideSpine[index - 1][1]) / (guideSpine[index][1] - guideSpine[index - 1][1]);
  const span = guideSpine[index][1] - guideSpine[index - 1][1];
  const before = Math.max(0, index - 2), after = Math.min(spine.length - 1, index + 1);
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h01 = -2 * t ** 3 + 3 * t ** 2;
  const h10 = t ** 3 - 2 * t ** 2 + t, h11 = t ** 3 - t ** 2;
  return [0, 1].map(c => h00 * spine[index - 1][c] + h01 * spine[index][c] +
    h10 * span * (spine[index][c] - spine[before][c]) / (guideSpine[index][1] - guideSpine[before][1]) +
    h11 * span * (spine[after][c] - spine[index - 1][c]) / (guideSpine[after][1] - guideSpine[index - 1][1]));
}

function meshVertex(leg, paw, joints, x, y) {
  const art = leg.art;
  const foot = footPoint(leg, paw, x, y);
  if (y >= 326) return {x: foot[0], y: foot[1], u: x, v: y};
  const source = spineAt(art.spine, art.spine, y);
  const target = spineAt(joints, art.spine, y);
  const before = spineAt(art.spine, art.spine, y - 3);
  const after = spineAt(art.spine, art.spine, y + 3);
  const previous = spineAt(joints, art.spine, y - 3);
  const next = spineAt(joints, art.spine, y + 3);
  const angle = Math.atan2(next[1] - previous[1], next[0] - previous[0]) -
    Math.atan2(after[1] - before[1], after[0] - before[0]);
  const width = mix(1, art.width, fade(art.start + 20, 263, y));
  const offset = (x - source[0]) * width;
  const footWeight = fade(310, 326, y);
  return {x: mix(target[0] + Math.cos(angle) * offset, foot[0], footWeight),
    y: mix(target[1] + Math.sin(angle) * offset, foot[1], footWeight), u: x, v: y};
}

function triangle(output, texture, n, a, b, c) {
  const determinant = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(determinant) < 0.001) return;
  const left = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const right = Math.min(n - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const top = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const bottom = Math.min(n - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const wa = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / determinant;
    const wb = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / determinant;
    const wc = 1 - wa - wb;
    if (Math.min(wa, wb, wc) < -0.0001) continue;
    const u = wa * a.u + wb * b.u + wc * c.u, v = wa * a.v + wb * b.v + wc * c.v;
    const sx = Math.floor(u), sy = Math.floor(v);
    if (sx < 0 || sx >= n - 1 || sy < 0 || sy >= n - 1) continue;
    const fx = u - sx, fy = v - sy;
    const p = (sy * n + sx) * 4, q = (y * n + x) * 4;
    for (let channel = 0; channel < 4; channel++)
      output[q + channel] = mix(mix(texture[p + channel], texture[p + 4 + channel], fx),
        mix(texture[p + n * 4 + channel], texture[p + n * 4 + 4 + channel], fx), fy);
  }
}

function paintLeg(canvas, texture, n, leg, paw, joints) {
  const rendered = new Float32Array(canvas.length);
  let previous = null;
  const rows = [leg.art.start];
  for (let y = leg.art.start + 5; y < leg.art.end; y += 5) rows.push(y);
  rows.push(leg.art.end + 2);
  for (const y of rows) {
    const left = guide(leg.art.left, y) - 3, right = guide(leg.art.right, y) + 3;
    const current = [left, (left + right) / 2, right].map(x => meshVertex(leg, paw, joints, x, y));
    if (previous) for (let i = 0; i < 2; i++) {
      triangle(rendered, texture, n, previous[i], current[i], current[i + 1]);
      triangle(rendered, texture, n, previous[i], current[i + 1], previous[i + 1]);
    }
    previous = current;
  }
  const shade = leg.far ? 0.85 : 1;
  for (let p = 0; p < canvas.length; p += 4) {
    const a = rendered[p + 3];
    for (let c = 0; c < 3; c++) canvas[p + c] = shade * rendered[p + c] + (1 - a) * canvas[p + c];
    canvas[p + 3] = a + (1 - a) * canvas[p + 3];
  }
}

function renderPose(body, textures, n, stride, time) {
  const canvas = new Float32Array(n * n * 4);
  const bob = 1.8 * Math.cos(2 * tau * (time - 0.08));
  const paws = legs.map(leg => pawAt(leg, time, stride));
  const joints = legs.map((leg, i) => legJoints(leg, paws[i], bob));
  for (const [i, leg] of legs.entries()) {
    if (!leg.far && legs[i - 1].far) {
      // The body covers the far-side hips and shoulders.
      for (let y = 48; y <= 279; y++) {
        const tailSway = 3.4 * Math.sin(tau * time) * (1 - fade(54, 114, y));
        paintRow(canvas, body, n, y, y - bob, tailSway, 1, 0, 1);
      }
    }
    paintLeg(canvas, textures.get(leg.art), n, leg, paws[i], joints[i]);
  }
  const rgba = Buffer.alloc(canvas.length);
  for (let i = 0; i < canvas.length; i += 4) {
    const a = canvas[i + 3];
    rgba[i + 3] = Math.round(a * 255);
    if (!rgba[i + 3]) continue;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(canvas[i + c] / a);
  }
  return {rgba, paws, joints};
}

export function correctOnyankoponWalk(cells, n, painted) {
  const stride = ONYANKOPON_STRIDE * n / 256;
  const body = bodyTexture(cells[referencePose - 1], painted, n);
  const textures = new Map([hind, fore].map(art => [art, legTexture(painted, n, art)]));
  const count = cells.length * WALK_POSES_PER_FRAME;
  const poses = Array.from({length: count}, (_, i) => renderPose(body, textures, n, stride, i / count));
  return {
    cells: poses.filter((_, i) => i % WALK_POSES_PER_FRAME === 0).map(pose => pose.rgba),
    poses: poses.map(pose => pose.rgba),
    pawPositions: poses.map(({paws}) => legs.map((leg, i) => ({
      x: paws[i].x, y: leg.ground - paws[i].lift, planted: paws[i].planted, pitch: paws[i].pitch,
    }))),
    legJoints: poses.map(pose => pose.joints),
  };
}

const hash = data => createHash('sha256').update(data).digest('hex');
export function onyankoponWalkReport(walk, painted, n) {
  return {
    referencePose,
    paintedPose: {artwork: 'overlays/onyankopon_walk_fur.png', rgbaSha256: hash(painted)},
    posesPerFrame: WALK_POSES_PER_FRAME,
    stride: ONYANKOPON_STRIDE * n / 256,
    pawOrder: ['far hind', 'far fore', 'near hind', 'near fore'],
    pawPositions: walk.pawPositions,
    legJoints: walk.legJoints,
    runtimeRgbaSha256: walk.cells.map(hash),
    poseRgbaSha256: walk.poses.map(hash),
  };
}
