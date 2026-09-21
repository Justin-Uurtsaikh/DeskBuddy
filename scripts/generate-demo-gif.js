'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const projectRoot = path.resolve(__dirname, '..');
const spritePath = path.join(projectRoot, 'src', 'assets', 'presets', 'sprout-sheet.png');
const outputPath = path.join(projectRoot, 'docs', 'assets', 'deskprite-demo.gif');
const stillOutputPath = path.join(projectRoot, 'docs', 'assets', 'deskprite-demo-still.png');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const WIDTH = 640;
const HEIGHT = 360;
const SPRITE_SIZE = 104;
const FRAME_DELAY = 6;
const REPEAT_COUNT = 0;

const COLORS = {
  forest: [22, 11, 8],
  ink: [30, 32, 21],
  pine: [53, 59, 32],
  bark: [75, 60, 34],
  moss: [100, 105, 60],
  cedar: [115, 68, 37],
  sage: [180, 171, 98],
  gold: [194, 185, 108],
  paper: [242, 234, 196],
};

const FONT = {
  ' ': ['000', '000', '000', '000', '000'],
  '/': ['001', '001', '010', '100', '100'],
  B: ['110', '101', '110', '101', '110'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  K: ['101', '101', '110', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  Y: ['101', '101', '010', '010', '010'],
};

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeRgbaPng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Sprout must be a PNG file.');

  let width;
  let height;
  const compressedParts = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('Sprout must be a non-interlaced 8-bit RGBA PNG.');
      }
    } else if (type === 'IDAT') {
      compressedParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (!width || !height || !compressedParts.length) throw new Error('Sprout PNG data is incomplete.');
  const inflated = zlib.inflateSync(Buffer.concat(compressedParts));
  const rowBytes = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * rowBytes;
    const previousOffset = rowOffset - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const above = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[previousOffset + x - 4] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paeth(left, above, upperLeft);
      else throw new Error('Unsupported PNG row filter: ' + filter);
      pixels[rowOffset + x] = value & 255;
    }
    sourceOffset += rowBytes;
  }

  return { width, height, pixels };
}

function createImage(width, height, color) {
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
  }
  return { width, height, pixels };
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const index = (y * image.width + x) * 3;
  image.pixels[index] = color[0];
  image.pixels[index + 1] = color[1];
  image.pixels[index + 2] = color[2];
}

function fillRect(image, x, y, width, height, color) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(image.width, Math.ceil(x + width));
  const bottom = Math.min(image.height, Math.ceil(y + height));
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) setPixel(image, column, row, color);
  }
}

