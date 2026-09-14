const MAX_FRAMES_PER_CLIP = 8;
const MAX_SHEET_COLUMNS = 32;
const MAX_SHEET_ROWS = 32;
const DRAW_SIZE = 160;
const PRESET_LAYOUT = Object.freeze({
  columns: 4,
  rows: 2,
  idle: { row: 0, start: 0, frames: 4 },
  walk: { row: 1, start: 0, frames: 4 },
});
const PRESETS = Object.freeze({
  sprout: { name: 'Sprout', sheet: 'assets/presets/sprout-sheet.png' },
  mochi: { name: 'Mochi', sheet: 'assets/presets/mochi-sheet.png' },
  miso: { name: 'Miso', sheet: 'assets/presets/miso-sheet.png' },
  taro: { name: 'Taro', sheet: 'assets/presets/taro-sheet.png' },
  honey: { name: 'Honey', sheet: 'assets/presets/honey-sheet.png' },
  button: { name: 'Button', sheet: 'assets/presets/button-sheet.png' },
  nori: { name: 'Nori', sheet: 'assets/presets/nori-sheet.png' },
  maple: { name: 'Maple', sheet: 'assets/presets/maple-sheet.png' },
  pudding: { name: 'Pudding', sheet: 'assets/presets/pudding-sheet.png' },
});

const form = document.querySelector('#pet-form');
const imageInput = document.querySelector('#image-input');
const uploadZone = document.querySelector('#upload-zone');
const presetPanel = document.querySelector('#preset-panel');
const presetStatus = document.querySelector('#preset-status');
const presetChoices = [...document.querySelectorAll('[data-preset-id]')];
const importPanel = document.querySelector('#import-panel');
const drawPanel = document.querySelector('#draw-panel');
const modeButtons = [...document.querySelectorAll('[data-creation-mode]')];
const layoutInputs = {
  columns: document.querySelector('#sheet-columns'),
  rows: document.querySelector('#sheet-rows'),
  idleRow: document.querySelector('#idle-row'),
  idleStart: document.querySelector('#idle-start'),
  idleFrames: document.querySelector('#idle-frames'),
  walkRow: document.querySelector('#walk-row'),
  walkStart: document.querySelector('#walk-start'),
  walkFrames: document.querySelector('#walk-frames'),
};
const sheetStatus = document.querySelector('#sheet-status');
const sheetInfo = document.querySelector('#sheet-info');
const sheetDimensions = document.querySelector('#sheet-dimensions');
const gridChoices = document.querySelector('#grid-choices');
const nameInput = document.querySelector('#name-input');
const sizeInput = document.querySelector('#size-input');
const sizeOutput = document.querySelector('#size-output');
const createButton = document.querySelector('#create-button');
const message = document.querySelector('#form-message');
const previewPet = document.querySelector('#preview-pet');
const previewImage = document.querySelector('#preview-image');
const previewSymbol = document.querySelector('#preview-symbol');
const previewName = document.querySelector('#preview-name');
const petList = document.querySelector('#pet-list');
const emptyState = document.querySelector('#empty-state');
const buddyCount = document.querySelector('#buddy-count');

