//! name=DASH color=0,220,255
export default async function (api) {
    const {
        setPx,
        drawText,
        drawRect,
        display,
        piezo,
        Effects,
        sleep,
        gameOverScreen,
        flashScreen,
        explode,
        colors,
    } = api;

    const PLAYER_X = 10;
    const PLAYER_SIZE = 7;
    const GROUND_Y = 55;
    const GRAVITY = 0.22;

    let playerY = GROUND_Y - PLAYER_SIZE;
    let velocityY = 0;
    let grounded = true;
    let started = false;
    let frame = 0;
    let distance = 0;
    let score = 0;
    let lastScore = 0;
    let spawnDistance = 36;
    let objects = [];

    const palettes = [
        {
            sky: colors.rgb(5, 18, 32),
            dim: colors.rgb(10, 55, 75),
            ground: colors.rgb(0, 150, 210),
            player: colors.rgb(0, 235, 255),
            accent: colors.rgb(255, 80, 210),
        },
        {
            sky: colors.rgb(25, 5, 35),
            dim: colors.rgb(70, 20, 90),
            ground: colors.rgb(180, 40, 240),
            player: colors.rgb(255, 220, 0),
            accent: colors.rgb(0, 240, 180),
        },
        {
            sky: colors.rgb(4, 28, 18),
            dim: colors.rgb(10, 75, 48),
            ground: colors.rgb(0, 210, 125),
            player: colors.rgb(255, 120, 30),
            accent: colors.rgb(100, 180, 255),
        },
    ];

    function intersects(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function jump() {
        if (!started) started = true;
        if (!grounded) return;

        velocityY = -3.15;
        grounded = false;
        piezo.playSong(Effects.jump);
    }

    api.dpadHandler = () => jump();
    api.joyClickHandler = jump;

    function addSpike(x, height = 7) {
        objects.push({
            type: "spike",
            x,
            y: GROUND_Y - height,
            w: 6,
            h: height,
            passed: false,
        });
    }

    function addBlock(x, width = 9, height = 8) {
        objects.push({
            type: "block",
            x,
            y: GROUND_Y - height,
            w: width,
            h: height,
            passed: false,
        });
    }

    function spawnPattern() {
        const difficulty = Math.min(1, score / 35);

        // Largest gap between two spikes that's still clearable in a SINGLE
        // jump at the current speed. The jump keeps the player high enough to
        // clear a spike for ~24 frames; at `speedNow` px/frame that covers
        // ~24*speedNow px of scrolling, and the two spike hitboxes together
        // span ~9px, so subtract that plus a timing margin. This guarantees a
        // double spike is never spawned wider than the jump arc can cover.
        const speedNow = 0.88 + Math.min(0.78, score * 0.018);
        const maxSpikeGap = Math.max(6, Math.min(12, Math.floor(24 * speedNow - 14)));

        const choices = score < 5 ? 4 : score < 12 ? 7 : 9;
        const pattern = Math.floor(Math.random() * choices);
        const x = 68;
        let length = 8;

        if (pattern === 0) {
            addSpike(x);
            length = 8;
        } else if (pattern === 1) {
            addSpike(x);
            addSpike(x + 6);
            length = 14;
        } else if (pattern === 2) {
            addBlock(x, 9, 8);
            length = 11;
        } else if (pattern === 3) {
            // Two spikes with a gap you clear in ONE jump. The gap widens with
            // speed but never exceeds what the jump can actually cover, so this
            // is always beatable (was a fixed 13px gap => impossible early on).
            addSpike(x);
            addSpike(x + maxSpikeGap);
            length = maxSpikeGap + 8;
        } else if (pattern === 4) {
            addBlock(x, 10, 8);
            addSpike(x + 14);
            length = 22;
        } else if (pattern === 5) {
            // Triple spike kept tight enough to clear in one jump at the speed
            // this pattern first appears (score >= 5).
            addSpike(x);
            addSpike(x + 5);
            addSpike(x + 10);
            length = 18;
        } else if (pattern === 6) {
            addBlock(x, 9, 8);
            addBlock(x + 13, 9, 12);
            length = 24;
        } else if (pattern === 7) {
            addSpike(x);
            addBlock(x + 12, 10, 8);
            addSpike(x + 26);
            length = 34;
        } else {
            addBlock(x, 8, 12);
            addSpike(x + 12);
            addSpike(x + 18);
            length = 26;
        }

        const safeGap = 24 - difficulty * 4;
        spawnDistance = length + safeGap + Math.random() * 12;
    }

    function drawSpike(object, palette) {
        const x = Math.round(object.x);
        const y = Math.round(object.y);
        const h = object.h;
        const c = palette.accent;

        for (let row = 0; row < h; row++) {
            const half = Math.floor((row * 3) / Math.max(1, h - 1));
            const center = x + 2;
            for (let px = center - half; px <= center + half + 1; px++) {
                setPx(px, y + row, c);
            }
        }
        setPx(x + 2, y + 1, colors.white);
    }

    function drawBlock(object, palette) {
        const x = Math.round(object.x);
        const y = Math.round(object.y);
        drawRect(x, y, object.w, object.h, palette.ground);
        drawRect(x + 1, y + 1, Math.max(1, object.w - 2), 1, colors.white);
        for (let px = x + 1; px < x + object.w - 1; px += 3) {
            for (let py = y + 3; py < y + object.h - 1; py += 3) {
                setPx(px, py, palette.dim);
            }
        }
    }

    function drawPlayer(palette) {
        const x = PLAYER_X;
        const y = Math.round(playerY);
        const rotation = grounded ? 0 : Math.floor((distance * 0.22) % 4);
        const c = palette.player;

        if (rotation % 2 === 0) {
            drawRect(x, y, PLAYER_SIZE, PLAYER_SIZE, c);
            drawRect(x + 1, y + 1, PLAYER_SIZE - 2, PLAYER_SIZE - 2, palette.sky);
            setPx(x + 2, y + 2, colors.white);
            setPx(x + 5, y + 2, colors.white);
            drawRect(x + 2, y + 5, 3, 1, c);
        } else {
            setPx(x + 3, y, c);
            drawRect(x + 2, y + 1, 3, 1, c);
            drawRect(x + 1, y + 2, 5, 3, c);
            drawRect(x + 2, y + 5, 3, 1, c);
            setPx(x + 3, y + 6, c);
            setPx(x + 2, y + 2, colors.white);
            setPx(x + 4, y + 2, colors.white);
            setPx(x + 3, y + 4, palette.sky);
        }

        if (!grounded) {
            setPx(x - 2, y + 5, palette.dim);
            setPx(x - 5, y + 4, palette.dim);
        }
    }

    async function crash() {
        piezo.playSong(Effects.damage);
        if (typeof explode === "function") {
            await explode(PLAYER_X + 3, Math.round(playerY) + 3);
        } else {
            await flashScreen(colors.rgb(90, 0, 20), 2);
        }
        await gameOverScreen(score);
    }

    while (!api.exitRequested) {
        frame++;
        const speed = started ? 0.88 + Math.min(0.78, score * 0.018) : 0.16;

        if (started) {
            const previousY = playerY;
            const previousBottom = previousY + PLAYER_SIZE;

            velocityY += GRAVITY;
            playerY += velocityY;
            grounded = false;

            distance += speed;
            spawnDistance -= speed;
            if (spawnDistance <= 0) spawnPattern();

            for (const object of objects) object.x -= speed;

            let landingTop = GROUND_Y;
            let landedObject = null;
            const currentBottom = playerY + PLAYER_SIZE;

            for (const object of objects) {
                if (object.type !== "block") continue;
                const horizontal = PLAYER_X + PLAYER_SIZE - 1 > object.x && PLAYER_X + 1 < object.x + object.w;
                if (!horizontal) continue;

                if (
                    velocityY >= 0 &&
                    previousBottom <= object.y + 1 &&
                    currentBottom >= object.y &&
                    object.y < landingTop
                ) {
                    landingTop = object.y;
                    landedObject = object;
                }
            }

            if (currentBottom >= landingTop) {
                playerY = landingTop - PLAYER_SIZE;
                velocityY = 0;
                grounded = true;
            }

            for (const object of objects) {
                if (object.type === "block") {
                    if (object === landedObject) continue;
                    if (intersects(
                        PLAYER_X + 1,
                        playerY + 1,
                        PLAYER_SIZE - 2,
                        PLAYER_SIZE - 1,
                        object.x,
                        object.y,
                        object.w,
                        object.h
                    )) {
                        await crash();
                        return;
                    }
                } else {
                    if (intersects(
                        PLAYER_X + 1,
                        playerY + 1,
                        PLAYER_SIZE - 2,
                        PLAYER_SIZE - 1,
                        object.x + 1,
                        object.y + 2,
                        object.w - 2,
                        object.h - 2
                    )) {
                        await crash();
                        return;
                    }
                }
            }

            for (const object of objects) {
                if (!object.passed && object.x + object.w < PLAYER_X) {
                    object.passed = true;
                    score++;
                    piezo.playSong(score % 10 === 0 ? Effects.upgrade : Effects.coin);
                }
            }
            objects = objects.filter((object) => object.x + object.w > -4);

            if (score > lastScore && score % 10 === 0) {
                lastScore = score;
                await flashScreen(colors.rgb(0, 25, 35), 1);
            }
        } else {
            playerY = GROUND_Y - PLAYER_SIZE + Math.sin(frame * 0.15) * 0.35;
        }

        const palette = palettes[Math.floor(score / 12) % palettes.length];
        const pulse = frame % 24 < 4;

        display.clear();

        const gridOffset = Math.floor(distance * 0.45) % 12;
        for (let x = -gridOffset; x < 64; x += 12) {
            for (let y = 10; y < GROUND_Y; y += 12) {
                setPx(x, y, pulse ? palette.dim : palette.sky);
            }
        }

        for (const object of objects) {
            if (object.type === "spike") drawSpike(object, palette);
            else drawBlock(object, palette);
        }

        drawRect(0, GROUND_Y, 64, 2, palette.ground);
        const groundOffset = Math.floor(distance) % 8;
        for (let x = -groundOffset; x < 64; x += 8) {
            drawRect(x, GROUND_Y + 4, 4, 2, palette.dim);
            setPx(x + 6, GROUND_Y + 8, palette.dim);
        }

        drawPlayer(palette);
        drawText(1, 1, String(score), pulse ? colors.white : palette.dim);

        if (!started) {
            if (Math.floor(frame / 12) % 2 === 0) {
                drawText(20, 18, "JUMP", palette.player);
            }
            drawText(10, 29, "PRESS", palette.dim);
            drawText(8, 36, "BUTTON", palette.dim);
        }

        display.show();
        await sleep(32);
    }
}