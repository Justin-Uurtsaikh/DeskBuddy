'use strict';

// DeskBuddy's starter set is intentionally drawn in code at a tiny resolution.
// Every mark below lands on an integer pixel: no filters, gradients, or generated art.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const CELL = 32;
const COLUMNS = 4;
const ROWS = 2;
const WIDTH = CELL * COLUMNS;
const HEIGHT = CELL * ROWS;
const ROOT = path.resolve(__dirname, '..');

const rgba = new Uint8Array(WIDTH * HEIGHT * 4);

function hex(value) {
  const normalized = value.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
    255,
  ];
}

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 4;
  rgba.set(color, index);
}

function makeFrame(column, row) {
  const offsetX = column * CELL;
  const offsetY = row * CELL;

  function pixel(x, y, color) {
    setPixel(offsetX + x, offsetY + y, color);
  }

  function rect(x, y, width, height, color) {
    for (let py = y; py < y + height; py += 1) {
      for (let px = x; px < x + width; px += 1) pixel(px, py, color);
    }
  }

  function ellipse(x, y, width, height, color) {
    const centerX = x + (width - 1) / 2;
    const centerY = y + (height - 1) / 2;
    const radiusX = width / 2;
    const radiusY = height / 2;
    for (let py = y; py < y + height; py += 1) {
      for (let px = x; px < x + width; px += 1) {
        const dx = (px - centerX) / radiusX;
        const dy = (py - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1) pixel(px, py, color);
      }
    }
  }

  function polygon(points, color) {
    const minX = Math.floor(Math.min(...points.map(([x]) => x)));
    const maxX = Math.ceil(Math.max(...points.map(([x]) => x)));
    const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
    const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        let inside = false;
        for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
          const [cx, cy] = points[current];
          const [px0, py0] = points[previous];
          const crosses = (cy > py + 0.5) !== (py0 > py + 0.5);
          if (crosses && px + 0.5 < ((px0 - cx) * (py + 0.5 - cy)) / (py0 - cy) + cx) inside = !inside;
        }
        if (inside) pixel(px, py, color);
      }
    }
  }

  function line(x0, y0, x1, y1, color, thickness = 1) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      rect(x, y, thickness, thickness, color);
      if (x === x1 && y === y1) break;
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  return { pixel, rect, ellipse, polygon, line };
}

const ink = hex('#202117');

function drawSprout(frame, clip, index) {
  const leafDark = hex('#40552d');
  const leaf = hex('#6f8742');
  const face = hex('#d39a55');
  const cheek = hex('#db7052');
  const feet = hex('#6e4029');
  const y = clip === 'walk' ? [0, -1, 0, -2][index] : [0, -1, 0, 0][index];

  frame.line(15, 8 + y, 15, 4 + y, leafDark, 2);
  if (index % 2 === 0) {
    frame.polygon([[15, 6 + y], [10, 2 + y], [8, 3 + y], [10, 7 + y]], leafDark);
    frame.polygon([[15, 5 + y], [20, 1 + y], [22, 3 + y], [20, 6 + y]], leaf);
  } else {
    frame.polygon([[15, 6 + y], [9, 4 + y], [8, 6 + y], [12, 8 + y]], leafDark);
    frame.polygon([[15, 5 + y], [19, 2 + y], [22, 4 + y], [19, 7 + y]], leaf);
  }

  frame.ellipse(7, 8 + y, 18, 17, ink);
  frame.ellipse(9, 10 + y, 14, 13, face);
  frame.rect(8, 17 + y, 16, 7, face);
  frame.rect(9, 22 + y, 14, 3, leafDark);
  frame.pixel(12, 15 + y, ink);
  frame.pixel(19, 15 + y, ink);
  frame.rect(15, 18 + y, 2, 1, ink);
  frame.pixel(10, 18 + y, cheek);
  frame.pixel(21, 18 + y, cheek);
  frame.rect(6, 17 + y, 2, 5, ink);
  frame.rect(24, 17 + y, 2, 5, ink);

  if (clip === 'walk') {
    const left = index % 2 === 0 ? 24 : 25;
    const right = index % 2 === 0 ? 25 : 24;
    frame.rect(10, left + y, 5, 2, ink);
    frame.rect(18, right + y, 5, 2, ink);
    frame.rect(index % 2 === 0 ? 8 : 19, 26 + y, 7, 2, feet);
  } else {
    frame.rect(10, 24 + y, 5, 3, ink);
    frame.rect(18, 24 + y, 5, 3, ink);
  }
}

