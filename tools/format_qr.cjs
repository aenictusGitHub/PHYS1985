/* Normalize the last three existing QR matrices to the first four cards.
 * This is a format/export operation: never regenerate or change QR payloads.
 * Run with Node.js; output is deterministic SVG and lossless RGBA PNG. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const directory = path.join(__dirname, '..', 'qr-codes');
const targets = [
  ['potentiel_force', 'Énergie potentielle et force'],
  ['moment_cinetique', 'Moment cinétique'],
  ['collisions', 'Collisions'],
];
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const size = Buffer.alloc(4), crc = Buffer.alloc(4), payload = Buffer.concat([Buffer.from(type), data]);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(payload));
  return Buffer.concat([size, payload, crc]);
}
function png(matrix, modules = 47, pixels = 12) {
  const size = modules * pixels, stride = 1 + size * 4, raw = Buffer.alloc(stride * size), header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const color = matrix[Math.floor(y / pixels)][Math.floor(x / pixels)] ? 0 : 255, offset = y * stride + 1 + x * 4;
    raw[offset] = color; raw[offset + 1] = color; raw[offset + 2] = color; raw[offset + 3] = 255;
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}
for (const [name, title] of targets) {
  const file = path.join(directory, name + '.svg'), old = fs.readFileSync(file, 'utf8');
  const viewBox = old.match(/viewBox="0 0 (45|47) \1"/), data = old.match(/<path\b[^>]*\bd="([^"]+)"/);
  assert(viewBox && data, name + ': known matrix format');
  const offset = viewBox[1] === '45' ? 1 : 0, matrix = Array.from({length: 47}, () => Array(47).fill(false));
  const segments = [...data[1].matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)];
  assert.equal(segments.map(m => m[0]).join(''), data[1], 'only rectangular module runs');
  for (const [,x,y,length,back] of segments) {
    assert.equal(length, back); const row = Number(y) + offset, start = Number(x) + offset;
    assert(row >= 5 && row < 42 && start >= 5 && start + Number(length) <= 42, '37 modules with five-module quiet zone');
    for (let i = 0; i < Number(length); i++) matrix[row][start + i] = true;
  }
  const runs = [];
  for (let y = 5; y < 42; y++) for (let x = 5; x < 42; x++) if (matrix[y][x]) {
    let length = 1; while (x + length < 42 && matrix[y][x + length]) length++;
    runs.push(`M${x} ${y}h${length}v1h-${length}z`); x += length - 1;
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 47 47" shape-rendering="crispEdges" role="img" aria-label="QR code vers l’animation ${title}">\n  <rect width="47" height="47" fill="#fff"/>\n  <path d="${runs.join('')}" fill="#000"/>\n</svg>`;
  fs.writeFileSync(file, svg); fs.writeFileSync(path.join(directory, name + '.png'), png(matrix));
  console.log(name + ': same QR matrix, black/white, five-module border, 564 × 564 PNG.');
}
