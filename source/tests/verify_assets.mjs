import fs from 'node:fs';
import crypto from 'node:crypto';

const file = process.argv[2];
if (!file) throw new Error('sprites.rle path is required');
const blob = fs.readFileSync(file);
if (blob.subarray(0, 4).toString('ascii') !== 'MKCT') throw new Error('bad asset magic');
const version = blob.readUInt32LE(4);
const width = blob.readUInt32LE(8);
const height = blob.readUInt32LE(12);
const cats = blob.readUInt32LE(16);
const frames = blob.readUInt32LE(20);
if (version !== 1 || width !== 256 || height !== 256 || cats !== 2 || frames !== 12) throw new Error('bad asset header');

const hashes = new Set();
const coverages = [];
for (let index = 0; index < cats * frames; index++) {
  const offset = blob.readUInt32LE(24 + index * 8);
  const size = blob.readUInt32LE(28 + index * 8);
  if (offset < 24 + cats * frames * 8 || offset + size > blob.length) throw new Error(`frame ${index}: bad range`);
  const output = Buffer.alloc(width * height * 4);
  let source = offset;
  let pixel = 0;
  while (source < offset + size && pixel < width * height) {
    const tag = blob[source++];
    const run = tag & 0x7f;
    if (!run || pixel + run > width * height) throw new Error(`frame ${index}: bad run`);
    if (tag & 0x80) pixel += run;
    else {
      const bytes = run * 4;
      blob.copy(output, pixel * 4, source, source + bytes);
      source += bytes;
      pixel += run;
    }
  }
  if (pixel !== width * height || source !== offset + size) throw new Error(`frame ${index}: incomplete decode`);
  let visible = 0;
  for (let p = 3; p < output.length; p += 4) if (output[p] > 8) visible++;
  const coverage = visible / (width * height);
  if (coverage < 0.04 || coverage > 0.75) throw new Error(`frame ${index}: suspicious alpha coverage ${coverage}`);
  coverages.push(coverage);
  hashes.add(crypto.createHash('sha256').update(output).digest('hex'));
}
if (hashes.size !== cats * frames) throw new Error('duplicate sprite frames detected');
console.log(JSON.stringify({ version, width, height, cats, frames, encodedBytes: blob.length,
  uniqueFrames: hashes.size, minCoverage: Math.min(...coverages), maxCoverage: Math.max(...coverages) }, null, 2));
