//! name=MAZE color=0,180,255
// MAZE - reach the green exit. One tap glides you down the corridor and stops
// at the next junction, so you steer with a handful of taps instead of inching
// cell by cell. Time-attack: start with 30s, every solve adds time and +1.
export default async function (api) {
  const { setPx, drawText, drawRect, display, piezo, Effects, sleep,
          gameOverScreen, joyX, joyY, colors } = api;

  const N = 8, S = 2 * N + 1, CELL = 3, OX = 6, OY = 7; // 51px playfield
  const START_MS = 30000, BONUS_MS = 11000, CAP_MS = 38000;

  let maze = [], px = 1, py = 1, gx = S - 2, gy = S - 2;
  let score = 0, lastJoy = 0, timeLeft = START_MS, blink = 0;
  let sliding = []; // remaining cells to glide through

  function build() {
    maze = Array.from({ length: S }, () => Array(S).fill(1));
    const seen = Array.from({ length: N }, () => Array(N).fill(false));
    const stack = [[0, 0]];
    seen[0][0] = true; maze[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1], opts = [];
      if (y > 0 && !seen[y - 1][x]) opts.push([x, y - 1]);
      if (x < N - 1 && !seen[y][x + 1]) opts.push([x + 1, y]);
      if (y < N - 1 && !seen[y + 1][x]) opts.push([x, y + 1]);
      if (x > 0 && !seen[y][x - 1]) opts.push([x - 1, y]);
      if (!opts.length) { stack.pop(); continue; }
      const [nx, ny] = opts[Math.floor(Math.random() * opts.length)];
      seen[ny][nx] = true;
      maze[y * 2 + 1 + (ny - y)][x * 2 + 1 + (nx - x)] = 0;
      maze[ny * 2 + 1][nx * 2 + 1] = 0;
      stack.push([nx, ny]);
    }
    px = 1; py = 1; sliding = [];
  }

  const open = (x, y) => x >= 0 && y >= 0 && x < S && y < S && maze[y][x] === 0;

  // walk from the player in one direction until a wall, junction, or the goal
  function computeSlide(dx, dy) {
    const cells = []; let x = px, y = py;
    while (true) {
      const nx = x + dx, ny = y + dy;
      if (!open(nx, ny)) break;             // wall ahead
      x = nx; y = ny; cells.push([x, y]);
      if (x === gx && y === gy) break;      // reached exit
      const perp = dx !== 0 ? (open(x, y - 1) || open(x, y + 1))
                            : (open(x - 1, y) || open(x + 1, y));
      if (perp) break;                      // decision point
    }
    return cells;
  }
  function startSlide(dx, dy) { if (!sliding.length) { const s = computeSlide(dx, dy); if (s.length) sliding = s; } }

  api.dpadHandler = d => {
    if (d === "up") startSlide(0, -1);
    else if (d === "down") startSlide(0, 1);
    else if (d === "left") startSlide(-1, 0);
    else if (d === "right") startSlide(1, 0);
  };

  build();
  let last = Date.now();
  while (!api.exitRequested) {
    const now = Date.now();
    timeLeft -= now - last; last = now;
    if (timeLeft <= 0) { await gameOverScreen(score); return; }

    if (sliding.length) {
      const [nx, ny] = sliding.shift();
      px = nx; py = ny;
    } else {
      const jx = joyX(), jy = joyY();
      if (now - lastJoy > 90 && (Math.abs(jx) > 0.55 || Math.abs(jy) > 0.55)) {
        if (Math.abs(jx) > Math.abs(jy)) startSlide(jx > 0 ? 1 : -1, 0);
        else startSlide(0, jy > 0 ? 1 : -1);
        lastJoy = now;
      }
    }

    if (px === gx && py === gy) {
      score++; piezo.playSong(Effects.upgrade);
      timeLeft = Math.min(CAP_MS, timeLeft + BONUS_MS);
      build();
    }

    blink = (blink + 1) % 20;
    display.clear();
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++)
        if (maze[y][x]) drawRect(OX + x * CELL, OY + y * CELL, CELL, CELL, colors.rgb(0, 30, 70));
    drawRect(OX + gx * CELL, OY + gy * CELL, CELL, CELL, blink < 10 ? colors.green : colors.rgb(0, 110, 0));
    drawRect(OX + px * CELL, OY + py * CELL, CELL, CELL, colors.white);

    const bar = Math.min(64, Math.floor(timeLeft / START_MS * 64));
    const barCol = timeLeft < 6000 ? colors.rgb(130, 40, 0) : colors.rgb(80, 80, 80);
    for (let i = 0; i < bar; i++) setPx(i, 0, barCol);
    drawText(1, 1, String(score), colors.rgb(0, 120, 120));
    display.show();
    await sleep(24);
  }
}
