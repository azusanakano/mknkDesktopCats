import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp'))
  : require('sharp');

const [,, yuriInput, onyankoponInput, outputDir, yuriWalkInput, onyankoponWalkInput] = process.argv;
if (!yuriInput || !onyankoponInput || !outputDir || !yuriWalkInput || !onyankoponWalkInput) {
  console.error('usage: node build_assets.mjs <yuri-green.png> <onyankopon-green.png> <output-dir> <yuri-walk-8.png> <onyankopon-walk-8.png>');
  process.exit(2);
}

const FRAME_W = 256;
const FRAME_H = 256;
const COLS = 4;
const ROWS = 3;
const BASE_FRAMES = COLS * ROWS;
const FRAMES = 16;
const WALK_IDS = [0, 12, 1, 13, 2, 14, 3, 15];

fs.mkdirSync(outputDir, { recursive: true });
const frameDir = path.join(outputDir, 'frames');
fs.mkdirSync(frameDir, { recursive: true });

function clampByte(value) {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function chromaToRgba(rgb, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0, q = 0; p < rgb.length; p += 3, q += 4) {
    const r = rgb[p];
    const g = rgb[p + 1];
    const b = rgb[p + 2];
    const greenDominance = g - Math.max(r, b);

    let alpha;
    if (g > 150 && greenDominance >= 125) alpha = 0;
    else if (g > 115 && greenDominance > 38) alpha = clampByte((125 - greenDominance) * 255 / 87);
    else alpha = 255;

    if (alpha === 0) {
      rgba[q] = rgba[q + 1] = rgba[q + 2] = rgba[q + 3] = 0;
      continue;
    }

    const a = alpha / 255;
    // Undo the green-screen contribution at antialiased fur edges.
    rgba[q] = clampByte(r / a);
    rgba[q + 1] = clampByte((g - (1 - a) * 255) / a);
    rgba[q + 2] = clampByte(b / a);
    rgba[q + 3] = alpha;
  }
  return rgba;
}

function keepLargestComponentInCell(rgba, sheetWidth, left, top, cellW, cellH) {
  const labels = new Int32Array(cellW * cellH);
  const queue = new Int32Array(cellW * cellH);
  const sizes = [0];
  let label = 0;
  let largestLabel = 0;
  let largestSize = 0;

  const isVisible = localIndex => {
    const x = localIndex % cellW;
    const y = Math.floor(localIndex / cellW);
    return rgba[((top + y) * sheetWidth + left + x) * 4 + 3] > 8;
  };

  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || !isVisible(start)) continue;
    label++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    while (head < tail) {
      const current = queue[head++];
      const x = current % cellW;
      const y = Math.floor(current / cellW);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= cellW || ny < 0 || ny >= cellH) continue;
          const next = ny * cellW + nx;
          if (!labels[next] && isVisible(next)) {
            labels[next] = label;
            queue[tail++] = next;
          }
        }
      }
    }
    sizes[label] = tail;
    if (tail > largestSize) {
      largestSize = tail;
      largestLabel = label;
    }
  }

  for (let local = 0; local < labels.length; local++) {
    if (labels[local] === 0 || labels[local] === largestLabel) continue;
    const x = local % cellW;
    const y = Math.floor(local / cellW);
    const p = ((top + y) * sheetWidth + left + x) * 4;
    rgba[p] = rgba[p + 1] = rgba[p + 2] = rgba[p + 3] = 0;
  }
}

function cleanChromaEdges(rgba, width, height, cellW, cellH, rows = ROWS, cols = COLS) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      keepLargestComponentInCell(rgba, width, col * cellW, row * cellH, cellW, cellH);
    }
  }

  const original = Buffer.from(rgba);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const alpha = original[p + 3];
      if (!alpha) continue;
      let nearTransparency = alpha < 250;
      for (let dy = -2; !nearTransparency && dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (original[(ny * width + nx) * 4 + 3] < 12) { nearTransparency = true; break; }
        }
      }
      if (nearTransparency) {
        const maxRedBlue = Math.max(rgba[p], rgba[p + 2]);
        if (rgba[p + 1] > maxRedBlue + 3) rgba[p + 1] = maxRedBlue + 3;
      }
    }
  }
}