function drawText(image, text, x, y, scale, color) {
  let cursor = x;
  for (const character of text) {
    const glyph = FONT[character] || FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') {
          fillRect(image, cursor + column * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += 4 * scale;
  }
}

function blendPixel(image, x, y, red, green, blue, alpha) {
  if (alpha === 0 || x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const index = (y * image.width + x) * 3;
  if (alpha === 255) {
    image.pixels[index] = red;
    image.pixels[index + 1] = green;
    image.pixels[index + 2] = blue;
    return;
  }
  const weight = alpha / 255;
  image.pixels[index] = Math.round(red * weight + image.pixels[index] * (1 - weight));
  image.pixels[index + 1] = Math.round(green * weight + image.pixels[index + 1] * (1 - weight));
  image.pixels[index + 2] = Math.round(blue * weight + image.pixels[index + 2] * (1 - weight));
}

function drawSprite(image, sprite, frame, x, y, size, flipped) {
  const frameWidth = sprite.width / 4;
  const frameHeight = sprite.height / 2;
  if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) {
    throw new Error('Sprout must contain a 4 by 2 frame grid.');
  }

  for (let outputY = 0; outputY < size; outputY += 1) {
    const sourceY = frame.row * frameHeight + Math.min(frameHeight - 1, Math.floor(outputY * frameHeight / size));
    for (let outputX = 0; outputX < size; outputX += 1) {
      const unflippedX = Math.min(frameWidth - 1, Math.floor(outputX * frameWidth / size));
      const sourceXInFrame = flipped ? frameWidth - 1 - unflippedX : unflippedX;
      const sourceX = frame.column * frameWidth + sourceXInFrame;
      const sourceIndex = (sourceY * sprite.width + sourceX) * 4;
      blendPixel(
        image,
        x + outputX,
        y + outputY,
        sprite.pixels[sourceIndex],
        sprite.pixels[sourceIndex + 1],
        sprite.pixels[sourceIndex + 2],
        sprite.pixels[sourceIndex + 3]
      );
    }
  }
}

function renderDesktop() {
  const image = createImage(WIDTH, HEIGHT, COLORS.forest);
  fillRect(image, 4, 4, WIDTH - 8, HEIGHT - 8, COLORS.bark);
  fillRect(image, 7, 7, WIDTH - 14, 31, COLORS.forest);
  fillRect(image, 7, 38, WIDTH - 14, HEIGHT - 45, COLORS.sage);

  fillRect(image, 16, 18, 8, 8, COLORS.cedar);
  fillRect(image, 31, 18, 8, 8, COLORS.gold);
  fillRect(image, 46, 18, 8, 8, COLORS.moss);
  drawText(image, 'DESKPRITE / SPROUT', 70, 16, 2, COLORS.paper);

  for (let x = 7; x < WIDTH - 7; x += 32) fillRect(image, x, 38, 1, HEIGHT - 45, COLORS.moss);
  for (let y = 38; y < HEIGHT - 7; y += 32) fillRect(image, 7, y, WIDTH - 14, 1, COLORS.moss);

  const floorTop = 274;
  fillRect(image, 7, floorTop, WIDTH - 14, HEIGHT - floorTop - 7, COLORS.pine);
  for (let x = 7; x < WIDTH - 7; x += 32) fillRect(image, x, floorTop, 1, HEIGHT - floorTop - 7, COLORS.ink);
  for (let y = floorTop; y < HEIGHT - 7; y += 32) fillRect(image, 7, y, WIDTH - 14, 1, COLORS.ink);
  fillRect(image, 7, floorTop, WIDTH - 14, 4, COLORS.forest);

  return image;
}

function renderFrame(base, sprite, state) {
  const image = { width: base.width, height: base.height, pixels: Uint8Array.from(base.pixels) };
  const spriteY = 268 - SPRITE_SIZE - (state.walkFrame % 2 === 1 ? 2 : 0);
  fillRect(image, state.x + 25, 263, SPRITE_SIZE - 50, 8, COLORS.ink);
  fillRect(image, state.x + 19, 266, SPRITE_SIZE - 38, 4, COLORS.ink);
  drawSprite(
    image,
    sprite,
    { row: state.walking ? 1 : 0, column: state.walkFrame },
    state.x,
    spriteY,
    SPRITE_SIZE,
    state.flipped
  );
  return image;
}

function makeStates() {
  const states = [];
  const left = 28;
  const right = WIDTH - SPRITE_SIZE - 28;
  const walkingSteps = 18;

  for (let step = 0; step < walkingSteps; step += 1) {
    states.push({
      x: Math.round(left + (right - left) * step / (walkingSteps - 1)),
      walkFrame: step % 4,
      walking: true,
      flipped: false,
    });
  }
  for (let pause = 0; pause < 2; pause += 1) {
    states.push({ x: right, walkFrame: pause, walking: false, flipped: false });
  }
  for (let step = 0; step < walkingSteps; step += 1) {
    states.push({
      x: Math.round(right - (right - left) * step / (walkingSteps - 1)),
      walkFrame: step % 4,
      walking: true,
      flipped: true,
    });
  }
  for (let pause = 0; pause < 2; pause += 1) {
    states.push({ x: left, walkFrame: pause, walking: false, flipped: true });
  }
  return states;
}

function differencePatch(previous, current) {
  let left = current.width;
  let top = current.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < current.height; y += 1) {
    for (let x = 0; x < current.width; x += 1) {
      const index = (y * current.width + x) * 3;
      if (
        previous.pixels[index] !== current.pixels[index]
        || previous.pixels[index + 1] !== current.pixels[index + 1]
        || previous.pixels[index + 2] !== current.pixels[index + 2]
      ) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) {
    return { left: 0, top: 0, width: 1, height: 1, pixels: current.pixels.slice(0, 3) };
  }

  left = Math.max(0, left - 1);
  top = Math.max(0, top - 1);
  right = Math.min(current.width - 1, right + 1);
  bottom = Math.min(current.height - 1, bottom + 1);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const pixels = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((top + y) * current.width + left) * 3;
    const destinationStart = y * width * 3;
    pixels.set(current.pixels.subarray(sourceStart, sourceStart + width * 3), destinationStart);
  }
  return { left, top, width, height, pixels };
}

