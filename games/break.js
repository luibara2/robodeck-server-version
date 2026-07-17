//! name=BREAK color=255,100,0
// BREAK - classic breakout, now with a livelier ball that speeds up each time
// it hits the paddle (capped), a faster frame rate, and snappier paddle.
export default async function (api) {
  const { setPx, drawText, drawRect, display, piezo, Effects, sleep,
          gameOverScreen, flashScreen, makeHControl, colors } = api;

  const PW = 12, PY = 61, MAXV = 2.25;
  const ctrl = makeHControl(26, 0, 64 - PW, 2.6);
  const ROWS = 5, COLS = 8;
  const brickCols = [colors.red, colors.rgb(255, 100, 0), colors.yellow, colors.green, colors.blue];

  let paddleX = 26, lives = 3, score = 0, level = 1;
  let bricks = [], bx = 32, by = 50, bvx = 1, bvy = -1.4;

  function resetBricks() { bricks = []; for (let r = 0; r < ROWS; r++) bricks.push(Array(COLS).fill(true)); }
  function bricksLeft() { return bricks.some(row => row.some(b => b)); }
  function baseSpeed() { return 1.45 + level * 0.2; }
  function resetBall() {
    bx = paddleX + PW / 2; by = 50;
    const sp = baseSpeed();
    bvx = (Math.random() < 0.5 ? -1 : 1) * sp * 0.6;
    bvy = -Math.sqrt(Math.max(sp * sp - bvx * bvx, 0.4));
  }
  function reflectOffPaddle() {
    const off = (bx - (paddleX + PW / 2)) / (PW / 2);
    const sp = Math.min(MAXV, Math.hypot(bvx, bvy) * 1.04); // accelerate on hit
    bvx = off * sp * 0.92;
    bvy = -Math.sqrt(Math.max(sp * sp - bvx * bvx, 0.3));
    by = PY - 2;
  }

  api.dpadHandler = () => {};
  resetBricks(); resetBall();

  while (!api.exitRequested) {
    paddleX = ctrl.update();
    bx += bvx; by += bvy;

    if (bx < 1) { bx = 1; bvx = -bvx; }
    if (bx > 62) { bx = 62; bvx = -bvx; }
    if (by < 1) { by = 1; bvy = -bvy; }

    if (bvy > 0 && by >= PY - 2 && by <= PY + 2 && bx >= paddleX - 1 && bx <= paddleX + PW) {
      reflectOffPaddle();
      piezo.playSong(Effects.menuMove);
    }

    const col = Math.floor(bx / 8), row = Math.floor((by - 5) / 4);
    if (row >= 0 && row < ROWS && col >= 0 && col < COLS && bricks[row][col]) {
      bricks[row][col] = false; score++; bvy = -bvy;
      piezo.playSong(Effects.coin);
      if (!bricksLeft()) {
        piezo.playSong(Effects.win);
        for (let f = 0; f < 3; f++) {
          for (let r = 0; r < ROWS; r++) drawRect(0, 5 + r * 4, 64, 3, brickCols[(r + f) % ROWS]);
          display.show(); await sleep(120);
        }
        level++; resetBricks(); resetBall();
      }
    }

    if (by > 63) {
      lives--; piezo.playSong(Effects.damage);
      if (lives <= 0) { await gameOverScreen(score); return; }
      await flashScreen(colors.rgb(60, 0, 0), 1); resetBall();
    }

    display.clear();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (bricks[r][c]) drawRect(c * 8, 5 + r * 4, 7, 3, brickCols[r]);
    for (let i = 0; i < lives; i++) setPx(62 - i * 2, 1, colors.red);
    drawRect(Math.round(paddleX), PY, PW, 2, colors.white);
    drawRect(Math.round(bx) - 1, Math.round(by) - 1, 2, 2, colors.rgb(0, 255, 255));
    drawText(1, 1, String(score), colors.rgb(70, 70, 70));
    display.show();
    await sleep(22);
  }
}
