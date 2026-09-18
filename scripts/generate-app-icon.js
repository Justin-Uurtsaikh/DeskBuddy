'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const projectRoot = path.resolve(__dirname, '..');
const spritePath = path.join(projectRoot, 'src', 'assets', 'presets', 'sprout-sheet.png');
const outputPath = path.join(projectRoot, 'build', 'icon.png');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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
      else throw new Error(`Unsupported PNG row filter: ${filter}`);
      pixels[rowOffset + x] = value & 255;
    }
    sourceOffset += rowBytes;
  }

  return { width, height, pixels };
}

function roundedRectContains(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const innerLeft = left + radius;
  const innerRight = left + width - radius;
  const innerTop = top + radius;
  const innerBottom = top + height - radius;
  if (x >= innerLeft && x < innerRight) return true;
  if (y >= innerTop && y < innerBottom) return true;
  const centerX = x < innerLeft ? innerLeft : innerRight - 1;
  const centerY = y < innerTop ? innerTop : innerBottom - 1;
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function fillRoundedRect(pixels, canvasSize, bounds, color) {
  const [left, top, width, height, radius] = bounds;
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (!roundedRectContains(x, y, left, top, width, height, radius)) continue;
      const index = (y * canvasSize + x) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = 255;
    }
  }
}

function blendPixel(destination, destinationIndex, red, green, blue, alpha) {
  if (alpha === 0) return;
  const sourceAlpha = alpha / 255;
  const destinationAlpha = destination[destinationIndex + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha === 0) return;
  destination[destinationIndex] = Math.round((red * sourceAlpha + destination[destinationIndex] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  destination[destinationIndex + 1] = Math.round((green * sourceAlpha + destination[destinationIndex + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  destination[destinationIndex + 2] = Math.round((blue * sourceAlpha + destination[destinationIndex + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  destination[destinationIndex + 3] = Math.round(outputAlpha * 255);
}

function renderIcon(sprite) {
  const size = 1024;
  const output = Buffer.alloc(size * size * 4);
  fillRoundedRect(output, size, [36, 36, 952, 952, 190], [30, 32, 21]);
  fillRoundedRect(output, size, [62, 62, 900, 900, 166], [232, 222, 160]);

  const frameWidth = Math.floor(sprite.width / 4);
  const frameHeight = Math.floor(sprite.height / 2);
  const destination = { x: 92, y: 80, width: 840, height: 840 };
  for (let y = 0; y < destination.height; y += 1) {
    const sourceY = Math.min(frameHeight - 1, Math.floor(y * frameHeight / destination.height));
    for (let x = 0; x < destination.width; x += 1) {
      const sourceX = Math.min(frameWidth - 1, Math.floor(x * frameWidth / destination.width));
      const sourceIndex = (sourceY * sprite.width + sourceX) * 4;
      const destinationIndex = ((destination.y + y) * size + destination.x + x) * 4;
      blendPixel(
        output,
        destinationIndex,
        sprite.pixels[sourceIndex],
        sprite.pixels[sourceIndex + 1],
        sprite.pixels[sourceIndex + 2],
        sprite.pixels[sourceIndex + 3]
      );
    }
  }
  return { width: size, height: size, pixels: output };
}

const crcTable = new Uint32Array(256);
for (let value = 0; value < 256; value += 1) {
  let checksum = value;
  for (let bit = 0; bit < 8; bit += 1) checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
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

function encodeRgbaPng(image) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  const rowBytes = image.width * 4;
  const scanlines = Buffer.alloc((rowBytes + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const destinationOffset = y * (rowBytes + 1);
    scanlines[destinationOffset] = 0;
    image.pixels.copy(scanlines, destinationOffset + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const sprite = decodeRgbaPng(fs.readFileSync(spritePath));
const icon = renderIcon(sprite);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, encodeRgbaPng(icon));
console.log(`Wrote ${outputPath}`);