function makePatches(frames) {
  const patches = [{
    left: 0,
    top: 0,
    width: frames[0].width,
    height: frames[0].height,
    pixels: frames[0].pixels,
  }];
  for (let index = 1; index < frames.length; index += 1) {
    patches.push(differencePatch(frames[index - 1], frames[index]));
  }
  return patches;
}

function buildPalette(patches) {
  const buckets = new Map();
  for (const patch of patches) {
    for (let index = 0; index < patch.pixels.length; index += 3) {
      const red = patch.pixels[index];
      const green = patch.pixels[index + 1];
      const blue = patch.pixels[index + 2];
      const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
      const bucket = buckets.get(key) || { key, count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      buckets.set(key, bucket);
    }
  }

  const palette = [];
  const paletteKeys = new Set();
  for (const color of Object.values(COLORS)) {
    const key = ((color[0] >> 3) << 10) | ((color[1] >> 3) << 5) | (color[2] >> 3);
    if (!paletteKeys.has(key)) {
      palette.push(color);
      paletteKeys.add(key);
    }
  }

  const ordered = [...buckets.values()].sort((first, second) => second.count - first.count || first.key - second.key);
  for (const bucket of ordered) {
    if (palette.length >= 256) break;
    if (paletteKeys.has(bucket.key)) continue;
    palette.push([
      Math.round(bucket.red / bucket.count),
      Math.round(bucket.green / bucket.count),
      Math.round(bucket.blue / bucket.count),
    ]);
    paletteKeys.add(bucket.key);
  }
  while (palette.length < 256) palette.push([0, 0, 0]);
  return palette;
}

function indexPixels(pixels, palette, cache) {
  const output = new Uint8Array(pixels.length / 3);
  for (let source = 0, destination = 0; source < pixels.length; source += 3, destination += 1) {
    const red = pixels[source];
    const green = pixels[source + 1];
    const blue = pixels[source + 2];
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    let paletteIndex = cache.get(key);
    if (paletteIndex === undefined) {
      let bestDistance = Infinity;
      paletteIndex = 0;
      for (let index = 0; index < palette.length; index += 1) {
        const redDifference = red - palette[index][0];
        const greenDifference = green - palette[index][1];
        const blueDifference = blue - palette[index][2];
        const distance = redDifference * redDifference * 2
          + greenDifference * greenDifference * 4
          + blueDifference * blueDifference;
        if (distance < bestDistance) {
          bestDistance = distance;
          paletteIndex = index;
        }
      }
      cache.set(key, paletteIndex);
    }
    output[destination] = paletteIndex;
  }
  return output;
}

function writeCode(bytes, state, code) {
  state.bits |= code << state.bitCount;
  state.bitCount += 9;
  while (state.bitCount >= 8) {
    bytes.push(state.bits & 255);
    state.bits >>>= 8;
    state.bitCount -= 8;
  }
}

function lzwEncode(indexes) {
  const clearCode = 256;
  const endCode = 257;
  const bytes = [];
  const state = { bits: 0, bitCount: 0 };
  let dictionary = new Map();
  let nextCode = 258;

  writeCode(bytes, state, clearCode);
  let prefix = indexes[0];
  for (let index = 1; index < indexes.length; index += 1) {
    const value = indexes[index];
    const key = prefix * 256 + value;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }

    writeCode(bytes, state, prefix);
    if (nextCode < 510) {
      dictionary.set(key, nextCode);
      nextCode += 1;
    } else {
      writeCode(bytes, state, clearCode);
      dictionary = new Map();
      nextCode = 258;
    }
    prefix = value;
  }
  writeCode(bytes, state, prefix);
  writeCode(bytes, state, endCode);
  if (state.bitCount > 0) bytes.push(state.bits & 255);
  return Buffer.from(bytes);
}