const canvas = document.querySelector('#sprite-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const brushColor = document.querySelector('#brush-color');
const brushSize = document.querySelector('#brush-size');
const brushSizeOutput = document.querySelector('#brush-size-output');
const onionToggle = document.querySelector('#onion-toggle');
const onionOpacity = document.querySelector('#onion-opacity');
const onionOpacityOutput = document.querySelector('#onion-opacity-output');
const onionSkin = document.querySelector('#onion-skin');
const brushTool = document.querySelector('#brush-tool');
const eraserTool = document.querySelector('#eraser-tool');
const clearFrameButton = document.querySelector('#clear-frame');
const clipButtons = [...document.querySelectorAll('[data-clip]')];
const drawFrameStatus = document.querySelector('#draw-frame-status');
const drawFrameList = document.querySelector('#draw-frame-list');
const previousFrameButton = document.querySelector('#previous-frame');
const nextFrameButton = document.querySelector('#next-frame');
const addFrameButton = document.querySelector('#add-frame');
const deleteFrameButton = document.querySelector('#delete-frame');

let creationMode = 'preset';
let selectedPresetId = null;
let presetAnimations = null;
let presetLoadVersion = 0;
let presetPreviewTimer = null;
const presetAnimationCache = new Map();
let selectedSheetData = null;
let importedAnimations = null;
let selectedSheetMeta = null;
let sheetGridChosen = false;
let activeClip = 'idle';
let activeFrame = 0;
let drawingTool = 'brush';
let isDrawing = false;
let lastPoint = null;
let frameLoadVersion = 0;
let drawingFrames = {
  idle: [blankFrame()],
  walk: [blankFrame()],
};

function blankFrame() {
  const blank = document.createElement('canvas');
  blank.width = DRAW_SIZE;
  blank.height = DRAW_SIZE;
  return blank.toDataURL('image/png');
}

function setCreateButton(isWorking) {
  createButton.disabled = isWorking;
  for (const control of [...modeButtons, ...presetChoices, nameInput, sizeInput]) {
    control.disabled = isWorking;
  }
  createButton.replaceChildren();
  createButton.append(document.createTextNode(isWorking ? 'Saving your frames…' : 'Create & launch '));
  if (!isWorking) {
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    createButton.append(arrow);
  }
}

function setMessage(text = '', isSuccess = false) {
  message.textContent = text;
  message.classList.toggle('success', isSuccess);
}

function setSheetStatus(text = '') {
  sheetStatus.textContent = text || 'Tip: use the same row, starting column, and frame count for idle and walk when your sheet has one animation.';
}

function setPreview(imageData) {
  const hasImage = Boolean(imageData);
  previewImage.hidden = !hasImage;
  previewSymbol.hidden = hasImage;
  previewPet.classList.toggle('preview-placeholder', !hasImage);
  previewImage.src = hasImage ? imageData : '';
}

function updatePreviewName() {
  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  previewName.textContent = name || 'Your new buddy';
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That sprite sheet could not be read. Try another one.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(imageData) {
  return new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => resolve(source);
    source.onerror = () => reject(new Error('DeskBuddy could not inspect that PNG.'));
    source.src = imageData;
  });
}

async function pixelsIn(imageData, predicate) {
  const source = await loadImage(imageData);
  const probe = document.createElement('canvas');
  probe.width = source.naturalWidth;
  probe.height = source.naturalHeight;
  const probeContext = probe.getContext('2d', { willReadFrequently: true });
  if (!probeContext) throw new Error('DeskBuddy could not inspect that PNG.');
  probeContext.drawImage(source, 0, 0);
  const pixels = probeContext.getImageData(0, 0, probe.width, probe.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (predicate(pixels[index])) return true;
  }
  return false;
}

function imageHasTransparentPixels(imageData) {
  return pixelsIn(imageData, (alpha) => alpha < 250);
}

function imageHasVisiblePixels(imageData) {
  return pixelsIn(imageData, (alpha) => alpha > 4);
}

