//! name=PAINT color=255,120,40
export default async function(api){
const {display, colors, setPx, drawText, drawRect, sleep, joyX, joyY, sliderPos, held, udpRequest} = api;

const W = 64;
const H = 64;
const PIXELS = new Uint8Array(W * H);
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const colorCache = new Array(256);
for (let i = 0; i < 256; i++) colorCache[i] = rgb332ToColor(i);

// Encode a friendly 0-255 RGB triple into an RGB332 byte. This is the same
// format the display and the upload use (8 red levels, 8 green, 4 blue), so
// everything the palette produces stays compatible with saving.
function rgb332(r, g, b){
  return ((Math.round(r / 255 * 7) & 7) << 5)
       | ((Math.round(g / 255 * 7) & 7) << 2)
       |  (Math.round(b / 255 * 3) & 3);
}

// Curated preset palette. The slider picks one of THESE instead of scanning
// all 256 raw values, so each color is easy to land on. To add a color,
// just drop another rgb332(r, g, b) entry in — it'll appear on the slider.
const PALETTE = [
  // grayscale
  rgb332(0, 0, 0),        // black
  rgb332(85, 85, 85),     // dark gray
  rgb332(130, 130, 130),  // gray
  rgb332(175, 175, 175),  // light gray
  rgb332(215, 215, 215),  // silver
  rgb332(255, 255, 255),  // white
  // bright hues
  rgb332(255, 0, 0),      // red
  rgb332(255, 120, 0),    // orange
  rgb332(255, 220, 0),    // yellow
  rgb332(160, 255, 0),    // lime
  rgb332(0, 255, 0),      // green
  rgb332(0, 255, 150),    // spring green
  rgb332(0, 255, 255),    // cyan
  rgb332(0, 150, 255),    // sky blue
  rgb332(0, 0, 255),      // blue
  rgb332(120, 0, 255),    // violet
  rgb332(255, 0, 255),    // magenta
  rgb332(255, 0, 130),    // rose
  // deep / muted
  rgb332(120, 0, 0),      // dark red
  rgb332(120, 60, 0),     // brown
  rgb332(0, 100, 0),      // dark green
  rgb332(0, 80, 120),     // teal
  rgb332(0, 0, 120),      // navy
  rgb332(80, 0, 140),     // purple
  // pastels
  rgb332(255, 180, 170),  // peach
  rgb332(255, 230, 150),  // cream
  rgb332(170, 255, 170),  // mint
  rgb332(150, 190, 255),  // periwinkle
  rgb332(210, 170, 255),  // lavender
  rgb332(255, 170, 230),  // pink
];
const WHITE_SLOT = 5; // index of white in PALETTE (starting color)

let cursorX = 32.0;
let cursorY = 32.0;
let prevDrawX = cursorX;
let prevDrawY = cursorY;
let tool = 0; // 0 draw, 1 erase
let setting = 0; // 0 color, 1 size
const BACKGROUND_INDEX = 0; // black
let colorSlot = WHITE_SLOT;           // position within PALETTE
let colorIndex = PALETTE[colorSlot];  // RGB332 byte actually painted
let brushSize = 2;
let sliderArmed = false;
let sliderAnchor = 0;
let lastUp = false;
let lastLeft = false;
let lastRight = false;
let lastJoyMove = 0;
let holdSaveMs = 0;
let isUploading = false;
let savedFlashMs = 0;
let failFlashMs = 0;
let lastPainting = false;

for (let i = 0; i < PIXELS.length; i++) PIXELS[i] = BACKGROUND_INDEX;
sliderAnchor = sliderPos();

function rgb332ToColor(v){
  const r = Math.round(((v >> 5) & 7) * 255 / 7);
  const g = Math.round(((v >> 2) & 7) * 255 / 7);
  const b = Math.round((v & 3) * 255 / 3);
  return colors.rgb(r, g, b);
}

function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
function idx(x, y){ return x + y * W; }

function stamp(cx, cy, pixelValue){
  const radius = Math.max(0, brushSize - 1);
  if (radius === 0) {
    if (cx >= 0 && cx < W && cy >= 0 && cy < H) PIXELS[idx(cx, cy)] = pixelValue;
    return;
  }
  const rr = radius * radius;
  for (let y = cy - radius; y <= cy + radius; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || x >= W) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rr) PIXELS[idx(x, y)] = pixelValue;
    }
  }
}

