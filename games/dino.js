//! name=DINO color=80,255,100
export default async function(api) {
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
        joyY,
        held,
        colors,
    } = api;

    const GROUND_Y = 55;
    const PLAYER_X = 8;
    const PLAYER_W = 8;
    const PLAYER_H = 10;
    const GRAVITY = 0.17;
    const JUMP_SPEED = -2.65;

    let playerY = GROUND_Y - PLAYER_H;
    let velocityY = 0;
    let started = false;
    let score = 0;
    let frame = 0;
    let distance = 0;
    let spawnDistance = 48;
    let obstacles = [];
    let stars = [];
    let clouds = [
        { x: 12, y: 12, speed: 0.08 },
        { x: 45, y: 22, speed: 0.05 },
    ];
    let joyArmed = true;
    let previousUp = !!(held && held.up);

    const grounded = () => playerY >= GROUND_Y - PLAYER_H - 0.01;

    function jump() {
        if (!started) started = true;
        if (!grounded()) return;
        velocityY = JUMP_SPEED;
        piezo.playSong(Effects.jump);
    }

    api.dpadHandler = (direction) => {
        if (direction === "up" || direction === "right") jump();
    };
    api.joyClickHandler = jump;

    function spawnObstacle() {
        const difficulty = Math.min(1, score / 35);
        const doubleObstacle = score >= 8 && Math.random() < 0.22 + difficulty * 0.12;
        const height = 7 + Math.floor(Math.random() * 7);
        const width = 3 + Math.floor(Math.random() * 3);
        obstacles.push({
            x: 67,
            y: GROUND_Y - height,
            w: width,
            h: height,
            passed: false,
        });

        if (doubleObstacle) {
            const secondHeight = 6 + Math.floor(Math.random() * 5);
            obstacles.push({
                x: 67 + width + 4,
                y: GROUND_Y - secondHeight,
                w: 3,
                h: secondHeight,
                passed: false,
            });
        }

        if (Math.random() < 0.20) {
            stars.push({
                x: 68 + (doubleObstacle ? width + 7 : 0),
                y: 28 + Math.floor(Math.random() * 10),
                taken: false,
            });
        }
    }

    function intersects(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function drawCloud(cloud) {
        const x = Math.round(cloud.x);
        const y = Math.round(cloud.y);
        const color = colors.rgb(28, 34, 42);
        drawRect(x, y + 1, 8, 2, color);
        drawRect(x + 2, y, 4, 1, color);
    }

    function drawDino() {
        const y = Math.round(playerY);
        const body = started ? colors.rgb(80, 255, 100) : colors.rgb(35, 110, 50);
        const bright = started ? colors.white : colors.rgb(90, 110, 90);

        drawRect(PLAYER_X + 1, y + 3, 5, 5, body);
        drawRect(PLAYER_X + 4, y, 4, 5, body);
        drawRect(PLAYER_X, y + 5, 2, 2, body);
        setPx(PLAYER_X + 6, y + 1, bright);
        setPx(PLAYER_X + 7, y + 4, body);

        if (grounded() && started) {
            if (Math.floor(frame / 3) % 2 === 0) {
                drawRect(PLAYER_X + 2, y + 8, 2, 2, body);
                drawRect(PLAYER_X + 5, y + 8, 1, 1, body);
            } else {
                drawRect(PLAYER_X + 2, y + 8, 1, 1, body);
                drawRect(PLAYER_X + 5, y + 8, 2, 2, body);
            }
        } else {
            drawRect(PLAYER_X + 2, y + 8, 1, 2, body);
            drawRect(PLAYER_X + 5, y + 8, 1, 2, body);
        }
    }

    function drawCactus(obstacle) {
        const x = Math.round(obstacle.x);
        const c = colors.rgb(0, 195, 70);
        drawRect(x, obstacle.y, obstacle.w, obstacle.h, c);
        if (obstacle.h >= 9) {
            drawRect(x - 2, obstacle.y + 4, 2, 2, c);
            setPx(x - 2, obstacle.y + 3, c);
        }
        if (obstacle.w >= 4) {
            drawRect(x + obstacle.w, obstacle.y + 6, 2, 2, c);
            setPx(x + obstacle.w + 1, obstacle.y + 5, c);
        }
    }

    function drawStar(star) {
        const x = Math.round(star.x);
        const y = Math.round(star.y);
        setPx(x, y - 1, colors.yellow);
        setPx(x - 1, y, colors.yellow);
        setPx(x, y, colors.white);
        setPx(x + 1, y, colors.yellow);
        setPx(x, y + 1, colors.yellow);
    }

    while (!api.exitRequested) {
        frame++;

        const upNow = !!(held && held.up);
        if (upNow && !previousUp) jump();
        previousUp = upNow;

        const jy = joyY();
        if (jy < -0.65) {
            if (joyArmed) jump();
            joyArmed = false;
        } else if (jy > -0.25) {
            joyArmed = true;
        }

        const speed = started ? 0.85 + Math.min(1.35, score * 0.035) : 0.22;

        if (started) {
            velocityY += GRAVITY;
            playerY += velocityY;
            if (playerY >= GROUND_Y - PLAYER_H) {
                playerY = GROUND_Y - PLAYER_H;
                velocityY = 0;
            }

            distance += speed;
            spawnDistance -= speed;
            if (spawnDistance <= 0) {
                spawnObstacle();
                const minimumGap = Math.max(31, 52 - score * 0.45);
                spawnDistance = minimumGap + Math.random() * 24;
            }
        } else {
            playerY = GROUND_Y - PLAYER_H + Math.sin(frame * 0.12) * 0.5;
        }

        for (const obstacle of obstacles) {
            obstacle.x -= speed;
            if (!obstacle.passed && obstacle.x + obstacle.w < PLAYER_X) {
                obstacle.passed = true;
                score++;
                piezo.playSong(Effects.coin);
            }
        }
        obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -3);

        for (const star of stars) {
            star.x -= speed;
            if (!star.taken && intersects(
                PLAYER_X + 1,
                playerY + 1,
                PLAYER_W - 2,
                PLAYER_H - 1,
                star.x - 2,
                star.y - 2,
                5,
                5
            )) {
                star.taken = true;
                score += 3;
                piezo.playSong(Effects.upgrade);
            }
        }
        stars = stars.filter((star) => !star.taken && star.x > -4);

        for (const cloud of clouds) {
            cloud.x -= cloud.speed + speed * 0.035;
            if (cloud.x < -10) {
                cloud.x = 66 + Math.random() * 20;
                cloud.y = 8 + Math.random() * 22;
            }
        }

        const hit = obstacles.some((obstacle) => intersects(
            PLAYER_X + 1,
            playerY + 1,
            PLAYER_W - 2,
            PLAYER_H - 1,
            obstacle.x,
            obstacle.y,
            obstacle.w,
            obstacle.h
        ));

        if (hit) {
            piezo.playSong(Effects.damage);
            await flashScreen(colors.rgb(80, 0, 0), 2);
            await gameOverScreen(score);
            return;
        }

        display.clear();
        for (const cloud of clouds) drawCloud(cloud);

        const groundOffset = Math.floor(distance) % 8;
        drawRect(0, GROUND_Y, 64, 1, colors.rgb(80, 80, 80));
        for (let x = -groundOffset; x < 64; x += 8) {
            drawRect(x, GROUND_Y + 3, 4, 1, colors.rgb(35, 35, 35));
            setPx(x + 6, GROUND_Y + 6, colors.rgb(24, 24, 24));
        }

        for (const star of stars) drawStar(star);
        for (const obstacle of obstacles) drawCactus(obstacle);
        drawDino();

        drawText(1, 1, String(score), colors.rgb(75, 75, 75));
        if (!started && Math.floor(frame / 16) % 2 === 0) {
            drawText(19, 20, "UP", colors.rgb(120, 120, 120));
        }

        display.show();
        await sleep(32);
    }
}