function boundedInteger(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function sheetLayout() {
  const columns = boundedInteger(layoutInputs.columns.value, 1, MAX_SHEET_COLUMNS, 'Columns');
  const rows = boundedInteger(layoutInputs.rows.value, 1, MAX_SHEET_ROWS, 'Rows');
  const clipLayout = (clipName, rowValue, startValue, frameValue) => {
    const frames = boundedInteger(frameValue, 1, Math.min(MAX_FRAMES_PER_CLIP, columns), `${clipName} frames`);
    const start = boundedInteger(startValue, 1, columns - frames + 1, `${clipName} start column`);
    return {
      row: boundedInteger(rowValue, 1, rows, `${clipName} row`) - 1,
      start: start - 1,
      frames,
    };
  };
  return {
    columns,
    rows,
    idle: clipLayout('Idle', layoutInputs.idleRow.value, layoutInputs.idleStart.value, layoutInputs.idleFrames.value),
    walk: clipLayout('Walk', layoutInputs.walkRow.value, layoutInputs.walkStart.value, layoutInputs.walkFrames.value),
  };
}

function squareGridChoices(width, height) {
  const choices = [];
  for (let columns = 1; columns <= MAX_SHEET_COLUMNS; columns += 1) {
    if (width % columns !== 0) continue;
    const cellWidth = width / columns;
    for (let rows = 1; rows <= MAX_SHEET_ROWS; rows += 1) {
      if (height % rows !== 0) continue;
      const cellHeight = height / rows;
      if (cellWidth === cellHeight && cellWidth >= 16) {
        choices.push({ columns, rows, cellSize: cellWidth });
      }
    }
  }
  return choices.sort((a, b) => b.cellSize - a.cellSize).slice(0, 6);
}

function updateGridChoiceState() {
  const columns = Number(layoutInputs.columns.value);
  const rows = Number(layoutInputs.rows.value);
  for (const choice of gridChoices.querySelectorAll('button')) {
    const selected = Number(choice.dataset.columns) === columns && Number(choice.dataset.rows) === rows;
    choice.classList.toggle('active', selected);
    choice.setAttribute('aria-pressed', String(selected));
  }
}

function applyGridChoice(choice) {
  sheetGridChosen = true;
  const frameCount = Math.min(4, choice.columns, MAX_FRAMES_PER_CLIP);
  layoutInputs.columns.value = String(choice.columns);
  layoutInputs.rows.value = String(choice.rows);
  layoutInputs.idleRow.value = '1';
  layoutInputs.idleStart.value = '1';
  layoutInputs.idleFrames.value = String(frameCount);
  layoutInputs.walkRow.value = String(choice.rows > 1 ? 2 : 1);
  layoutInputs.walkStart.value = '1';
  layoutInputs.walkFrames.value = String(frameCount);
  updateGridChoiceState();
}

function renderSheetInfo(width, height) {
  selectedSheetMeta = { width, height };
  const choices = squareGridChoices(width, height);
  sheetGridChosen = false;
  sheetInfo.hidden = false;
  sheetDimensions.textContent = `${width} × ${height}px sheet · pick a square cell size that matches one full character. Dense sheets often group animation frames in threes.`;
  gridChoices.replaceChildren(...choices.map((choice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grid-choice';
    button.dataset.columns = String(choice.columns);
    button.dataset.rows = String(choice.rows);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = `${choice.columns} × ${choice.rows} · ${choice.cellSize}px`;
    button.addEventListener('click', async () => {
      applyGridChoice(choice);
      if (!selectedSheetData) return;
      try {
        await rebuildImportedAnimations();
        setMessage();
      } catch (error) {
        importedAnimations = null;
        setMessage(error.message);
      }
    });
    return button;
  }));
  const singleRowStrip = choices.find((choice) => choice.rows === 1);
  if (singleRowStrip) applyGridChoice(singleRowStrip);
  else updateGridChoiceState();
}

async function splitSpriteSheet(imageData, layoutOverride = null) {
  if (!layoutOverride && !sheetGridChosen) {
    throw new Error('Choose a square cell grid above before making your buddy.');
  }
  const layout = layoutOverride || sheetLayout();
  const source = await loadImage(imageData);
  if (source.naturalWidth % layout.columns !== 0 || source.naturalHeight % layout.rows !== 0) {
    throw new Error('Use equal sprite cells: the PNG width must divide evenly by columns and its height by rows.');
  }
  const frameWidth = source.naturalWidth / layout.columns;
  const frameHeight = source.naturalHeight / layout.rows;
  if (frameWidth < 16 || frameHeight < 16 || frameWidth * frameHeight > 4_000_000) {
    throw new Error('Each sprite cell needs to be between 16 px and 4 megapixels.');
  }

  const clips = {};
  for (const clip of ['idle', 'walk']) {
    clips[clip] = [];
    for (let column = 0; column < layout[clip].frames; column += 1) {
      const frame = document.createElement('canvas');
      frame.width = frameWidth;
      frame.height = frameHeight;
      const frameContext = frame.getContext('2d');
      if (!frameContext) throw new Error('DeskBuddy could not split that sprite sheet.');
      frameContext.drawImage(
        source,
        (layout[clip].start + column) * frameWidth,
        layout[clip].row * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      );
      const data = frame.toDataURL('image/png');
      if (!await imageHasVisiblePixels(data)) {
        throw new Error(`The ${clip} row contains an empty frame. Check the row and frame settings.`);
      }
      clips[clip].push(data);
    }
  }
  return { clips, layout, frameWidth, frameHeight };
}

async function rebuildImportedAnimations() {
  if (!selectedSheetData) return null;
  const { clips: animations, layout, frameWidth, frameHeight } = await splitSpriteSheet(selectedSheetData);
  importedAnimations = animations;
  setPreview(animations.idle[0]);
  updateGridChoiceState();
  const range = (clip) => `row ${layout[clip].row + 1}, columns ${layout[clip].start + 1}–${layout[clip].start + layout[clip].frames}`;
  setSheetStatus(`Ready: ${frameWidth} × ${frameHeight}px cells · idle ${range('idle')} · walk ${range('walk')}.`);
  return animations;
}

function stopPresetPreview() {
  if (presetPreviewTimer) window.clearInterval(presetPreviewTimer);
  presetPreviewTimer = null;
}

function playPresetPreview(animations) {
  stopPresetPreview();
  const frames = animations?.idle || [];
  if (!frames.length) {
    setPreview(null);
    return;
  }
  let frameIndex = 0;
  setPreview(frames[frameIndex]);
  if (frames.length === 1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  presetPreviewTimer = window.setInterval(() => {
    if (creationMode !== 'preset') {
      stopPresetPreview();
      return;
    }
    frameIndex = (frameIndex + 1) % frames.length;
    setPreview(frames[frameIndex]);
  }, 520);
}

async function loadPresetAnimations(presetId) {
  if (presetAnimationCache.has(presetId)) return presetAnimationCache.get(presetId);
  const preset = PRESETS[presetId];
  if (!preset) throw new Error('That starter buddy is not available.');
  const sheetUrl = new URL(preset.sheet, document.baseURI).href;
  const { clips } = await splitSpriteSheet(sheetUrl, PRESET_LAYOUT);
  const frames = [...clips.idle, ...clips.walk];
  const transparencyChecks = await Promise.all(frames.map(imageHasTransparentPixels));
  if (transparencyChecks.some((hasTransparency) => !hasTransparency)) {
    throw new Error(`${preset.name}'s sprite frames are missing transparency.`);
  }
  presetAnimationCache.set(presetId, clips);
  return clips;
}

async function selectPreset(presetId, { updateName = true } = {}) {
  const preset = PRESETS[presetId];
  if (!preset) return;
  const loadVersion = ++presetLoadVersion;
  selectedPresetId = presetId;
  presetAnimations = presetAnimationCache.get(presetId) || null;
  stopPresetPreview();
  for (const choice of presetChoices) {
    const isActive = choice.dataset.presetId === presetId;
    choice.classList.toggle('active', isActive);
    choice.setAttribute('aria-pressed', String(isActive));
  }
  if (updateName) {
    nameInput.value = preset.name;
    updatePreviewName();
  }
  presetPanel.setAttribute('aria-busy', 'true');
  presetStatus.textContent = `Waking ${preset.name}…`;
  if (creationMode === 'preset') {
    if (presetAnimations) playPresetPreview(presetAnimations);
    else setPreview(null);
  }
  setMessage();
  try {
    const animations = await loadPresetAnimations(presetId);
    if (loadVersion !== presetLoadVersion) return;
    presetAnimations = animations;
    if (creationMode === 'preset') playPresetPreview(animations);
    presetStatus.textContent = `${preset.name} is ready · 4 idle + 4 walk frames.`;
  } catch (error) {
    if (loadVersion !== presetLoadVersion) return;
    presetAnimations = null;
    if (creationMode === 'preset') setPreview(null);
    presetStatus.textContent = 'This starter could not be loaded.';
    throw error;
  } finally {
    if (loadVersion === presetLoadVersion) presetPanel.removeAttribute('aria-busy');
  }
}

async function useFile(file) {
  setMessage();
  importedAnimations = null;
  if (!file) return;
  if (file.type !== 'image/png') {
    setMessage('Choose a transparent PNG sprite sheet. JPG and WebP files cannot be used.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setMessage('Choose a sprite sheet smaller than 5 MB.');
    return;
  }
  try {
    const imageData = await readFile(file);
    const details = await window.deskbuddy.validateImage(imageData);
    if (!await imageHasTransparentPixels(imageData)) {
      throw new Error('This PNG still has a solid background. Export a clean transparent sprite sheet instead.');
    }
    selectedSheetData = imageData;
    renderSheetInfo(details.width, details.height);
    if (sheetGridChosen) await rebuildImportedAnimations();
    else setSheetStatus('Choose one of the grid sizes above, then set each animation row, start column, and frame count.');
  } catch (error) {
    selectedSheetData = null;
    selectedSheetMeta = null;
    sheetGridChosen = false;
    sheetInfo.hidden = true;
    gridChoices.replaceChildren();
    setPreview(null);
    setSheetStatus();
    setMessage(error.message);
  }
}

function setCreationMode(nextMode) {
  if (creationMode === 'draw') saveActiveFrame();
  stopPresetPreview();
  creationMode = nextMode;
  presetPanel.hidden = nextMode !== 'preset';
  importPanel.hidden = nextMode !== 'import';
  drawPanel.hidden = nextMode !== 'draw';
  for (const button of modeButtons) {
    const isActive = button.dataset.creationMode === nextMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
  if (nextMode === 'draw') {
    setPreview(drawingFrames[activeClip][activeFrame]);
  } else if (nextMode === 'preset') {
    if (presetAnimations?.idle?.[0]) playPresetPreview(presetAnimations);
    else if (selectedPresetId) selectPreset(selectedPresetId, { updateName: false }).catch(showError);
    else selectPreset('sprout').catch(showError);
  } else if (importedAnimations?.idle?.[0]) {
    setPreview(importedAnimations.idle[0]);
  } else {
    setPreview(null);
  }
  updateOnionSkin();
  setMessage();
}

function updateOnionSkin() {
  const previous = activeFrame > 0 ? drawingFrames[activeClip][activeFrame - 1] : null;
  const show = creationMode === 'draw' && onionToggle.checked && Boolean(previous);
  onionSkin.hidden = !show;
  onionSkin.style.opacity = String(Number(onionOpacity.value) / 100);
  onionOpacityOutput.value = `${onionOpacity.value}%`;
  onionSkin.src = show ? previous : '';
}

function clearCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function saveActiveFrame() {
  drawingFrames[activeClip][activeFrame] = canvas.toDataURL('image/png');
}

async function loadActiveFrame() {
  const loadVersion = ++frameLoadVersion;
  clearCanvas();
  const data = drawingFrames[activeClip][activeFrame];
  if (!data) return;
  const source = await loadImage(data);
  if (loadVersion !== frameLoadVersion) return;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (creationMode === 'draw') setPreview(data);
  updateOnionSkin();
}

function updateDrawingUI() {
  for (const button of clipButtons) {
    const isActive = button.dataset.clip === activeClip;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
  brushTool.classList.toggle('active', drawingTool === 'brush');
  eraserTool.classList.toggle('active', drawingTool === 'eraser');
  brushTool.setAttribute('aria-pressed', String(drawingTool === 'brush'));
  eraserTool.setAttribute('aria-pressed', String(drawingTool === 'eraser'));
  brushSizeOutput.value = `${brushSize.value} px`;
  drawFrameStatus.textContent = `${activeClip[0].toUpperCase()}${activeClip.slice(1)} · frame ${activeFrame + 1} of ${drawingFrames[activeClip].length}`;
  previousFrameButton.disabled = activeFrame === 0;
  nextFrameButton.disabled = activeFrame === drawingFrames[activeClip].length - 1;
  addFrameButton.disabled = drawingFrames[activeClip].length >= MAX_FRAMES_PER_CLIP;
  updateOnionSkin();

  drawFrameList.replaceChildren(...drawingFrames[activeClip].map((data, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame-thumb';
    button.classList.toggle('active', index === activeFrame);
    button.setAttribute('aria-label', `Select ${activeClip} frame ${index + 1}`);
    const thumbnail = document.createElement('img');
    thumbnail.src = data;
    thumbnail.alt = '';
    const label = document.createElement('span');
    label.textContent = String(index + 1);
    button.append(thumbnail, label);
    button.addEventListener('click', () => selectFrame(index));
    return button;
  }));
}

async function selectFrame(index) {
  saveActiveFrame();
  activeFrame = index;
  await loadActiveFrame();
  updateDrawingUI();
}

async function selectClip(clip) {
  saveActiveFrame();
  activeClip = clip;
  activeFrame = 0;
  await loadActiveFrame();
  updateDrawingUI();
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function paintStroke(from, to) {
  context.save();
  context.globalCompositeOperation = drawingTool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = brushColor.value;
  context.fillStyle = brushColor.value;
  context.lineWidth = Number(brushSize.value);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.4) {
    context.beginPath();
    context.arc(to.x, to.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}

function startDrawing(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  isDrawing = true;
  lastPoint = canvasPoint(event);
  canvas.setPointerCapture(event.pointerId);
  paintStroke(lastPoint, lastPoint);
}

function draw(event) {
  if (!isDrawing) return;
  const nextPoint = canvasPoint(event);
  paintStroke(lastPoint, nextPoint);
  lastPoint = nextPoint;
}

function stopDrawing(event) {
  if (!isDrawing) return;
  isDrawing = false;
  lastPoint = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  saveActiveFrame();
  setPreview(drawingFrames[activeClip][activeFrame]);
  updateDrawingUI();
}

async function exportedDrawingAnimations() {
  saveActiveFrame();
  const animations = { idle: [], walk: [] };
  for (const clip of ['idle', 'walk']) {
    for (const frame of drawingFrames[clip]) {
      if (await imageHasVisiblePixels(frame)) animations[clip].push(frame);
    }
    if (!animations[clip].length) {
      throw new Error(`Draw at least one visible ${clip} frame before creating your buddy.`);
    }
  }
  return animations;
}

function button(label, className, handler) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.addEventListener('click', handler);
  return element;
}

function makePetCard(pet) {
  const card = document.createElement('article');
  card.className = 'pet-card';

  const imageArea = document.createElement('div');
  imageArea.className = 'pet-card-image';
  if (pet.imageData) {
    const image = document.createElement('img');
    image.src = pet.imageData;
    image.alt = `${pet.name} preview`;
    imageArea.append(image);
  } else {
    const missing = document.createElement('span');
    missing.className = 'missing-image';
    missing.textContent = '✦';
    imageArea.append(missing);
  }

  const body = document.createElement('div');
  body.className = 'pet-card-body';
  const title = document.createElement('h3');
  title.className = 'pet-card-title';
  title.textContent = pet.name;
  const meta = document.createElement('p');
  meta.className = 'pet-card-meta';
  meta.textContent = `${pet.size} px · idle + walk frames`;
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.append(
    button('Show', 'show-button', () => window.deskbuddy.launchPet(pet.id).catch(showError)),
    button('Hide', 'hide-button', () => window.deskbuddy.hidePet(pet.id).catch(showError)),
    button('Delete', 'delete-button', async () => {
      if (!window.confirm(`Delete ${pet.name}? This removes all of its saved sprite frames.`)) return;
      try {
        await window.deskbuddy.deletePet(pet.id);
        await refreshPets();
      } catch (error) {
        showError(error);
      }
    }),
  );
  body.append(title, meta, actions);
  card.append(imageArea, body);
  return card;
}

function showError(error) {
  setMessage(error?.message || 'Something went wrong. Please try again.');
}

async function refreshPets() {
  try {
    const pets = await window.deskbuddy.listPets();
    petList.replaceChildren(...pets.map(makePetCard));
    emptyState.hidden = pets.length > 0;
    buddyCount.textContent = `${pets.length} ${pets.length === 1 ? 'buddy' : 'buddies'}`;
  } catch (error) {
    showError(error);
  }
}

async function resetCreator() {
  form.reset();
  stopPresetPreview();
  presetLoadVersion += 1;
  selectedPresetId = null;
  presetAnimations = null;
  presetStatus.textContent = 'Choose a starter to preview its animation.';
  for (const choice of presetChoices) {
    choice.classList.remove('active');
    choice.setAttribute('aria-pressed', 'false');
  }
  selectedSheetData = null;
  importedAnimations = null;
  selectedSheetMeta = null;
  sheetGridChosen = false;
  sheetInfo.hidden = true;
  gridChoices.replaceChildren();
  drawingFrames = { idle: [blankFrame()], walk: [blankFrame()] };
  activeClip = 'idle';
  activeFrame = 0;
  drawingTool = 'brush';
  sizeInput.value = '112';
  sizeOutput.value = '112 px';
  brushSizeOutput.value = `${brushSize.value} px`;
  setPreview(null);
  setSheetStatus();
  clearCanvas();
  updateDrawingUI();
  updatePreviewName();
  if (creationMode === 'preset') await selectPreset('sprout');
}

imageInput.addEventListener('change', () => useFile(imageInput.files?.[0]));
for (const eventName of ['dragenter', 'dragover']) {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add('drag-over');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove('drag-over');
  });
}
uploadZone.addEventListener('drop', (event) => useFile(event.dataTransfer?.files?.[0]));
for (const button of modeButtons) {
  button.addEventListener('click', () => setCreationMode(button.dataset.creationMode));
}
for (const choice of presetChoices) {
  choice.addEventListener('click', () => selectPreset(choice.dataset.presetId).catch(showError));
}
for (const input of Object.values(layoutInputs)) {
  input.addEventListener('change', async () => {
    if (!selectedSheetData) return;
    sheetGridChosen = true;
    try {
      await rebuildImportedAnimations();
      setMessage();
    } catch (error) {
      importedAnimations = null;
      setSheetStatus('Check your row, column, and frame values.');
      setMessage(error.message);
    }
  });
}
nameInput.addEventListener('input', updatePreviewName);
sizeInput.addEventListener('input', () => { sizeOutput.value = `${sizeInput.value} px`; });

brushSize.addEventListener('input', updateDrawingUI);
onionToggle.addEventListener('change', updateOnionSkin);
onionOpacity.addEventListener('input', updateOnionSkin);
brushTool.addEventListener('click', () => { drawingTool = 'brush'; updateDrawingUI(); });
eraserTool.addEventListener('click', () => { drawingTool = 'eraser'; updateDrawingUI(); });
clearFrameButton.addEventListener('click', () => {
  clearCanvas();
  saveActiveFrame();
  setPreview(drawingFrames[activeClip][activeFrame]);
  updateDrawingUI();
});
for (const clipButton of clipButtons) {
  clipButton.addEventListener('click', () => selectClip(clipButton.dataset.clip));
}
previousFrameButton.addEventListener('click', () => selectFrame(Math.max(0, activeFrame - 1)));
nextFrameButton.addEventListener('click', () => selectFrame(Math.min(drawingFrames[activeClip].length - 1, activeFrame + 1)));
addFrameButton.addEventListener('click', async () => {
  saveActiveFrame();
  if (drawingFrames[activeClip].length >= MAX_FRAMES_PER_CLIP) return;
  drawingFrames[activeClip].push(blankFrame());
  activeFrame = drawingFrames[activeClip].length - 1;
  await loadActiveFrame();
  updateDrawingUI();
});
deleteFrameButton.addEventListener('click', async () => {
  saveActiveFrame();
  if (drawingFrames[activeClip].length === 1) {
    clearCanvas();
    saveActiveFrame();
    setPreview(drawingFrames[activeClip][activeFrame]);
  } else {
    drawingFrames[activeClip].splice(activeFrame, 1);
    activeFrame = Math.min(activeFrame, drawingFrames[activeClip].length - 1);
    await loadActiveFrame();
  }
  updateDrawingUI();
});

canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const requestedMode = creationMode;
  const requestedPresetId = selectedPresetId;
  const requestedName = nameInput.value;
  const requestedSize = sizeInput.value;
  setCreateButton(true);
  setMessage();
  try {
    let animations;
    if (requestedMode === 'preset') {
      if (!requestedPresetId) throw new Error('Choose a starter buddy first.');
      animations = presetAnimationCache.get(requestedPresetId) || await loadPresetAnimations(requestedPresetId);
    } else if (requestedMode === 'import') {
      animations = await rebuildImportedAnimations();
      if (!animations) throw new Error('Choose a transparent PNG sprite sheet first.');
    } else {
      animations = await exportedDrawingAnimations();
    }
    await window.deskbuddy.createPet({
      animations,
      name: requestedName,
      size: requestedSize,
      motion: 'wander',
    });
    await resetCreator();
    setMessage('Your animated buddy is now on your desktop.', true);
    await refreshPets();
  } catch (error) {
    showError(error);
  } finally {
    setCreateButton(false);
  }
});

window.deskbuddy.onPetsChanged(refreshPets);
updatePreviewName();
updateDrawingUI();
loadActiveFrame().catch(showError);
selectPreset('sprout').catch(showError);
refreshPets();
