'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_FRAMES_PER_CLIP,
  MAX_ANIMATION_BYTES,
  ERROR_MESSAGES,
  validateUploadMetadata,
  decodePngDataUrl,
  imageDetails,
  validatePngHeader,
  pixelInfoFromBitmap,
  validatePixelInfo,
  validateAnimationFrameCounts,
  validateAnimationByteSize,
  animationFramesForState,
  animationFrameAt,
  frameRect,
  normalizePetSize,
  petWindowMetrics,
  wrappedAxisPosition,
  wrappedPosition,
  friendlyErrorMessage,
} = require('../src/core');

function pngHeader({ width = 32, height = 32, colorType = 6, transparentChunk = false } = {}) {
  const header = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header[24] = 8;
  header[25] = colorType;
  if (!transparentChunk) return header;

  const chunk = Buffer.alloc(13);
  chunk.writeUInt32BE(1, 0);
  chunk.write('tRNS', 4, 'ascii');
  chunk[8] = 0;
  return Buffer.concat([header, chunk]);
}

function messageOf(callback) {
  let caught = null;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error, 'Expected the callback to throw an Error.');
  return caught.message;
}

test('upload validation explains wrong types and oversized files', () => {
  assert.equal(validateUploadMetadata({ type: 'image/png', size: MAX_IMAGE_BYTES }).size, MAX_IMAGE_BYTES);
  assert.equal(
    messageOf(() => validateUploadMetadata({ type: 'image/jpeg', size: 100 })),
    ERROR_MESSAGES.wrongFileType,
  );
  assert.equal(
    messageOf(() => validateUploadMetadata({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })),
    'This image is too large.',
  );
  assert.equal(
    messageOf(() => validateUploadMetadata({ type: 'image/png', size: -1 })),
    ERROR_MESSAGES.unreadablePng,
  );
  assert.equal(
    messageOf(() => validateUploadMetadata({ type: 'image/png', size: null })),
    ERROR_MESSAGES.unreadablePng,
  );
});

test('PNG data URL validation rejects missing and non-PNG images clearly', () => {
  assert.equal(messageOf(() => decodePngDataUrl(null)), ERROR_MESSAGES.choosePng);
  assert.equal(
    messageOf(() => decodePngDataUrl('data:image/jpeg;base64,AAAA')),
    ERROR_MESSAGES.wrongFileType,
  );
  const source = pngHeader();
  assert.deepEqual(decodePngDataUrl(`data:image/png;base64,${source.toString('base64')}`), source);
});

test('sprite validation accepts alpha PNGs and rejects opaque or malformed PNGs', () => {
  assert.equal(validatePngHeader(pngHeader({ colorType: 6 })).hasTransparencyChannel, true);
  assert.equal(validatePngHeader(pngHeader({ colorType: 4 })).hasTransparencyChannel, true);
  assert.equal(validatePngHeader(pngHeader({ colorType: 2, transparentChunk: true })).hasTransparencyChannel, true);
  assert.equal(
    messageOf(() => validatePngHeader(pngHeader({ colorType: 2 }))),
    'This PNG has no transparent background.',
  );
  assert.equal(messageOf(() => validatePngHeader(Buffer.from('not a png'))), ERROR_MESSAGES.unreadablePng);
});

test('sprite dimensions accept the exact limit and reject anything larger', () => {
  const exact = pngHeader({ width: 4_000, height: MAX_IMAGE_PIXELS / 4_000 });
  assert.equal(validatePngHeader(exact).width * validatePngHeader(exact).height, MAX_IMAGE_PIXELS);
  assert.equal(
    messageOf(() => validatePngHeader(pngHeader({ width: 4_001, height: 4_000 }))),
    'This image is too large.',
  );
});

test('decoded pixel validation distinguishes transparent, opaque, and blank artwork', () => {
  assert.deepEqual(
    pixelInfoFromBitmap(Buffer.from([0, 0, 0, 255, 0, 0, 0, 249])),
    { hasTransparency: true, hasVisiblePixels: true },
  );
  assert.equal(
    messageOf(() => validatePixelInfo(Buffer.from([0, 0, 0, 255]))),
    'This PNG has no transparent background.',
  );
  assert.equal(
    messageOf(() => validatePixelInfo(Buffer.from([0, 0, 0, 0]))),
    ERROR_MESSAGES.blankFrame,
  );
});

test('animation validation requires idle and walk frames and enforces both limits', () => {
  assert.equal(
    messageOf(() => validateAnimationFrameCounts({ idle: ['idle'], walk: [] })),
    'Choose at least one idle and one walking frame.',
  );
  assert.equal(
    messageOf(() => validateAnimationFrameCounts({ idle: ['idle'], walk: Array(MAX_FRAMES_PER_CLIP + 1).fill('walk') })),
    ERROR_MESSAGES.tooManyAnimationFrames,
  );
  const valid = { idle: ['idle'], walk: ['walk'] };
  assert.equal(validateAnimationFrameCounts(valid), valid);
  assert.equal(validateAnimationByteSize(MAX_ANIMATION_BYTES), MAX_ANIMATION_BYTES);
  assert.equal(
    messageOf(() => validateAnimationByteSize(MAX_ANIMATION_BYTES + 1)),
    ERROR_MESSAGES.animationTooLarge,
  );
});

