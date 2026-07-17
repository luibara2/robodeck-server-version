//! name=BEAT color=255,0,180
// BEAT - notes fall in 4 lanes. Hit the matching d-pad direction as each note
// crosses the line (LEFT/UP/DOWN/RIGHT = lanes 1-4). Combo builds your score;
// notes you miss cost a life. Speeds up as you go. 4 lives.
export default async function (api) {
  const { setPx, drawText, drawRect, display, piezo, Effects, sleep,
          gameOverScreen, flashScreen, colors } = api;

  const LANES = 4, LW = 16, HITY = 54, WIN = 6, PERFECT = 3;
  const dirLane = { left: 0, up: 1, down: 2, right: 3 };
  const laneCol = [colors.rgb(255, 60, 60), colors.rgb(255, 200, 0),
                   colors.rgb(0, 220, 120), colors.rgb(0, 160, 255)];
  const laneTone = [262, 330, 392, 523]; // C E G C'

  let notes = [], score = 0, combo = 0, best = 0, lives = 4;
  let speed = 0.9, spawnEvery = 620, spawnAt = 0, tick = 0;
  const flash = [0, 0, 0, 0];

  function spawn() {
    // avoid stacking a note right at the top of a lane
    const busy = new Set(notes.filter(n => n.y < 8).map(n => n.lane));
    const free = [0, 1, 2, 3].filter(l => !busy.has(l));
    const lane = (free.length ? free : [0, 1, 2, 3])[Math.floor(Math.random() * (free.length || 4))];
    notes.push({ lane, y: -4 });
  }

  api.dpadHandler = d => {
    if (!(d in dirLane)) return;
    const lane = dirLane[d];
    let bi = -1, bd = 1e9;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].lane !== lane) continue;
      const dist = Math.abs(notes[i].y - HITY);
      if (dist < bd) { bd = dist; bi = i; }
    }
    if (bi >= 0 && bd <= WIN) {
      notes.splice(bi, 1);
      combo++; best = Math.max(best, combo);
      score += bd <= PERFECT ? 2 : 1;
      flash[lane] = 4;
      piezo.playNote([laneTone[lane], 90]);
    } else {
      flash[lane] = 2; // whiff feedback, no penalty
    }
  };

  const start = Date.now();
  while (!api.exitRequested) {
    tick++;
    const now = Date.now();
    if (now - spawnAt >= spawnEvery) { spawn(); spawnAt = now; }

    for (const n of notes) n.y += speed;
    // misses
    const survivors = [];
    for (const n of notes) {
      if (n.y > HITY + WIN + 1) {
        lives--; combo = 0;
        piezo.playSong(Effects.damage);
        if (lives <= 0) { await flashScreen(colors.rgb(60, 0, 0), 1); await gameOverScreen(score); return; }
      } else survivors.push(n);
    }
    notes = survivors;

    // difficulty ramp
    const secs = (now - start) / 1000;
    speed = 0.9 + secs * 0.02;
    spawnEvery = Math.max(300, 620 - secs * 6);

    display.clear();
    // lane guides + keys
    for (let l = 0; l < LANES; l++) {
      const x = l * LW;
      for (let y = 2; y < HITY; y += 6) setPx(x + LW / 2, y, colors.rgb(30, 30, 40));
      const kc = flash[l] > 0 ? colors.white : laneCol[l];
      drawRect(x + 2, 60, LW - 4, 3, kc);
      if (flash[l] > 0) flash[l]--;
    }
    // hit line
    for (let x = 0; x < 64; x++) setPx(x, HITY, colors.rgb(120, 120, 120));
    // notes
    for (const n of notes) {
      const x = n.lane * LW, near = Math.abs(n.y - HITY) <= WIN;
      drawRect(x + 1, Math.round(n.y), LW - 2, 4, near ? colors.white : laneCol[n.lane]);
    }
    drawText(1, 1, String(score), colors.rgb(120, 0, 90));
    if (combo > 1) drawText(44, 1, "X" + combo, colors.rgb(255, 200, 0));
    for (let i = 0; i < lives; i++) setPx(30 + i * 2, 1, colors.rgb(255, 60, 120));
    display.show();
    await sleep(28);
  }
}