function drawMochi(frame, clip, index) {
  const outline = hex('#39332d');
  const fur = hex('#eee3c8');
  const shadow = hex('#c8bda7');
  const pink = hex('#c88382');
  const y = clip === 'walk' ? [-1, -3, -1, -2][index] : [0, 0, -1, 0][index];
  const flop = index === 2 ? 2 : 0;

  frame.ellipse(9, 1 + y, 6, 13, outline);
  frame.rect(11, 3 + y, 2, 8, pink);
  frame.polygon([[18, 12 + y], [19, 2 + y], [23 + flop, 3 + y], [24, 6 + y], [22, 14 + y]], outline);
  frame.polygon([[20, 10 + y], [20, 4 + y], [22 + flop, 5 + y], [21, 11 + y]], pink);
  frame.ellipse(7, 9 + y, 18, 15, outline);
  frame.ellipse(9, 11 + y, 14, 12, fur);
  frame.rect(10, 20 + y, 13, 6, fur);
  frame.rect(22, 15 + y, 3, 5, shadow);
  frame.rect(12, 15 + y, 2, 2, outline);
  if (clip === 'idle' && index === 2) frame.rect(18, 16 + y, 3, 1, outline);
  else frame.rect(19, 15 + y, 2, 2, outline);
  frame.pixel(16, 18 + y, pink);
  frame.rect(15, 20 + y, 3, 1, outline);
  frame.rect(6, 19 + y, 3, 4, outline);
  frame.pixel(6, 18 + y, fur);

  if (clip === 'walk') {
    frame.rect(index % 2 === 0 ? 8 : 14, 25 + y, 8, 3, outline);
    frame.rect(index % 2 === 0 ? 18 : 11, 24 + y, 7, 3, shadow);
  } else {
    frame.rect(9, 25 + y, 7, 3, outline);
    frame.rect(18, 25 + y, 7, 3, outline);
  }
}

function drawMiso(frame, clip, index) {
  const outline = hex('#33271e');
  const orange = hex('#c87535');
  const cream = hex('#efc675');
  const stripe = hex('#74452e');
  const y = clip === 'walk' ? [0, -1, 0, -1][index] : [0, -1, 0, 0][index];

  frame.line(8, 18 + y, 4, 13 + y - (index % 2), outline, 3);
  frame.line(4, 13 + y - (index % 2), 7, 9 + y, outline, 2);
  frame.line(8, 18 + y, 4, 13 + y - (index % 2), orange, 1);
  frame.ellipse(7, 14 + y, 17, 11, outline);
  frame.rect(9, 16 + y, 14, 8, orange);
  frame.polygon([[11, 10 + y], [12, 4 + y], [17, 9 + y]], outline);
  frame.polygon([[19, 9 + y], [24, 5 + y], [24, 13 + y]], outline);
  frame.rect(11, 9 + y, 14, 11, outline);
  frame.rect(13, 10 + y, 11, 9, orange);
  frame.polygon([[13, 9 + y], [13, 6 + y], [16, 9 + y]], cream);
  frame.polygon([[21, 9 + y], [23, 7 + y], [23, 10 + y]], cream);
  frame.rect(15, 10 + y, 2, 4, stripe);
  frame.pixel(15, 14 + y, outline);
  frame.rect(21, 13 + y, 2, 1, outline);
  frame.pixel(19, 16 + y, outline);
  frame.line(19, 17 + y, 17, 18 + y, outline);
  frame.line(20, 17 + y, 23, 18 + y, outline);
  frame.rect(11, 18 + y, 3, 2, cream);
  frame.rect(13, 20 + y, 2, 4, stripe);
  frame.rect(19, 20 + y, 2, 4, stripe);

  if (clip === 'walk') {
    frame.rect(index % 2 === 0 ? 9 : 15, 24 + y, 6, 3, outline);
    frame.rect(index % 2 === 0 ? 19 : 12, 24 + y, 6, 3, outline);
  } else {
    frame.rect(10, 24 + y, 5, 3, outline);
    frame.rect(19, 24 + y, 5, 3, outline);
  }
}

