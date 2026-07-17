//! name=CROSS color=100,230,80
// CROSS - hop up through the traffic to the green strip at the top. Two safe
// median rows let you rest; getting hit only knocks you back to the median
// below you, not all the way to the start. Each crossing = +1, then it speeds
// up a little. 3 lives.
export default async function (api) {
  const { setPx, drawText, drawRect, display, piezo, Effects, sleep,
          gameOverScreen, flashScreen, joyX, joyY, colors } = api;

  const ROWS = 10, COLS = 10, CS = 6, OX = 2, OY = 2;
  const rowY = r => OY + (ROWS - 1 - r) * CS;   // r=0 bottom .. r=9 top
  const colX = c => OX + c * CS;

  // layout: 0 start | 1-3 traffic | 4 median | 5-7 traffic | 8 median | 9 goal
  const TRAFFIC = [1, 2, 3, 5, 6, 7];
  const MEDIANS = [4, 8];
  const SAFE = new Set([0, 4, 8, 9]);
  const TRACK = 76, MARGIN = 6;                 // wrap track for even spacing

  let pr = 0, pc = 5, lives = 3, score = 0, level = 0;
  const queue = [];
  let lastJoy = 0;

  const carCols = [colors.rgb(255, 60, 60), colors.rgb(255, 160, 0),
                   colors.rgb(0, 200, 255), colors.rgb(200, 80, 255),
                   colors.rgb(255, 220, 0), colors.rgb(120, 220, 255)];
  let lanes = {}; // row -> {dir, speed, L, n, period, phase, color}

  function buildLanes() {
    lanes = {};
    TRAFFIC.forEach((r, idx) => {
      const dir = idx % 2 === 0 ? 1 : -1;
      const n = 2 + Math.floor(Math.random() * 2);        // 2-3 cars
      const L = 5 + Math.floor(Math.random() * 5);        // 5-9 px
      const speed = 0.28 + Math.random() * 0.22;          // slow-ish base
      lanes[r] = { dir, speed, L, n, period: TRACK / n,
                   phase: Math.random() * TRACK, color: carCols[idx % carCols.length] };
    });
  }
  buildLanes();

  // x positions of a lane's cars this frame (evenly spaced => guaranteed gaps)
  function carXs(ln) {
    const xs = [];
    for (let i = 0; i < ln.n; i++)
      xs.push(((i * ln.period + ln.dir * ln.phase) % TRACK + TRACK) % TRACK - MARGIN);
    return xs;
  }

  function checkpoint() { let r = 0; for (const sr of [0, 4, 8]) if (sr < pr) r = sr; return r; }

  function hop(d) {
    if (d === "up") pr = Math.min(ROWS - 1, pr + 1);
    else if (d === "down") pr = Math.max(0, pr - 1);
    else if (d === "left") pc = Math.max(0, pc - 1);
    else if (d === "right") pc = Math.min(COLS - 1, pc + 1);
    if (!SAFE.has(pr)) piezo.playSong(Effects.menuMove);
  }
  api.dpadHandler = d => queue.push(d);

  while (!api.exitRequested) {
    const now = Date.now(), jx = joyX(), jy = joyY();
    if (now - lastJoy > 150 && (Math.abs(jx) > 0.6 || Math.abs(jy) > 0.6)) {
      queue.push(Math.abs(jx) > Math.abs(jy) ? (jx > 0 ? "right" : "left")
                                             : (jy > 0 ? "down" : "up"));
      lastJoy = now;
    }
    while (queue.length) hop(queue.shift());

    const mult = 1 + level * 0.1;
    for (const r of TRAFFIC) lanes[r].phase += lanes[r].speed * mult;

    // collision only on a traffic row
    if (lanes[pr]) {
      const ln = lanes[pr], pl = colX(pc), prgt = pl + CS;
      for (const x of carXs(ln)) {
        if (x + ln.L - 0.5 > pl + 0.5 && x + 0.5 < prgt - 0.5) {
          lives--;
          piezo.playSong(Effects.damage);
          await flashScreen(colors.rgb(60, 0, 0), 1);
          if (lives <= 0) { await gameOverScreen(score); return; }
          pr = checkpoint();
          break;
        }
      }
    }

    if (pr === ROWS - 1) {
      score++; level++;
      piezo.playSong(Effects.win);
      await flashScreen(colors.rgb(0, 45, 0), 1);
      pr = 0; pc = 5;
      buildLanes();
      continue;
    }

    display.clear();
    // safe strips
    drawRect(OX, rowY(0), COLS * CS, CS - 1, colors.rgb(0, 40, 0));
    for (const m of MEDIANS) drawRect(OX, rowY(m), COLS * CS, CS - 1, colors.rgb(0, 30, 45));
    drawRect(OX, rowY(9), COLS * CS, CS - 1, colors.rgb(0, 70, 0));
    // cars
    for (const r of TRAFFIC) {
      const ln = lanes[r], y = rowY(r);
      for (const x of carXs(ln))
        drawRect(Math.round(x), y + 1, ln.L, CS - 2, ln.color);
    }
    // player
    drawRect(colX(pc) + 1, rowY(pr) + 1, CS - 2, CS - 2, colors.white);
    setPx(colX(pc) + Math.floor(CS / 2), rowY(pr) + Math.floor(CS / 2), colors.green);

    drawText(1, 1, String(score), colors.rgb(0, 120, 0));
    for (let i = 0; i < lives; i++) setPx(62 - i * 2, 1, colors.rgb(255, 60, 60));
    display.show();
    await sleep(33);
  }
}
