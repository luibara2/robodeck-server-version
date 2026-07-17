//! name=2048 color=255,180,0
// 2048 - slide with the d-pad or joystick, merge matching tiles. Tile value
// shown by colour (and number). Score = points from merges. Ends when stuck.
export default async function (api) {
  const { setPx, drawText, drawRect, display, piezo, Effects, sleep,
          gameOverScreen, flashScreen, joyX, joyY, colors } = api;

  const CELL = 13, GAP = 1, OX = 4, OY = 8; // 4x4 board under a HUD row
  let board = Array.from({ length: 4 }, () => Array(4).fill(0));
  let score = 0, reached2048 = false, lastJoy = 0;
  const queue = [];

  const tileCol = {
    2: colors.rgb(60, 60, 75), 4: colors.rgb(90, 90, 130), 8: colors.rgb(0, 150, 255),
    16: colors.rgb(0, 220, 255), 32: colors.rgb(0, 255, 150), 64: colors.rgb(160, 255, 0),
    128: colors.rgb(255, 220, 0), 256: colors.rgb(255, 140, 0), 512: colors.rgb(255, 60, 0),
    1024: colors.rgb(255, 0, 90), 2048: colors.rgb(255, 0, 220), 4096: colors.rgb(180, 80, 255)
  };
  const label = v => v >= 1024 ? (v / 1024) + "K" : String(v);

  function spawn() {
    const empty = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!board[y][x]) empty.push([x, y]);
    if (!empty.length) return;
    const [x, y] = empty[Math.floor(Math.random() * empty.length)];
    board[y][x] = Math.random() < 0.9 ? 2 : 4;
  }

  function slideLine(line) { // compress + merge toward index 0
    let a = line.filter(v => v), gained = 0;
    for (let i = 0; i < a.length - 1; i++)
      if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1); }
    while (a.length < 4) a.push(0);
    return { a, gained };
  }

  function move(dir) {
    const before = JSON.stringify(board);
    let gained = 0, bigMerge = false;
    for (let i = 0; i < 4; i++) {
      let line;
      if (dir === "left") line = board[i].slice();
      else if (dir === "right") line = board[i].slice().reverse();
      else if (dir === "up") line = [board[0][i], board[1][i], board[2][i], board[3][i]];
      else line = [board[3][i], board[2][i], board[1][i], board[0][i]];
      const { a, gained: g } = slideLine(line);
      if (g >= 128) bigMerge = true;
      gained += g;
      if (dir === "right" || dir === "down") a.reverse();
      if (dir === "left" || dir === "right") board[i] = a;
      else for (let k = 0; k < 4; k++) board[k][i] = a[k];
    }
    if (JSON.stringify(board) === before) return false;
    score += gained;
    if (gained) piezo.playSong(bigMerge ? Effects.upgrade : Effects.coin);
    else piezo.playSong(Effects.menuMove);
    if (!reached2048 && board.some(r => r.some(v => v >= 2048))) {
      reached2048 = true;
      piezo.playSong(Effects.win);
    }
    return true;
  }

  function canMove() {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if (!board[y][x]) return true;
      if (x < 3 && board[y][x] === board[y][x + 1]) return true;
      if (y < 3 && board[y][x] === board[y + 1][x]) return true;
    }
    return false;
  }

  function draw() {
    display.clear();
    drawText(1, 1, String(score).slice(0, 5), colors.rgb(120, 120, 90));
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = OX + x * (CELL + GAP), py = OY + y * (CELL + GAP), v = board[y][x];
      if (!v) { drawRect(px, py, CELL, CELL, colors.rgb(18, 18, 24)); continue; }
      drawRect(px, py, CELL, CELL, tileCol[v] || colors.white);
      const t = label(v);
      const tw = t.length * 4;                       // ~4px per glyph
      const tc = v >= 128 ? colors.rgb(10, 10, 10) : colors.white;
      drawText(px + Math.max(0, Math.floor((CELL - tw) / 2)) + 1, py + 4, t, tc);
    }
    display.show();
  }

  api.dpadHandler = d => queue.push(d);
  spawn(); spawn(); draw();

  while (!api.exitRequested) {
    const now = Date.now(), jx = joyX(), jy = joyY();
    if (now - lastJoy > 180 && (Math.abs(jx) > 0.6 || Math.abs(jy) > 0.6)) {
      queue.push(Math.abs(jx) > Math.abs(jy) ? (jx > 0 ? "right" : "left")
                                             : (jy > 0 ? "down" : "up"));
      lastJoy = now;
    }
    if (queue.length) {
      const d = queue.shift();
      if (move(d)) { spawn(); draw(); if (!canMove()) { await sleep(300); await gameOverScreen(score); return; } }
    }
    await sleep(30);
  }
}