function drawTaro(frame, clip, index) {
  const outline = hex('#28212f');
  const plum = hex('#6d4b77');
  const light = hex('#a17fa3');
  const eye = hex('#eee0a1');
  const y = clip === 'walk' ? [0, -2, 0, -1][index] : [0, 0, -1, 0][index];
  const wide = clip === 'idle' && index === 2 ? 1 : 0;

  frame.ellipse(6 - wide, 5 + y, 21 + wide * 2, 21, outline);
  frame.ellipse(8 - wide, 7 + y, 17 + wide * 2, 17, plum);
  frame.rect(7 - wide, 17 + y, 19 + wide * 2, 8, plum);
  frame.ellipse(11, 10 + y, 10, 9, outline);
  frame.ellipse(13, 12 + y, 6, 5, eye);
  frame.rect(index === 1 ? 16 : 15, 13 + y, 2, 3, outline);
  frame.pixel(10, 20 + y, light);
  frame.pixel(22, 19 + y, light);

  const feet = clip === 'walk'
    ? (index % 2 === 0 ? [[6, 23, 6], [14, 24, 5], [22, 22, 5]] : [[5, 22, 5], [12, 24, 6], [21, 24, 7]])
    : [[7, 23, 5], [14, 24, 5], [21, 23, 5]];
  for (const [x, footY, width] of feet) frame.ellipse(x, footY + y, width, 5, outline);
}

function drawHoney(frame, clip, index) {
  const outline = hex('#2b241b');
  const gold = hex('#d49b2f');
  const pale = hex('#eee4b2');
  const blue = hex('#87a9a2');
  const y = clip === 'walk' ? [-1, -3, -1, -2][index] : [-1, -2, -1, 0][index];
  const wingsUp = index % 2 === 0;

  frame.line(17, 9 + y, 15, 5 + y, outline);
  frame.line(21, 9 + y, 23, 5 + y, outline);
  frame.pixel(14, 4 + y, gold);
  frame.pixel(23, 4 + y, gold);
  if (wingsUp) {
    frame.ellipse(5, 8 + y, 10, 8, outline);
    frame.ellipse(7, 9 + y, 7, 5, pale);
    frame.ellipse(21, 8 + y, 8, 8, outline);
    frame.ellipse(22, 9 + y, 6, 5, blue);
  } else {
    frame.ellipse(5, 14 + y, 10, 7, outline);
    frame.ellipse(7, 15 + y, 7, 4, blue);
    frame.ellipse(21, 14 + y, 8, 7, outline);
    frame.ellipse(22, 15 + y, 6, 4, pale);
  }
  frame.ellipse(10, 9 + y, 16, 14, outline);
  frame.rect(12, 11 + y, 12, 10, gold);
  frame.rect(14, 10 + y, 7, 2, gold);
  frame.rect(13, 15 + y, 11, 3, outline);
  frame.rect(19, 11 + y, 2, 2, outline);
  frame.rect(22, 13 + y, 2, 1, outline);
  frame.pixel(24, 18 + y, gold);
  frame.polygon([[10, 15 + y], [6, 17 + y], [10, 19 + y]], outline);
}

