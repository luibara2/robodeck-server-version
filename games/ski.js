//! name=SKI color=80,180,255
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
        makeHControl,
        flashScreen,
        colors,
    } = api;

    const PLAYER_W = 5;
    const PLAYER_H = 8;
    const PLAYER_Y = 50;
    const GATE_H = 7;
    const control = makeHControl(30, 1, 63 - PLAYER_W, 2.5);

    let playerX = 30;
    let score = 0;
    let lives = 3;
    let frame = 0;
    let courseDistance = 0;
    let distanceToGate = 13;
    let lastGateCenter = 32;
    let gates = [];

    const snow = Array.from({ length: 18 }, () => ({
        x: Math.floor(Math.random() * 64),
        y: Math.floor(Math.random() * 64),
        speed: 0.25 + Math.random() * 0.45,
    }));

    // makeHControl handles the physical slider, joystick and left/right buttons.
    api.dpadHandler = () => {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function spawnGate() {
        const change = (Math.random() - 0.5) * 30;
        lastGateCenter = clamp(lastGateCenter + change, 12, 52);

        const bonus = score >= 5 && Math.random() < 0.14;
        const normalWidth = Math.max(13, 21 - score * 0.22);
        const gapWidth = bonus ? Math.max(11, normalWidth - 2) : normalWidth;

        gates.push({
            y: -GATE_H,
            center: lastGateCenter,
            gapWidth,
            bonus,
            checked: false,
            index: score + gates.length,
        });
    }

    function drawGate(gate) {
        const y = Math.round(gate.y);
        const leftEdge = gate.center - gate.gapWidth / 2;
        const rightEdge = gate.center + gate.gapWidth / 2;
        const leftX = Math.round(leftEdge) - 2;
        const rightX = Math.round(rightEdge);

        const leftColor = gate.bonus
            ? colors.yellow
            : (gate.index % 2 === 0 ? colors.red : colors.blue);
        const rightColor = gate.bonus
            ? colors.yellow
            : (gate.index % 2 === 0 ? colors.blue : colors.red);
        const markerColor = gate.checked
            ? colors.rgb(35, 35, 35)
            : colors.rgb(80, 105, 125);

        drawRect(leftX, y, 2, GATE_H, leftColor);
        drawRect(rightX, y, 2, GATE_H, rightColor);
        drawRect(leftX - 2, y, 2, 2, leftColor);
        drawRect(rightX + 2, y, 2, 2, rightColor);

        const lineY = y + GATE_H - 1;
        for (let x = Math.ceil(leftEdge); x < Math.floor(rightEdge); x += 3) {
            setPx(x, lineY, markerColor);
        }
    }

    function drawSkier() {
        const x = Math.round(playerX);
        const lean = Math.sin(frame * 0.18) * 0.35;
        const bodyX = Math.round(x + 1 + lean);

        setPx(bodyX + 1, PLAYER_Y, colors.white);
        drawRect(bodyX, PLAYER_Y + 1, 3, 4, colors.rgb(50, 190, 255));
        setPx(bodyX - 1, PLAYER_Y + 3, colors.rgb(50, 190, 255));
        setPx(bodyX + 3, PLAYER_Y + 3, colors.rgb(50, 190, 255));
        setPx(bodyX, PLAYER_Y + 5, colors.white);
        setPx(bodyX + 2, PLAYER_Y + 5, colors.white);

        drawRect(x, PLAYER_Y + 7, 2, 1, colors.yellow);
        drawRect(x + 3, PLAYER_Y + 7, 2, 1, colors.yellow);
        setPx(x - 1, PLAYER_Y + 6, colors.rgb(120, 120, 120));
        setPx(x + 5, PLAYER_Y + 6, colors.rgb(120, 120, 120));
    }

    async function loseLife() {
        lives--;
        piezo.playSong(Effects.damage);
        await flashScreen(colors.rgb(70, 0, 0), 1);

        if (lives <= 0) {
            await gameOverScreen(score);
            return true;
        }
        return false;
    }

    while (!api.exitRequested) {
        frame++;
        playerX = control.update();

        const speed = 0.72 + Math.min(0.9, score * 0.035);
        courseDistance += speed;
        distanceToGate -= speed;

        if (distanceToGate <= 0) {
            spawnGate();
            const spacing = Math.max(34, 48 - score * 0.25);
            distanceToGate = spacing + Math.random() * 10;
        }

        for (const flake of snow) {
            flake.y += flake.speed + speed * 0.13;
            if (flake.y >= 64) {
                flake.y -= 64;
                flake.x = Math.floor(Math.random() * 64);
            }
        }

        for (const gate of gates) {
            gate.y += speed;

            const gateLineY = gate.y + GATE_H - 1;
            if (!gate.checked && gateLineY >= PLAYER_Y + 3) {
                gate.checked = true;

                const leftEdge = gate.center - gate.gapWidth / 2;
                const rightEdge = gate.center + gate.gapWidth / 2;
                const safeLeft = playerX + 0.5;
                const safeRight = playerX + PLAYER_W - 0.5;

                if (safeLeft >= leftEdge && safeRight <= rightEdge) {
                    score += gate.bonus ? 2 : 1;
                    piezo.playSong(gate.bonus ? Effects.upgrade : Effects.coin);
                } else if (await loseLife()) {
                    return;
                }
            }
        }
        gates = gates.filter((gate) => gate.y < 66);

        display.clear();

        for (const flake of snow) {
            setPx(
                Math.round(flake.x),
                Math.round(flake.y),
                colors.rgb(22, 32, 42)
            );
        }

        const trackOffset = Math.floor(courseDistance) % 8;
        for (let y = -trackOffset; y < 64; y += 8) {
            setPx(29, y, colors.rgb(20, 28, 36));
            setPx(35, y + 3, colors.rgb(20, 28, 36));
        }

        for (const gate of gates) drawGate(gate);
        drawSkier();

        drawText(1, 1, String(score), colors.rgb(80, 110, 130));
        for (let i = 0; i < lives; i++) {
            setPx(62 - i * 3, 2, colors.rgb(80, 180, 255));
            setPx(61 - i * 3, 3, colors.white);
        }

        if (score === 0 && frame < 75 && Math.floor(frame / 12) % 2 === 0) {
            drawText(14, 22, "SLIDE", colors.rgb(95, 120, 140));
        }

        display.show();
        await sleep(32);
    }
}