function drawStroke(x0, y0, x1, y1, pixelValue){
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 0) {
    stamp(x0, y0, pixelValue);
    return;
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);
    stamp(x, y, pixelValue);
  }
}

function applySlider(){
  const s = sliderPos();

  // After switching between COLOR and SIZE, do not immediately copy the
  // slider's current physical position into the newly selected setting.
  // The setting only starts following the slider after it is moved enough.
  if (!sliderArmed) {
    if (Math.abs(s - sliderAnchor) < 0.035) return;
    sliderArmed = true;
  }

  if (setting === 0) {
    // Pick a preset from PALETTE. Each color owns an equal band of the
    // slider's travel, so selecting one is far less fiddly than scanning
    // all 256 raw values.
    colorSlot = clamp(Math.floor(s * PALETTE.length), 0, PALETTE.length - 1);
    colorIndex = PALETTE[colorSlot];
  } else {
    brushSize = 1 + Math.floor(s * 5.99);
  }
}

function switchSetting(){
  setting = setting === 0 ? 1 : 0;
  sliderAnchor = sliderPos();
  sliderArmed = false;
}

function joystickSpeed(value, drawing){
  const amount = Math.abs(value);
  if (amount < 0.05) return 0;

  const normalized = (amount - 0.05) / 0.95;
  const curved = normalized * normalized;
  const minSpeed = 0.12;
  const maxSpeed = drawing ? 1.9 : 3.0;

  return Math.sign(value) * (minSpeed + curved * (maxSpeed - minSpeed));
}

function drawCanvas(){
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) setPx(x, y, colorCache[PIXELS[idx(x, y)]]);
  }
}

function drawCursor(){
  const cx = Math.round(cursorX);
  const cy = Math.round(cursorY);
  const c1 = colors.black;
  const c2 = colors.white;
  for (let dx = -2; dx <= 2; dx++) {
    if (dx !== 0) {
      setPx(cx + dx, cy, c1);
      setPx(cx + dx, cy + (dx < 0 ? -1 : 1), c2);
    }
  }
  for (let dy = -2; dy <= 2; dy++) {
    if (dy !== 0) {
      setPx(cx, cy + dy, c1);
      setPx(cx + (dy < 0 ? -1 : 1), cy + dy, c2);
    }
  }
  setPx(cx, cy, tool === 0 ? colors.white : colors.red);
}

function drawUi(){
  drawRect(0, 0, 64, 8, colors.rgb(0, 0, 0));
  const modeText = setting === 0 ? "C" : "S";
  const toolText = tool === 0 ? "D" : "E";
  drawText(1, 1, modeText, setting === 0 ? colors.yellow : colors.rgb(120, 120, 120));
  drawText(6, 1, toolText, tool === 0 ? colors.rgb(0, 255, 120) : colors.red);
  drawRect(12, 1, 10, 6, colorCache[colorIndex]);
  drawText(25, 1, String(brushSize), colors.white);

  const sliderX = 34;
  const sliderW = 28;
  drawRect(sliderX, 2, sliderW, 4, colors.rgb(40, 40, 40));
  const fill = setting === 0
    ? Math.floor((colorSlot + 1) * sliderW / PALETTE.length)
    : Math.floor((brushSize - 1) * sliderW / 5);
  drawRect(sliderX, 2, fill, 4, setting === 0 ? colorCache[colorIndex] : colors.rgb(0, 200, 255));

  if (savedFlashMs > 0) {
    drawRect(0, 56, 64, 8, colors.rgb(0, 60, 0));
    drawText(16, 58, "SAVED", colors.rgb(0, 255, 120));
  } else if (failFlashMs > 0) {
    drawRect(0, 56, 64, 8, colors.rgb(70, 0, 0));
    drawText(15, 58, "FAILED", colors.red);
  } else if (held.up && held.down && !isUploading) {
    drawRect(0, 56, 64, 8, colors.rgb(0, 0, 0));
    drawText(1, 58, "SAVE", colors.yellow);
    const prog = clamp(Math.floor((holdSaveMs / 900) * 42), 0, 42);
    drawRect(20, 59, 42, 3, colors.rgb(40, 40, 40));
    drawRect(20, 59, prog, 3, colors.rgb(0, 220, 140));
  }
}