function drawButton(frame, clip, index) {
  const outline = hex('#2d211c');
  const cap = hex('#9a4432');
  const capDark = hex('#633329');
  const stem = hex('#e4c68d');
  const spot = hex('#f1dfa7');
  const y = clip === 'walk' ? [0, -1, 0, -2][index] : [0, 0, -1, 0][index];

  frame.ellipse(3, 5 + y, 26, 13, outline);
  frame.ellipse(5, 7 + y, 22, 9, cap);
  frame.rect(4, 12 + y, 24, 5, outline);
  frame.rect(7, 12 + y, 19, 3, capDark);
  frame.rect(9, 7 + y, 4, 3, spot);
  frame.rect(20, 9 + y, 3, 2, spot);
  frame.pixel(16, 6 + y, spot);
  frame.polygon([[11, 15 + y], [23, 15 + y], [21, 26 + y], [12, 26 + y]], outline);
  frame.polygon([[13, 16 + y], [21, 16 + y], [20, 24 + y], [13, 24 + y]], stem);
  frame.rect(14, 19 + y, 2, 2, outline);
  frame.rect(19, 19 + y, 2, 2, outline);
  frame.rect(16, 22 + y, 3, 1, capDark);
  if (clip === 'walk') {
    frame.line(14, 25 + y, index % 2 === 0 ? 10 : 15, 28 + y, outline, 2);
    frame.line(20, 25 + y, index % 2 === 0 ? 21 : 25, 28 + y, outline, 2);
  } else {
    frame.rect(12, 25 + y, 5, 3, outline);
    frame.rect(19, 25 + y, 5, 3, outline);
  }
}

function drawNori(frame, clip, index) {
  const outline = hex('#172a25');
  const green = hex('#37604a');
  const bright = hex('#718657');
  const belly = hex('#a7a66e');
  const y = clip === 'walk' ? [0, -1, 0, -2][index] : [0, 0, -1, 0][index];

  frame.ellipse(5, 8 + y, 8, 8, outline);
  frame.ellipse(19, 7 + y, 8, 9, outline);
  frame.rect(7, 11 + y, 19, 4, outline);
  frame.ellipse(4, 11 + y, 24, 15, outline);
  frame.ellipse(6, 13 + y, 20, 11, green);
  frame.rect(8, 17 + y, 16, 7, green);
  frame.ellipse(7, 9 + y, 5, 5, bright);
  frame.ellipse(20, 8 + y, 5, 6, bright);
  frame.pixel(9, 11 + y, outline);
  frame.rect(21, 10 + y, 2, 2, outline);
  frame.rect(11, 16 + y, 3, 1, outline);
  frame.rect(20, 16 + y, 2, 1, outline);
  frame.rect(14, 20 + y, 6, 2, belly);
  frame.rect(7, 22 + y, 18, 2, bright);

  if (clip === 'walk') {
    frame.ellipse(index % 2 === 0 ? 1 : 8, 23 + y, 11, 5, outline);
    frame.ellipse(index % 2 === 0 ? 21 : 14, 23 + y, 10, 5, outline);
  } else {
    frame.ellipse(3, 23 + y, 10, 5, outline);
    frame.ellipse(20, 23 + y, 10, 5, outline);
  }
}

function drawMaple(frame, clip, index) {
  const outline = hex('#2c211c');
  const rust = hex('#ad562f');
  const dark = hex('#613324');
  const cream = hex('#efc98d');
  const y = clip === 'walk' ? [0, -1, 0, -2][index] : [0, -1, 0, 0][index];

  const tailLift = index % 2;
  frame.polygon([[11, 18 + y], [5, 12 + y - tailLift], [2, 15 + y - tailLift], [5, 24 + y], [12, 22 + y]], outline);
  frame.polygon([[10, 18 + y], [5, 14 + y - tailLift], [4, 16 + y - tailLift], [6, 22 + y], [12, 20 + y]], rust);
  frame.polygon([[5, 14 + y - tailLift], [2, 15 + y - tailLift], [4, 19 + y]], cream);
  frame.ellipse(8, 14 + y, 16, 11, outline);
  frame.rect(10, 16 + y, 14, 8, rust);
  frame.polygon([[13, 12 + y], [14, 5 + y], [19, 11 + y]], outline);
  frame.polygon([[20, 11 + y], [24, 5 + y], [26, 14 + y]], outline);
  frame.polygon([[15, 10 + y], [15, 7 + y], [18, 11 + y]], cream);
  frame.polygon([[22, 10 + y], [24, 7 + y], [24, 12 + y]], dark);
  frame.polygon([[12, 11 + y], [24, 10 + y], [29, 16 + y], [23, 20 + y], [13, 18 + y]], outline);
  frame.polygon([[14, 12 + y], [23, 12 + y], [27, 16 + y], [22, 18 + y], [14, 17 + y]], rust);
  frame.polygon([[20, 15 + y], [27, 16 + y], [22, 19 + y]], cream);
  frame.pixel(28, 15 + y, outline);
  frame.rect(20, 13 + y, 2, 2, outline);
  frame.pixel(24, 18 + y, dark);
  frame.rect(12, 20 + y, 3, 4, dark);
  if (clip === 'walk') {
    frame.rect(index % 2 === 0 ? 8 : 14, 23 + y, 7, 3, outline);
    frame.rect(index % 2 === 0 ? 19 : 12, 23 + y, 7, 3, outline);
  } else {
    frame.rect(9, 23 + y, 6, 3, outline);
    frame.rect(19, 23 + y, 6, 3, outline);
  }
}