function subBlocks(buffer) {
  const blocks = [];
  for (let offset = 0; offset < buffer.length; offset += 255) {
    const length = Math.min(255, buffer.length - offset);
    blocks.push(Buffer.from([length]), buffer.subarray(offset, offset + length));
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

function littleEndian(value) {
  return Buffer.from([value & 255, (value >> 8) & 255]);
}

const crcTable = new Uint32Array(256);
for (let value = 0; value < 256; value += 1) {
  let checksum = value;
  for (let bit = 0; bit < 8; bit += 1) {
    checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  }
  crcTable[value] = checksum >>> 0;
}

function crc32(buffer) {
  let checksum = 0xffffffff;
  for (const byte of buffer) checksum = crcTable[(checksum ^ byte) & 255] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function encodeRgbPng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 2;
  const rowBytes = image.width * 3;
  const scanlines = Buffer.alloc((rowBytes + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const destinationOffset = y * (rowBytes + 1);
    scanlines[destinationOffset] = 0;
    scanlines.set(image.pixels.subarray(y * rowBytes, (y + 1) * rowBytes), destinationOffset + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeGif(patches, palette) {
  const parts = [
    Buffer.from('GIF89a', 'ascii'),
    littleEndian(WIDTH),
    littleEndian(HEIGHT),
    Buffer.from([0xf7, 0, 0]),
    Buffer.from(palette.flat()),
    Buffer.from([
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
      0x03, 0x01, REPEAT_COUNT & 255, (REPEAT_COUNT >> 8) & 255, 0x00,
    ]),
  ];

  const colorCache = new Map();
  for (const patch of patches) {
    const indexes = indexPixels(patch.pixels, palette, colorCache);
    const compressed = lzwEncode(indexes);
    parts.push(
      Buffer.from([0x21, 0xf9, 0x04, 0x04]),
      littleEndian(FRAME_DELAY),
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x2c]),
      littleEndian(patch.left),
      littleEndian(patch.top),
      littleEndian(patch.width),
      littleEndian(patch.height),
      Buffer.from([0x00, 0x08]),
      subBlocks(compressed)
    );
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

const sprite = decodeRgbaPng(fs.readFileSync(spritePath));
if (sprite.width % 4 !== 0 || sprite.height % 2 !== 0) {
  throw new Error('Sprout must contain four columns and two rows of equal-sized frames.');
}

const base = renderDesktop();
const states = makeStates();
const frames = states.map((state) => renderFrame(base, sprite, state));
const patches = makePatches(frames);
const palette = buildPalette(patches);
const gif = encodeGif(patches, palette);
const still = encodeRgbPng(frames[0]);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, gif);
fs.writeFileSync(stillOutputPath, still);
console.log('Wrote ' + outputPath + ' (' + Math.round(gif.length / 1024) + ' KB, ' + frames.length + ' frames)');
console.log('Wrote ' + stillOutputPath + ' (' + Math.round(still.length / 1024) + ' KB)');
