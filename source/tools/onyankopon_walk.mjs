import {createHash} from 'node:crypto';

// Forepaws alternate support. At 48px of travel per 256px canvas per cycle,
// a planted toe must move back by about 10px per pose on the 425px artwork.
// Each pin is [source x, corrected x, vertical shift] in that artwork.
const forelegs = [
  {source: 5, pins: [[240, 268, -10], [366, 340, 1]], preserveLegWidth: true},
  {source: 4, pins: [[228, 250, -16], [341, 330, 1]], preserveLegWidth: true},
  {source: 3, pins: [[298, 320, -3]]},
  {source: 2, pins: [[277, 310, 1], [351, 350, 0]]},
  {source: 1, pins: [[261, 300, 0], [383, 348, 2]]},
  {source: 6, pins: [[309, 338, -1]]},
  {source: 7, pins: [[301, 328, 1]]},
  {source: 2, pins: [[277, 318, 1], [351, 343, -9]]},
];
const firstColumn = 206;
const firstRow = 221;
const bellyLeft = 192;
const bellyTop = 227;
const bellyBottom = 274;

function smoothstep(start, end, value) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function forelegEdges(pixels, size, y, near) {
  // At this height the donor's two front legs have separate outlines.
  const row = Math.round(Math.max(265, Math.min(near ? 340 : 332, y))) * size;
  const step = near ? -1 : 1;
  const solid = x => pixels[(row + x) * 4 + 3] >= 128;
  let edge = near ? size - 1 : firstColumn + 3;
  while (!solid(edge)) edge += step;
  let inner = edge + step;
  while (solid(inner)) inner += step;
  return [Math.min(edge, inner) - 2, Math.max(edge, inner) + 2];
}

function widthPreservingRow(donor, size, y, bend, pins) {
  const [swing, planted] = pins;
  const [swingLeft, swingRight] = forelegEdges(donor, size, y - swing[2] * bend, false);
  const [plantLeft, plantRight] = forelegEdges(donor, size, y - planted[2] * bend, true);
  const toeShift = (planted[1] - planted[0]) * bend;
  const insideEdge = Math.min(swingRight, plantLeft - 1);
  const swingShift = Math.min((swing[1] - swing[0]) * bend, plantLeft + toeShift - insideEdge - 1);
  // Translate each outline at full width. Only the empty gap between the
  // legs and the margins absorb the relative change in their positions.
  return [
    [firstColumn, firstColumn, 0],
    [swingLeft, swingLeft + swingShift, swing[2]],
    [insideEdge, insideEdge + swingShift, swing[2]],
    [plantLeft, plantLeft + toeShift, planted[2]],
    [plantRight, plantRight + toeShift, planted[2]],
    [size - 1, size - 1, 0],
  ];
}

function blendPixel(output, at, source, x, y, size, amount) {
  const left = Math.floor(x), top = Math.floor(y);
  const fx = x - left, fy = y - top;
  const samples = [
    [(top * size + left) * 4, (1 - fx) * (1 - fy)],
    [(top * size + left + 1) * 4, fx * (1 - fy)],
    [((top + 1) * size + left) * 4, (1 - fx) * fy],
    [((top + 1) * size + left + 1) * 4, fx * fy],
  ];
  const oldAlpha = output[at + 3] * (1 - amount);
  let alpha = oldAlpha;
  let red = output[at] * oldAlpha;
  let green = output[at + 1] * oldAlpha;
  let blue = output[at + 2] * oldAlpha;
  for (const [index, weight] of samples) {
    if (!weight) continue;
    const coverage = source[index + 3] * weight * amount;
    alpha += coverage;
    red += source[index] * coverage;
    green += source[index + 1] * coverage;
    blue += source[index + 2] * coverage;
  }
  output[at + 3] = Math.round(alpha);
  if (!alpha) return;
  output[at] = Math.round(red / alpha);
  output[at + 1] = Math.round(green / alpha);
  output[at + 2] = Math.round(blue / alpha);
}