function render(){
  display.clear();
  drawCanvas();
  drawUi();
  drawCursor();
  display.show();
}

function encodeBase64(bytes){
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63];
    out += B64[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[triple & 63] : "=";
  }
  return out;
}

async function request(obj, timeoutMs, tries){
  for (let i = 0; i < tries; i++) {
    const r = await udpRequest(obj, timeoutMs);
    if (r && r.ok) return r;
    await sleep(60);
  }
  return null;
}

function uploadScreen(text, progress){
  display.clear();
  drawText(8, 18, text, colors.rgb(0, 200, 255));
  drawRect(6, 34, 52, 5, colors.rgb(40, 40, 40));
  drawRect(6, 34, clamp(Math.floor(progress * 52), 0, 52), 5, colors.rgb(0, 220, 140));
  display.show();
}

async function uploadImage(){
  if (isUploading) return false;
  isUploading = true;
  try {
    const b64 = encodeBase64(PIXELS);
    const chunkSize = 240;
    const chunks = Math.ceil(b64.length / chunkSize);
    const name = "PAINT " + String(Date.now() % 100000);

    uploadScreen("OPEN", 0.05);
    const open = await request({ t: "gupopen", name, type: "image", size: PIXELS.length, chunks, totalChars: b64.length }, 3500, 3);
    if (!open || !open.id) throw new Error("open failed");
    const id = open.id;

    for (let i = 0; i < chunks; i++) {
      const part = b64.slice(i * chunkSize, (i + 1) * chunkSize);
      uploadScreen("UPLOAD", (i + 1) / (chunks + 1));
      const ok = await request({ t: "gupchunk", id, i, data: part }, 3500, 3);
      if (!ok) throw new Error("chunk failed");
    }

    uploadScreen("SAVE", 0.98);
    const done = await request({ t: "gupfinish", id }, 5000, 3);
    if (!done) throw new Error("finish failed");
    savedFlashMs = 1100;
    return true;
  } catch (e) {
    failFlashMs = 1400;
    return false;
  } finally {
    isUploading = false;
  }
}

api.dpadHandler = (d) => {
  if (d === "up") {
    if (!held.down) switchSetting();
  } else if (d === "left") {
    tool = 1;
  } else if (d === "right") {
    tool = 0;
  }
};
api.joyClickHandler = () => {};

while (!api.exitRequested) {
  applySlider();

  if (!isUploading) {
    const painting = !!held.down || !!api.joyHeld;
    const jx = joyX();
    const jy = joyY();

    cursorX = clamp(cursorX + joystickSpeed(jx, painting), 0, W - 1);
    cursorY = clamp(cursorY + joystickSpeed(jy, painting), 0, H - 1);

    const drawX = Math.round(cursorX);
    const drawY = Math.round(cursorY);

    if (painting) {
      const px = tool === 0 ? colorIndex : BACKGROUND_INDEX;
      if (!lastPainting) { prevDrawX = drawX; prevDrawY = drawY; }
      drawStroke(prevDrawX, prevDrawY, drawX, drawY, px);
      prevDrawX = drawX;
      prevDrawY = drawY;
    }
    lastPainting = painting;

    if (held.up && held.down) {
      holdSaveMs += 50;
      if (holdSaveMs >= 900) {
        holdSaveMs = 0;
        await uploadImage();
        while ((held.up || held.down) && !api.exitRequested) await sleep(20);
      }
    } else {
      holdSaveMs = 0;
    }
  }

  if (savedFlashMs > 0) savedFlashMs -= 50;
  if (failFlashMs > 0) failFlashMs -= 50;

  render();
  await sleep(50);
}
}