function encodeTransparentRle(premultipliedBgra) {
  const chunks = [];
  let pixel = 0;
  const totalPixels = premultipliedBgra.length / 4;
  while (pixel < totalPixels) {
    const alpha = premultipliedBgra[pixel * 4 + 3];
    if (alpha === 0) {
      let run = 1;
      while (run < 127 && pixel + run < totalPixels && premultipliedBgra[(pixel + run) * 4 + 3] === 0) run++;
      chunks.push(Buffer.from([0x80 | run]));
      pixel += run;
      continue;
    }

    let run = 1;
    while (run < 127 && pixel + run < totalPixels && premultipliedBgra[(pixel + run) * 4 + 3] !== 0) run++;
    chunks.push(Buffer.from([run]), premultipliedBgra.subarray(pixel * 4, (pixel + run) * 4));
    pixel += run;
  }
  return Buffer.concat(chunks);
}

function bounds(rgba) {
  let left=FRAME_W, top=FRAME_H, right=-1, bottom=-1;
  for(let y=0;y<FRAME_H;y++) for(let x=0;x<FRAME_W;x++) {
    if(rgba[(y*FRAME_W+x)*4+3] > 8) {
      left=Math.min(left,x); right=Math.max(right,x);
      top=Math.min(top,y); bottom=Math.max(bottom,y);
    }
  }
  if(right<left || bottom<top) throw new Error('empty sprite');
  return {left,top,right,bottom};
}