function drawPudding(frame, clip, index) {
  const outline = hex('#382a1d');
  const custard = hex('#e1b94e');
  const light = hex('#f4dd7c');
  const caramel = hex('#8e512c');
  const cherry = hex('#9d3f35');
  const y = clip === 'walk' ? [0, -2, 0, -1][index] : [0, 0, -1, 0][index];
  const wobble = index % 2 === 0 ? 0 : 1;

  frame.line(18, 7 + y, 20 + wobble, 3 + y, outline);
  frame.ellipse(16 + wobble, 2 + y, 6, 6, outline);
  frame.rect(18 + wobble, 3 + y, 3, 3, cherry);
  frame.polygon([[8 - wobble, 10 + y], [23 + wobble, 10 + y], [27, 25 + y], [5, 25 + y]], outline);
  frame.polygon([[10 - wobble, 12 + y], [22 + wobble, 12 + y], [24, 23 + y], [8, 23 + y]], custard);
  frame.rect(8 - wobble, 10 + y, 17 + wobble * 2, 5, caramel);
  frame.rect(11, 12 + y, 4, 2, light);
  frame.rect(12, 17 + y, 2, 2, outline);
  frame.rect(19, 17 + y, 2, 2, outline);
  if (index === 3 && clip === 'idle') frame.rect(15, 20 + y, 4, 2, outline);
  else {
    frame.pixel(16, 20 + y, outline);
    frame.pixel(17, 21 + y, outline);
    frame.pixel(18, 20 + y, outline);
  }
  frame.rect(9, 22 + y, 3, 1, light);
  if (clip === 'walk') {
    frame.rect(index % 2 === 0 ? 6 : 12, 25 + y, 7, 3, outline);
    frame.rect(index % 2 === 0 ? 20 : 14, 25 + y, 7, 3, outline);
  } else {
    frame.rect(7, 25 + y, 7, 3, outline);
    frame.rect(19, 25 + y, 7, 3, outline);
  }
}

const characters = [
  ['sprout', drawSprout],
  ['mochi', drawMochi],
  ['miso', drawMiso],
  ['taro', drawTaro],
  ['honey', drawHoney],
  ['button', drawButton],
  ['nori', drawNori],
  ['maple', drawMaple],
  ['pudding', drawPudding],
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(scanlines, target + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(drawCharacter) {
  rgba.fill(0);
  for (let row = 0; row < ROWS; row += 1) {
    const clip = row === 0 ? 'idle' : 'walk';
    for (let column = 0; column < COLUMNS; column += 1) {
      drawCharacter(makeFrame(column, row), clip, column);
    }
  }
  return encodePng(WIDTH, HEIGHT, rgba);
}

for (const [name, drawCharacter] of characters) {
  const png = render(drawCharacter);
  const destination = path.join(ROOT, 'src', 'assets', 'presets', `${name}-sheet.png`);
  fs.writeFileSync(destination, png);
  if (name === 'sprout') fs.writeFileSync(path.join(ROOT, 'docs', 'assets', 'sprout-sheet.png'), png);
  process.stdout.write(`wrote ${path.relative(ROOT, destination)} (${WIDTH}x${HEIGHT})\n`);
}
