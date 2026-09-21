(function attachDeskpriteCore(root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.DeskpriteCore = core;
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  'use strict';

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 16_000_000;
  const MAX_FRAMES_PER_CLIP = 8;
  const MAX_ANIMATION_BYTES = 12 * 1024 * 1024;
  const MIN_PET_SIZE = 64;
  const DEFAULT_PET_SIZE = 112;
  const MAX_PET_SIZE = 192;
  const PET_WINDOW_PADDING = 42;

  const ERROR_MESSAGES = Object.freeze({
    choosePng: 'Choose a PNG image first.',
    wrongFileType: 'Choose a PNG file. Deskprite does not support JPG or WebP files.',
    imageTooLarge: 'This image is too large.',
    unreadablePng: "Deskprite couldn't read this PNG. Try exporting it again.",
    noTransparentBackground: 'This PNG has no transparent background.',
    blankFrame: 'This sprite frame is blank. Draw or import a visible character.',
    missingAnimationFrames: 'Choose at least one idle and one walking frame.',
    tooManyAnimationFrames: `Use no more than ${MAX_FRAMES_PER_CLIP} frames for each animation.`,
    animationTooLarge: 'This animation is too large. Use smaller frames or fewer frames.',
    generic: 'Something went wrong. Please try again.',
  });
  const FRIENDLY_ERROR_PATTERNS = Object.freeze([
    /^That grid does not fit this sprite sheet\.$/,
    /^Choose valid rows and frames for this sprite sheet\.$/,
    /^Choose a grid that gives every frame the same square canvas\.$/,
    /^That sprite sheet could not be read\. Try another one\.$/,
    /^Deskprite could not (?:inspect that PNG|split that sprite sheet)\.$/,
    /^(?:Columns|Rows|Idle frames|Idle start column|Idle row|Walk frames|Walk start column|Walk row) must be between \d+ and \d+\.$/,
    /^Choose a square cell grid above before making your buddy\.$/,
    /^Each frame must be at least 16 × 16 pixels and no larger than 4 megapixels\.$/,
    /^The (?:idle|walk) row contains an empty frame\. Check the row and frame settings\.$/,
    /^That starter buddy is not available\.$/,
    /^[A-Za-z][A-Za-z0-9 -]{0,35}'s sprite frames are missing transparency\.$/,
    /^Choose a starter buddy first\.$/,
    /^Choose a transparent PNG sprite sheet first\.$/,
    /^Deskprite could not read the saved-buddies file\. A backup was kept instead of overwriting it\.$/,
    /^That buddy could not be found\.$/,
    /^This action is only available from the Deskprite collection window\.$/,
    /^This action is not available\.$/,
    /^Deskprite could not (?:remove that saved sprite|save those sprite frames)\. Please try again\.$/,
    /^Deskprite can keep up to 30 buddies\. Delete one before adding another\.$/,
  ]);

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function normalizePetSize(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.round(clamp(number, MIN_PET_SIZE, MAX_PET_SIZE))
      : DEFAULT_PET_SIZE;
  }

  function petWindowMetrics(value) {
    const spriteSize = normalizePetSize(value);
    const windowSize = spriteSize + PET_WINDOW_PADDING;
    return { spriteSize, windowSize, inset: (windowSize - spriteSize) / 2 };
  }

  function validateUploadMetadata(file) {
    if (!file) throw new Error(ERROR_MESSAGES.choosePng);
    if (file.type !== 'image/png') throw new Error(ERROR_MESSAGES.wrongFileType);
    if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0) {
      throw new Error(ERROR_MESSAGES.unreadablePng);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(ERROR_MESSAGES.imageTooLarge);
    }
    return file;
  }

  function decodePngDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl) throw new Error(ERROR_MESSAGES.choosePng);
    const maximumEncodedLength = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 96;
    if (dataUrl.length > maximumEncodedLength) throw new Error(ERROR_MESSAGES.imageTooLarge);

    const match = /^data:(image\/png);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
    if (!match) throw new Error(ERROR_MESSAGES.wrongFileType);
    const encodedImage = match[2].replace(/[\r\n]/g, '');
    if (encodedImage.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8) {
      throw new Error(ERROR_MESSAGES.imageTooLarge);
    }

    const buffer = Buffer.from(encodedImage, 'base64');
    if (!buffer.length) throw new Error(ERROR_MESSAGES.unreadablePng);
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error(ERROR_MESSAGES.imageTooLarge);
    return buffer;
  }

  function pngHasTransparencyChannel(buffer) {
    const colorType = buffer[25];
    if (colorType === 4 || colorType === 6) return true;

    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
      if (offset + 12 + length > buffer.length) break;
      if (type === 'tRNS' && length > 0) return true;
      if (type === 'IEND') break;
      offset += 12 + length;
    }
    return false;
  }

  function imageDetails(buffer) {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (
      !buffer
      || buffer.length < 26
      || !buffer.subarray(0, 8).equals(pngSignature)
      || buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
    ) {
      throw new Error(ERROR_MESSAGES.unreadablePng);
    }
    return {
      mimeType: 'image/png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      hasTransparencyChannel: pngHasTransparencyChannel(buffer),
    };
  }

  function validatePngHeader(buffer) {
    const details = imageDetails(buffer);
    if (!details.hasTransparencyChannel) {
      throw new Error(ERROR_MESSAGES.noTransparentBackground);
    }
    if (!details.width || !details.height || details.width * details.height > MAX_IMAGE_PIXELS) {
      throw new Error(ERROR_MESSAGES.imageTooLarge);
    }
    return details;
  }

  function pixelInfoFromBitmap(bitmap) {
    let hasTransparency = false;
    let hasVisiblePixels = false;
    for (let index = 3; index < bitmap.length; index += 4) {
      if (bitmap[index] < 250) hasTransparency = true;
      if (bitmap[index] > 4) hasVisiblePixels = true;
      if (hasTransparency && hasVisiblePixels) break;
    }
    return { hasTransparency, hasVisiblePixels };
  }

  function validatePixelInfo(bitmap) {
    const result = pixelInfoFromBitmap(bitmap);
    if (!result.hasTransparency) throw new Error(ERROR_MESSAGES.noTransparentBackground);
    if (!result.hasVisiblePixels) throw new Error(ERROR_MESSAGES.blankFrame);
    return result;
  }

  function validateAnimationFrameCounts(animations) {
    const idle = animations?.idle;
    const walk = animations?.walk;
    if (!Array.isArray(idle) || !idle.length || !Array.isArray(walk) || !walk.length) {
      throw new Error(ERROR_MESSAGES.missingAnimationFrames);
    }
    if (idle.length > MAX_FRAMES_PER_CLIP || walk.length > MAX_FRAMES_PER_CLIP) {
      throw new Error(ERROR_MESSAGES.tooManyAnimationFrames);
    }
    return animations;
  }

  function validateAnimationByteSize(totalBytes) {
    if (!Number.isFinite(totalBytes) || totalBytes < 0 || totalBytes > MAX_ANIMATION_BYTES) {
      throw new Error(ERROR_MESSAGES.animationTooLarge);
    }
    return totalBytes;
  }

  function animationFramesForState(clips, state) {
    const idle = Array.isArray(clips?.idle) ? clips.idle : [];
    const requested = state === 'walk' && Array.isArray(clips?.walk) ? clips.walk : idle;
    return requested.length ? requested : idle;
  }

  function animationFrameAt(clips, state, index = 0) {
    const frames = animationFramesForState(clips, state);
    if (!frames.length) return { frames, index: 0, frame: null };
    const requestedIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
    const normalizedIndex = ((requestedIndex % frames.length) + frames.length) % frames.length;
    return { frames, index: normalizedIndex, frame: frames[normalizedIndex] };
  }

  function frameRect(sourceWidth, sourceHeight, layout, clip, index) {
    if (
      !Number.isInteger(sourceWidth)
      || !Number.isInteger(sourceHeight)
      || sourceWidth <= 0
      || sourceHeight <= 0
      || !layout
      || !Number.isInteger(layout.columns)
      || !Number.isInteger(layout.rows)
      || layout.columns < 1
      || layout.rows < 1
      || sourceWidth % layout.columns !== 0
      || sourceHeight % layout.rows !== 0
    ) {
      throw new Error('That grid does not fit this sprite sheet.');
    }
    const clipLayout = layout[clip];
    if (
      !clipLayout
      || !Number.isInteger(clipLayout.row)
      || !Number.isInteger(clipLayout.start)
      || !Number.isInteger(clipLayout.frames)
      || clipLayout.frames < 1
      || !Number.isInteger(index)
      || index < 0
      || index >= clipLayout.frames
      || clipLayout.row < 0
      || clipLayout.row >= layout.rows
      || clipLayout.start < 0
      || clipLayout.start + clipLayout.frames > layout.columns
    ) {
      throw new Error('Choose valid rows and frames for this sprite sheet.');
    }
    const width = sourceWidth / layout.columns;
    const height = sourceHeight / layout.rows;
    if (width !== height) {
      throw new Error('Choose a grid that gives every frame the same square canvas.');
    }
    return {
      x: (clipLayout.start + index) * width,
      y: clipLayout.row * height,
      width,
      height,
    };
  }

  function wrappedAxisPosition(value, minimum, length, spriteSize, inset) {
    const lowerBoundary = minimum - inset - spriteSize;
    const span = length + spriteSize;
    const offset = ((value - lowerBoundary) % span + span) % span;
    return Math.round(lowerBoundary + offset);
  }

  function wrappedPosition(x, y, area, spriteSize, inset) {
    return {
      x: wrappedAxisPosition(x, area.x, area.width, spriteSize, inset),
      y: wrappedAxisPosition(y, area.y, area.height, spriteSize, inset),
    };
  }

  function friendlyErrorMessage(error, fallback = ERROR_MESSAGES.generic) {
    const raw = typeof error === 'string' ? error : error?.message;
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    const message = raw.trim()
      .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, '')
      .replace(/^(?:Uncaught\s+)?Error:\s*/i, '')
      .trim();
    if (!message || message.length > 240 || /[\r\n]/.test(message)) return fallback;

    const isKnownMessage = Object.values(ERROR_MESSAGES).includes(message);
    const matchesFriendlyPattern = FRIENDLY_ERROR_PATTERNS.some((pattern) => pattern.test(message));
    return isKnownMessage || matchesFriendlyPattern ? message : fallback;
  }

  return Object.freeze({
    MAX_IMAGE_BYTES,
    MAX_IMAGE_PIXELS,
    MAX_FRAMES_PER_CLIP,
    MAX_ANIMATION_BYTES,
    MIN_PET_SIZE,
    DEFAULT_PET_SIZE,
    MAX_PET_SIZE,
    PET_WINDOW_PADDING,
    ERROR_MESSAGES,
    clamp,
    normalizePetSize,
    petWindowMetrics,
    validateUploadMetadata,
    decodePngDataUrl,
    pngHasTransparencyChannel,
    imageDetails,
    validatePngHeader,
    pixelInfoFromBitmap,
    validatePixelInfo,
    validateAnimationFrameCounts,
    validateAnimationByteSize,
    animationFramesForState,
    animationFrameAt,
    frameRect,
    wrappedAxisPosition,
    wrappedPosition,
    friendlyErrorMessage,
  });
}));
