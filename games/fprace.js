//! name=DRIVE color=255,80,0

async function tmp_default(api) {
  const {
    setPx, drawText, drawRect, display, piezo, Effects,
    sleep, gameOverScreen, explode, mpu, colors, held, joyX
  } = api;

  if (!mpu) {
    display.clear();
    drawText(7, 24, "NO GYRO", colors.red);
    display.show();
    piezo.playSong(Effects.error);
    await sleep(1500);
    return;
  }

  api.dpadHandler = () => {};

  let player = 0;
  let curve = 0;
  let roadShift = 0;
  let speed = 0.85;
  let tick = 0;
  let score = 0;
  let crash = false;

  let cars = [];
  let spawn = 45;
  let lastLane = 1;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function roadHalf(y) {
    return 12 + (y - 20) * 0.56;
  }

  function roadCenter(y) {
    const p = (y - 20) / 44;
    return 32 + roadShift * p + curve * p * p * 13;
  }

  function playerScreenX() {
    return Math.floor(32 + player * 22);
  }

  function drawCar(cx, y, col) {
    drawRect(cx - 5, y - 4, 11, 8, col);
    drawRect(cx - 3, y - 7, 7, 4, col);
    setPx(cx - 3, y + 3, colors.white);
    setPx(cx + 3, y + 3, colors.white);
    setPx(cx - 2, y - 6, colors.rgb(140, 220, 255));
    setPx(cx + 2, y - 6, colors.rgb(140, 220, 255));
  }

  function drawTrafficCar(cx, y, scale, col) {
    const w = Math.max(2, Math.floor(3 * scale));
    const h = Math.max(3, Math.floor(5 * scale));
    drawRect(cx - w, y - h, w * 2 + 1, h * 2, col);
    setPx(cx - w, y + h - 1, colors.white);
    setPx(cx + w, y + h - 1, colors.white);
  }

  while (!api.exitRequested) {
    tick++;
    score = Math.floor(tick / 4);
    speed = Math.min(2.5, speed + 0.002);

    const acc = mpu.getAcceleration();
    let steer = -acc[1] * 4.2;

    const jx = joyX();
    if (jx !== 0) steer = jx * 3.0;
    if (held.left) steer = -3.0;
    if (held.right) steer = 3.0;

    steer = clamp(steer, -3.0, 3.0);
    player = clamp(player + steer * 0.032, -1.0, 1.0);

    curve = Math.sin(tick * 0.035) * 0.75 + Math.sin(tick * 0.012) * 0.35;
    roadShift += curve * 0.010;
    roadShift *= 0.94;

    spawn--;
    if (spawn <= 0) {
      spawn = Math.max(26, 58 - Math.floor(tick / 85));
      lastLane = -lastLane;

      cars.push({
        z: 1.08,
        lane: lastLane * 0.54
      });

      if (tick > 250 && Math.random() < 0.18) {
        cars.push({
          z: 1.35,
          lane: -lastLane * 0.54
        });
      }
    }

    for (const c of cars) {
      c.z -= 0.014 * speed;

      if (c.z < 0.20 && c.z > 0.045 && Math.abs(c.lane - player) < 0.36) {
        crash = true;
      }
    }

    cars = cars.filter(c => c.z > 0.03);

    if (crash) {
      piezo.playSong(Effects.damage);
      await explode(playerScreenX(), 56);
      await gameOverScreen(score);
      return;
    }

    display.clear();
    drawRect(0, 0, 64, 20, colors.rgb(5, 12, 25));
    for (let i = 0; i < 18; i += 5) {
      setPx((tick + i * 7) % 64, i + 2, colors.rgb(120, 120, 160));
    }

    drawRect(0, 20, 64, 44, colors.rgb(5, 60, 20));

    for (let y = 20; y < 64; y++) {
      const c = roadCenter(y);
      const h = roadHalf(y);
      const l = Math.floor(c - h);
      const r = Math.floor(c + h);
      const shade = 35 + Math.floor((y - 20) * 2.1);

      for (let x = l; x <= r; x++) {
        if (x >= 0 && x < 64) setPx(x, y, colors.rgb(shade, shade, shade));
      }

      if (l >= 0 && l < 64) setPx(l, y, colors.white);
      if (r >= 0 && r < 64) setPx(r, y, colors.white);

      if (((y + tick * 2) % 14) < 6) {
        const mx = Math.round(c);
        setPx(mx, y, colors.rgb(255, 220, 0));
        if (y > 46) {
          setPx(mx - 1, y, colors.rgb(255, 220, 0));
          setPx(mx + 1, y, colors.rgb(255, 220, 0));
        }
      }

      if (y > 30 && ((y + tick * 3) % 18) < 8) {
        const lx = Math.round(c - h * 0.50);
        const rx = Math.round(c + h * 0.50);
        setPx(lx, y, colors.rgb(230, 230, 230));
        setPx(rx, y, colors.rgb(230, 230, 230));
      }
    }

    for (const c of cars) {
      const y = Math.floor(20 + (1 - c.z) * 42);
      const cx = Math.floor(roadCenter(y) + c.lane * roadHalf(y));
      drawTrafficCar(cx, y, 1.0 + (1 - c.z) * 2.8, colors.rgb(0, 140, 255));
    }

    drawCar(playerScreenX(), 57, colors.red);
    drawText(1, 1, String(score), colors.rgb(160, 160, 160));

    const wheel = Math.floor(32 + steer * 9);
    drawRect(wheel - 6, 10, 12, 2, colors.rgb(130, 90, 40));
    drawRect(wheel, 7, 1, 8, colors.rgb(130, 90, 40));

    display.show();
    await sleep(35);
  }
}

export { tmp_default as default };
