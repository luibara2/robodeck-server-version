//! name=LABY color=255,120,0
// LABYRINTH - tilt the deck to roll the ball through the maze to the green
// exit. Don't fall in the dark pits. Each maze cleared = +1. 3 lives.
export default async function (api) {
  const { setPx, drawText, drawRect, display, piezo, Effects, sleep,
          gameOverScreen, flashScreen, sliderPos, mpu, colors } = api;

  if (!mpu) {
    display.clear();
    drawText(6, 28, "NO GYRO", colors.red);
    display.show();
    piezo.playSong(Effects.error);
    await sleep(1500);
    return;
  }

  const N = 5, S = 2 * N + 1;      // logical cells / wall-grid size (11)
  const CELL = 5, OX = 4, OY = 7;  // 55px playfield, HUD across the top
  const R = 1;                     // ball half-size (2px ball)

  let maze = [], holes = [], exit = { cx: S - 2, cy: S - 2 };
  let ball, level = 0, lives = 3, score = 0;

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
    // the maze has a single route start->exit; find it so we never block it
    const onPath = solutionPath();
    // scatter pits on open cells that are NOT on that route (and not start/exit)
    holes = [];
    const open = [];
    for (let cy = 1; cy < S; cy += 2)
      for (let cx = 1; cx < S; cx += 2) {
        if ((cx === 1 && cy === 1) || (cx === exit.cx && cy === exit.cy)) continue;
        if (onPath.has(cx + "," + cy)) continue;
        open.push([cx, cy]);
      }
    const nHoles = Math.min(open.length, 1 + level);
    for (let i = 0; i < nHoles; i++)
      holes.push(open.splice(Math.floor(Math.random() * open.length), 1)[0]);
    resetBall();
  }

  // BFS over open cells from start to exit, returns the set of cells on the path
  function solutionPath() {
    const key = (x, y) => x + "," + y;
    const startK = key(1, 1), goalK = key(exit.cx, exit.cy);
    const prev = { [startK]: null }, q = [[1, 1]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === exit.cx && y === exit.cy) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        if (maze[ny][nx] !== 0 || k in prev) continue;
        prev[k] = key(x, y); q.push([nx, ny]);
      }
    }
    const path = new Set();
    let cur = goalK;
    while (cur) { path.add(cur); cur = prev[cur]; }
    return path;
  }

  function resetBall() {
    ball = { x: OX + CELL + CELL / 2, y: OY + CELL + CELL / 2, vx: 0, vy: 0 };
  }

  function wallAt(px, py) {
    const cx = Math.floor((px - OX) / CELL), cy = Math.floor((py - OY) / CELL);
    if (cx < 0 || cy < 0 || cx >= S || cy >= S) return true;
    return maze[cy][cx] === 1;
  }
  function blocked(nx, ny) {
    return wallAt(nx - R, ny - R) || wallAt(nx + R, ny - R) ||
           wallAt(nx - R, ny + R) || wallAt(nx + R, ny + R);
  }

  build();
  api.dpadHandler = () => {};

  while (!api.exitRequested) {
    // slider sets overall ball speed: ~0.5x (slow/precise) .. ~1.6x (fast)
    const s = Math.max(0, Math.min(1, typeof sliderPos === "function" ? sliderPos() : 0.5));
    const k = 0.5 + s * 1.1;
    const gain = 0.3 * k, MAX = 1.5 * k;
    const [rax, ray] = mpu.getAcceleration();
    // match TILT's axis convention for this device
    ball.vx += ray * -gain;
    ball.vy += rax * -gain;
    ball.vx *= 0.88; ball.vy *= 0.88;
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > MAX) { ball.vx *= MAX / sp; ball.vy *= MAX / sp; }

    let nx = ball.x + ball.vx;
    if (blocked(nx, ball.y)) ball.vx *= -0.25; else ball.x = nx;
    let ny = ball.y + ball.vy;
    if (blocked(ball.x, ny)) ball.vy *= -0.25; else ball.y = ny;

    const bcx = Math.floor((ball.x - OX) / CELL);
    const bcy = Math.floor((ball.y - OY) / CELL);

    if (holes.some(h => h[0] === bcx && h[1] === bcy)) {
      lives--;
      piezo.playSong(Effects.damage);
      await flashScreen(colors.rgb(60, 0, 0), 1);
      if (lives <= 0) { await gameOverScreen(score); return; }
      resetBall();
      continue;
    }
    if (bcx === exit.cx && bcy === exit.cy) {
      score++; level++;
      piezo.playSong(Effects.win);
      await flashScreen(colors.rgb(0, 45, 0), 1);
      build();
      continue;
    }

    display.clear();
    for (let cy = 0; cy < S; cy++)
      for (let cx = 0; cx < S; cx++)
        if (maze[cy][cx]) drawRect(OX + cx * CELL, OY + cy * CELL, CELL, CELL, colors.rgb(0, 25, 60));
    for (const h of holes) {
      const hx = OX + h[0] * CELL, hy = OY + h[1] * CELL;
      drawRect(hx + 1, hy + 1, CELL - 2, CELL - 2, colors.rgb(20, 0, 30));
      setPx(hx + Math.floor(CELL / 2), hy + Math.floor(CELL / 2), colors.rgb(70, 0, 90));
    }
    drawRect(OX + exit.cx * CELL, OY + exit.cy * CELL, CELL, CELL, colors.green);
    drawRect(Math.round(ball.x) - 1, Math.round(ball.y) - 1, 2, 2, colors.white);

    drawText(1, 1, String(score), colors.rgb(120, 80, 0));
    // slider speed indicator
    const bx = 24, bw = 16;
    for (let i = 0; i < bw; i++) setPx(bx + i, 2, colors.rgb(30, 30, 30));
    setPx(bx + Math.round(s * (bw - 1)), 2, colors.rgb(0, 200, 255));
    for (let i = 0; i < lives; i++) setPx(62 - i * 2, 1, colors.rgb(0, 200, 255));
    display.show();
    await sleep(28);
  }
}