async function processSheet(name, inputPath, walkPath) {
  const image = sharp(inputPath).removeAlpha();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width % COLS !== 0 || metadata.height % ROWS !== 0) {
    throw new Error(`${name}: sprite sheet must divide evenly into ${COLS}x${ROWS}`);
  }

  const { data: rgb, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const rgba = chromaToRgba(rgb, info.width, info.height);
  const cellW = info.width / COLS;
  const cellH = info.height / ROWS;
  cleanChromaEdges(rgba, info.width, info.height, cellW, cellH);
  const encodedFrames = [];
  const originalWalkingBounds = [];

  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDir, `${name}_transparent_sheet.png`));

  for (let index = 0; index < BASE_FRAMES; index++) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const framePng = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: col * cellW, top: row * cellH, width: cellW, height: cellH })
      .resize(FRAME_W, FRAME_H, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const pngPath = path.join(frameDir, `${name}_${String(index).padStart(2, '0')}.png`);
    fs.writeFileSync(pngPath, framePng);

    const { data: frameRgba } = await sharp(framePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (index < 4) originalWalkingBounds.push(bounds(frameRgba));
    const bgra = Buffer.alloc(frameRgba.length);
    for (let p = 0; p < frameRgba.length; p += 4) {
      const a = frameRgba[p + 3];
      bgra[p] = Math.round(frameRgba[p + 2] * a / 255);
      bgra[p + 1] = Math.round(frameRgba[p + 1] * a / 255);
      bgra[p + 2] = Math.round(frameRgba[p] * a / 255);
      bgra[p + 3] = a;
    }
    encodedFrames.push(encodeTransparentRle(bgra));
  }
  const walkMeta = await sharp(walkPath).metadata();
  if (Math.abs(walkMeta.width / walkMeta.height - 2) > 0.02) {
    throw new Error(`${name}: walking sheet must be 4 columns x 2 rows of square cells`);
  }
  const {data: walkRgb} = await sharp(walkPath).removeAlpha()
    .resize(1024, 512, {fit: 'fill', kernel: sharp.kernel.lanczos3}).raw()
    .toBuffer({resolveWithObject: true});
  const walkRgba = chromaToRgba(walkRgb, 1024, 512);
  cleanChromaEdges(walkRgba, 1024, 512, FRAME_W, FRAME_H, 2, 4);
  const cells = [];
  for (let slot = 0; slot < 8; slot++) {
    const pixels = await sharp(walkRgba, {raw: {width: 1024, height: 512, channels: 4}})
      .extract({left: (slot % 4) * FRAME_W, top: Math.floor(slot / 4) * FRAME_H,
                width: FRAME_W, height: FRAME_H}).raw().toBuffer();
    cells.push({pixels, bounds: bounds(pixels)});
  }
  // All eight poses share a scale. Align the nose and floor; never stretch
  // individual limbs or blend two poses. Fur, body and feet remain one image.
  const median = values => [...values].sort((a, b) => a-b)[Math.floor(values.length / 2)];
  const targetRight = median(originalWalkingBounds.map(b => b.right));
  const targetFloor = median(originalWalkingBounds.map(b => b.bottom));
  const originalWidth = median(originalWalkingBounds.map(b => b.right-b.left+1));
  const sourceWidth = median(cells.map(c => c.bounds.right-c.bounds.left+1));
  const scale = Math.min(originalWidth / sourceWidth,
    ...cells.map(c => Math.min((targetRight - 4)/(c.bounds.right-c.bounds.left+1),
                               (targetFloor - 4)/(c.bounds.bottom-c.bounds.top+1))));
  const previewCells = [];
  const alignment = [];
  for (let slot = 0; slot < 8; slot++) {
    const {pixels, bounds: b} = cells[slot];
    const width = Math.max(1, Math.round((b.right-b.left+1)*scale));
    const height = Math.max(1, Math.round((b.bottom-b.top+1)*scale));
    const crop = await sharp(pixels, {raw: {width: FRAME_W, height: FRAME_H, channels: 4}})
      .extract({left:b.left,top:b.top,width:b.right-b.left+1,height:b.bottom-b.top+1})
      .resize(width,height,{kernel:sharp.kernel.lanczos3}).png().toBuffer();
    const png = await sharp({create:{width:FRAME_W,height:FRAME_H,channels:4,
                          background:{r:0,g:0,b:0,alpha:0}}})
      .composite([{input:crop,left:targetRight-width+1,top:targetFloor-height+1}])
      .png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    fs.writeFileSync(path.join(frameDir, `${name}_${String(WALK_IDS[slot]).padStart(2,'0')}.png`),png);
    fs.mkdirSync(path.join(outputDir,'walk'),{recursive:true});
    fs.writeFileSync(path.join(outputDir,'walk',`${name}_walk_${String(slot).padStart(2,'0')}.png`),png);
    const frameRgba = await sharp(png).ensureAlpha().raw().toBuffer();
    const bgra = Buffer.alloc(frameRgba.length);
    for(let p=0;p<frameRgba.length;p+=4){
      const a=frameRgba[p+3];
      bgra[p]=Math.round(frameRgba[p+2]*a/255);
      bgra[p+1]=Math.round(frameRgba[p+1]*a/255);
      bgra[p+2]=Math.round(frameRgba[p]*a/255);
      bgra[p+3]=a;
    }
    encodedFrames[WALK_IDS[slot]]=encodeTransparentRle(bgra);
    previewCells.push({input:png,left:(slot%4)*FRAME_W,top:Math.floor(slot/4)*FRAME_H});
    alignment.push(bounds(frameRgba));
  }
  await sharp({create:{width:1024,height:512,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite(previewCells).png({compressionLevel:9}).toFile(path.join(outputDir,`${name}_walk_sheet.png`));
  fs.writeFileSync(path.join(outputDir,`${name}_walk_alignment.json`),JSON.stringify({
    scale,targetRight,targetFloor,frames:alignment},null,2));
  return encodedFrames;
}

const yuriFrames = await processSheet('yuri', yuriInput, yuriWalkInput);
const onyankoponFrames = await processSheet('onyankopon', onyankoponInput, onyankoponWalkInput);
const frames = [...yuriFrames, ...onyankoponFrames];

const headerSize = 24 + frames.length * 8;
const header = Buffer.alloc(headerSize);
header.write('MKCT', 0, 'ascii');
header.writeUInt32LE(1, 4);
header.writeUInt32LE(FRAME_W, 8);
header.writeUInt32LE(FRAME_H, 12);
header.writeUInt32LE(2, 16);
header.writeUInt32LE(FRAMES, 20);

let offset = headerSize;
for (let i = 0; i < frames.length; i++) {
  header.writeUInt32LE(offset, 24 + i * 8);
  header.writeUInt32LE(frames[i].length, 28 + i * 8);
  offset += frames[i].length;
}

const blob = Buffer.concat([header, ...frames]);
fs.writeFileSync(path.join(outputDir, 'sprites.rle'), blob);
fs.writeFileSync(path.join(outputDir, 'asset-report.json'), JSON.stringify({
  version: 1,
  width: FRAME_W,
  height: FRAME_H,
  cats: 2,
  framesPerCat: FRAMES,
  walkingFramesPerCat: WALK_IDS.length,
  walkingFrameIds: WALK_IDS,
  normalWalkCycleMs: 600,
  normalWalkFrameMs: 75,
  sourceStrideWasMs: 600,
  uncompressedBytes: 2 * FRAMES * FRAME_W * FRAME_H * 4,
  encodedBytes: blob.length,
  ratio: Number((blob.length / (2 * FRAMES * FRAME_W * FRAME_H * 4)).toFixed(4)),
  sources: { yuri: path.basename(yuriInput), onyankopon: path.basename(onyankoponInput),
    yuriWalk: path.basename(yuriWalkInput), onyankoponWalk: path.basename(onyankoponWalkInput) }
}, null, 2));

console.log(`sprites: ${frames.length} frames, ${blob.length} bytes`);