function blendBellyFur(frame, size, fur) {
  const furTip = 23;
  const fullBelly = 260; // Central underside of Yuri's walking silhouette.
  for (let column = 0; column < fur.width; column++) {
    const x = bellyLeft + column;
    let edge = 235;
    while (edge < fullBelly && frame[(edge * size + x) * 4 + 3] >= 100) edge++;
    // Columns that continue into a leg have no exposed belly outline.
    if (edge === fullBelly) continue;
    const feather = smoothstep(0, 8, Math.min(column, fur.width - 1 - column));
    const top = edge - 8;
    const length = 8 + (fullBelly - edge) * feather;
    for (let y = top; y < bellyBottom; y++) {
      const row = Math.round((y - top) * furTip / length);
      if (row >= fur.height) break;
      const at = (y * size + x) * 4;
      const patchAt = (row * fur.width + column) * 4;
      const oldAlpha = frame[at + 3];
      const newAlpha = fur.pixels[patchAt + 3] * feather * (1 - oldAlpha / 255);
      if (!newAlpha) continue;
      const alpha = oldAlpha + newAlpha;
      for (let channel = 0; channel < 3; channel++) {
        frame[at + channel] = Math.round((frame[at + channel] * oldAlpha + fur.pixels[patchAt + channel] * newAlpha) / alpha);
      }
      frame[at + 3] = Math.round(alpha);
    }
  }
}

export function correctOnyankoponWalk(cells, size, fur) {
  return forelegs.map(({source, pins, preserveLegWidth}, slot) => {
    const result = Buffer.from(cells[slot]);
    const donor = cells[source - 1];
    // Keep the toe widths around each pin. Ease displacement towards
    // the shoulder so only the foreleg silhouette is articulated.
    const controls = [[firstColumn, firstColumn, 0]];
    for (const [x, target, dy] of pins) {
      controls.push([x - 10, target - 10, dy], [x + 10, target + 10, dy]);
    }
    controls.push([size - 1, size - 1, 0]);
    for (let y = firstRow + 1; y < 374; y++) {
      const bend = smoothstep(235, 332, y);
      const shoulder = smoothstep(firstRow, 260, y);
      const row = preserveLegWidth
        ? widthPreservingRow(donor, size, y, bend, pins)
        : controls.map(([from, to, dy]) => [from, from + (to - from) * bend, dy]);
      let segment = 0;
      for (let x = firstColumn + 1; x < size - 1; x++) {
        while (row[segment + 1][1] < x) segment++;
        const [left, from, leftDy] = row[segment];
        const [right, to, rightDy] = row[segment + 1];
        const ratio = (x - from) / (to - from);
        const sampleX = left + (right - left) * ratio;
        const sampleY = y - (leftDy + (rightDy - leftDy) * ratio) * bend;
        const amount = smoothstep(firstColumn, 222, x) * shoulder;
        blendPixel(result, (y * size + x) * 4, donor, sampleX, sampleY, size, amount);
      }
    }
    blendBellyFur(result, size, fur);
    return result;
  });
}

export function onyankoponWalkReport(cells, fur) {
  return {
    forelegSourceFrames: forelegs.map(({source}) => source),
    forelegPins: forelegs.map(({pins}) => pins),
    widthPreservedIn: forelegs.flatMap(({preserveLegWidth}, slot) => preserveLegWidth ? [slot + 1] : []),
    alteredRegion: {minX: firstColumn + 1, minY: firstRow + 1},
    bellyFur: {
      artwork: 'overlays/onyankopon_belly_fur.png',
      width: fur.width, height: fur.height,
      rgbaSha256: createHash('sha256').update(fur.pixels).digest('hex'),
      region: {minX: bellyLeft, maxX: bellyLeft + fur.width - 1, minY: bellyTop, maxY: bellyBottom - 1},
    },
    runtimeRgbaSha256: cells.map(cell => createHash('sha256').update(cell).digest('hex')),
  };
}