test('animation-frame selection uses walk frames, falls back to idle, and wraps indices', () => {
  const clips = { idle: ['i0', 'i1'], walk: ['w0', 'w1', 'w2'] };
  assert.deepEqual(animationFramesForState(clips, 'walk'), clips.walk);
  assert.deepEqual(animationFramesForState({ idle: clips.idle, walk: [] }, 'walk'), clips.idle);
  assert.deepEqual(animationFramesForState(clips, 'unknown'), clips.idle);
  assert.deepEqual(animationFrameAt(clips, 'walk', 3), { frames: clips.walk, index: 0, frame: 'w0' });
  assert.deepEqual(animationFrameAt(clips, 'walk', -1), { frames: clips.walk, index: 2, frame: 'w2' });
  assert.deepEqual(animationFrameAt({ idle: [], walk: [] }, 'idle', 4), { frames: [], index: 0, frame: null });
});

test('Sprout frame selection maps the real 4 by 2 sheet to eight square frames', () => {
  const sproutPath = path.join(__dirname, '..', 'src', 'assets', 'presets', 'sprout-sheet.png');
  const sproutPng = fs.readFileSync(sproutPath);
  const details = imageDetails(sproutPng);
  assert.equal(validatePngHeader(sproutPng).hasTransparencyChannel, true);
  assert.deepEqual({ width: details.width, height: details.height }, { width: 1772, height: 886 });
  const layout = {
    columns: 4,
    rows: 2,
    idle: { row: 0, start: 0, frames: 4 },
    walk: { row: 1, start: 0, frames: 4 },
  };
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual(frameRect(details.width, details.height, layout, 'idle', index), {
      x: index * 443, y: 0, width: 443, height: 443,
    });
    assert.deepEqual(frameRect(details.width, details.height, layout, 'walk', index), {
      x: index * 443, y: 443, width: 443, height: 443,
    });
  }
  const rectangularLayout = {
    columns: 2,
    rows: 2,
    idle: { row: 0, start: 0, frames: 2 },
    walk: { row: 1, start: 0, frames: 2 },
  };
  assert.equal(
    messageOf(() => frameRect(details.width, details.height, rectangularLayout, 'idle', 0)),
    'Choose a grid that gives every frame the same square canvas.',
  );
});

test('buddy sizes default, round, and clamp to the supported range', () => {
  assert.equal(normalizePetSize(undefined), 112);
  assert.equal(normalizePetSize(Number.NaN), 112);
  assert.equal(normalizePetSize(Number.POSITIVE_INFINITY), 112);
  assert.equal(normalizePetSize(63), 64);
  assert.equal(normalizePetSize('112'), 112);
  assert.equal(normalizePetSize(112.6), 113);
  assert.equal(normalizePetSize(193), 192);
  assert.deepEqual(petWindowMetrics(112), { spriteSize: 112, windowSize: 154, inset: 21 });
});

test('screen-edge wrapping moves a buddy from either edge to the opposite edge', () => {
  const spriteSize = 112;
  const inset = 21;
  assert.equal(wrappedAxisPosition(978, 0, 1_000, spriteSize, inset), 978);
  assert.equal(wrappedAxisPosition(979, 0, 1_000, spriteSize, inset), -133);
  assert.equal(wrappedAxisPosition(-133, 0, 1_000, spriteSize, inset), -133);
  assert.equal(wrappedAxisPosition(-134, 0, 1_000, spriteSize, inset), 978);
  assert.equal(wrappedAxisPosition(-21, -1_440, 1_440, spriteSize, inset), -1_573);
  assert.equal(wrappedAxisPosition(-1_574, -1_440, 1_440, spriteSize, inset), -22);
  assert.deepEqual(
    wrappedPosition(979, 779, { x: 0, y: 0, width: 1_000, height: 800 }, spriteSize, inset),
    { x: -133, y: -133 },
  );
});

test('friendly errors remove Electron wrappers and hide technical failures', () => {
  assert.equal(
    friendlyErrorMessage(new Error("Error invoking remote method 'pets:create': Error: This image is too large.")),
    'This image is too large.',
  );
  assert.equal(
    friendlyErrorMessage(new Error('ENOENT: no such file or directory, open /Users/name/private.json')),
    ERROR_MESSAGES.generic,
  );
  assert.equal(
    friendlyErrorMessage(new TypeError("Cannot read properties of undefined (reading 'map')")),
    ERROR_MESSAGES.generic,
  );
  assert.equal(
    friendlyErrorMessage(new Error("Failed to execute 'getImageData': Out of memory")),
    ERROR_MESSAGES.generic,
  );
  assert.equal(
    friendlyErrorMessage(new Error('ENOSPC: no space left on device')),
    ERROR_MESSAGES.generic,
  );
  assert.equal(
    friendlyErrorMessage(new Error('Choose a starter buddy first.')),
    'Choose a starter buddy first.',
  );
});

test('the size control stays aligned with the shared limits', () => {
  const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'creator.html'), 'utf8');
  assert.match(creatorHtml, /id="size-input"[^>]*min="64"[^>]*max="192"[^>]*value="112"/);
});

test('the shared browser core loads before both renderer scripts', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
  const browserContext = {};
  vm.createContext(browserContext);
  vm.runInContext(source, browserContext);
  assert.equal(browserContext.DeskBuddyCore.normalizePetSize(20), 64);

  const creatorHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'creator.html'), 'utf8');
  const petHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'pet.html'), 'utf8');
  assert.ok(creatorHtml.indexOf('src="core.js"') < creatorHtml.indexOf('src="creator.js"'));
  assert.ok(petHtml.indexOf('src="core.js"') < petHtml.indexOf('src="pet.js"'));
});
