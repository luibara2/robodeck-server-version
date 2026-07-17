//! name=MINE2D color=80,220,90

export default async function (api) {
  const {
    setPx,
    drawText,
    drawRect,
    display,
    piezo,
    Effects,
    sleep,
    joyX,
    joyY,
    sliderPos,
    held,
    colors
  } = api;

  const TILE = 4;
  const WORLD_W = 180;
  const WORLD_H = 32;
  const VIEW_W = 16;
  const VIEW_H = 14;

  const AIR = 0;
  const GRASS = 1;
  const DIRT = 2;
  const STONE = 3;
  const WOOD = 4;
  const LEAF = 5;
  const COAL = 6;

  const world = Array.from(
    { length: WORLD_H },
    () => new Uint8Array(WORLD_W)
  );

  const surface = new Int16Array(WORLD_W);

  const inventory = [0, 0, 12, 4, 2, 0, 0];
  const hotbar = [DIRT, STONE, WOOD];

  let selected = 0;

  let playerX = 8.5;
  let playerY = 6;

  let velX = 0;
  let velY = 0;

  let facing = 1;

  let cameraX = 0;
  let cameraY = 0;

  let mineCooldown = 0;
  let placeCooldown = 0;

  let jumpPressedLastFrame = false;
  let jumpQueued = false;
  let mineQueued = false;
  let placeQueued = false;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function inWorld(x, y) {
    return (
      x >= 0 &&
      x < WORLD_W &&
      y >= 0 &&
      y < WORLD_H
    );
  }

  function blockAt(x, y) {
    if (!inWorld(x, y)) {
      return STONE;
    }

    return world[y][x];
  }

  function solidAt(x, y) {
    const block = blockAt(x, y);

    return block !== AIR && block !== LEAF;
  }

  function setBlock(x, y, block) {
    if (inWorld(x, y)) {
      world[y][x] = block;
    }
  }

  function terrainNoise(x) {
    return (
      Math.sin(x * 0.18) * 1.7 +
      Math.sin(x * 0.047) * 2.4 +
      Math.sin(x * 0.61) * 0.45
    );
  }

  function generateWorld() {
    for (let x = 0; x < WORLD_W; x++) {
      const ground = clamp(
        Math.floor(15 + terrainNoise(x)),
        10,
        20
      );

      surface[x] = ground;

      for (let y = ground; y < WORLD_H; y++) {
        if (y === ground) {
          world[y][x] = GRASS;
        } else if (y < ground + 4) {
          world[y][x] = DIRT;
        } else {
          world[y][x] =
            Math.random() < 0.075
              ? COAL
              : STONE;
        }
      }
    }

    // Generate caves.
    for (let cave = 0; cave < 22; cave++) {
      let caveX =
        8 +
        Math.floor(
          Math.random() * (WORLD_W - 16)
        );

      let caveY =
        18 +
        Math.floor(Math.random() * 10);

      const length =
        5 +
        Math.floor(Math.random() * 13);

      for (let step = 0; step < length; step++) {
        const radius =
          Math.random() < 0.35
            ? 2
            : 1;

        for (
          let offsetY = -radius;
          offsetY <= radius;
          offsetY++
        ) {
          for (
            let offsetX = -radius;
            offsetX <= radius;
            offsetX++
          ) {
            if (
              offsetX * offsetX +
                offsetY * offsetY <=
              radius * radius + 1
            ) {
              setBlock(
                caveX + offsetX,
                caveY + offsetY,
                AIR
              );
            }
          }
        }

        caveX +=
          Math.floor(Math.random() * 3) - 1;

        caveY +=
          Math.floor(Math.random() * 3) - 1;

        caveY = clamp(caveY, 17, 29);
      }
    }

    // Generate trees.
    let lastTree = -20;

    for (let x = 5; x < WORLD_W - 5; x++) {
      if (
        x - lastTree > 8 &&
        Math.random() < 0.085
      ) {
        const groundY = surface[x];
        const height =
          3 +
          Math.floor(Math.random() * 2);

        for (
          let trunkY = 1;
          trunkY <= height;
          trunkY++
        ) {
          setBlock(
            x,
            groundY - trunkY,
            WOOD
          );
        }

        const topY = groundY - height;

        for (
          let leafY = -2;
          leafY <= 1;
          leafY++
        ) {
          for (
            let leafX = -2;
            leafX <= 2;
            leafX++
          ) {
            if (
              Math.abs(leafX) +
                Math.abs(leafY) <
                4 &&
              blockAt(
                x + leafX,
                topY + leafY
              ) === AIR
            ) {
              setBlock(
                x + leafX,
                topY + leafY,
                LEAF
              );
            }
          }
        }

        lastTree = x;
      }
    }

    // Clear space around spawn.
    const spawnGround = surface[8];

    for (
      let y = spawnGround - 6;
      y < spawnGround;
      y++
    ) {
      setBlock(7, y, AIR);
      setBlock(8, y, AIR);
      setBlock(9, y, AIR);
    }

    playerX = 8.5;
    playerY = spawnGround - 0.1;

    cameraX = clamp(
      playerX - 7.5,
      0,
      WORLD_W - VIEW_W
    );

    cameraY = clamp(
      playerY - 8,
      0,
      WORLD_H - VIEW_H
    );
  }

  function playerCollides(px, py) {
    const left = px - 0.3;
    const right = px + 0.3;

    const top = py - 1.7;
    const bottom = py - 0.04;

    const startX = Math.floor(left);
    const endX = Math.floor(right);

    const startY = Math.floor(top);
    const endY = Math.floor(bottom);

    for (
      let y = startY;
      y <= endY;
      y++
    ) {
      for (
        let x = startX;
        x <= endX;
        x++
      ) {
        if (solidAt(x, y)) {
          return true;
        }
      }
    }

    return false;
  }

  function grounded() {
    return playerCollides(
      playerX,
      playerY + 0.08
    );
  }

  function movePlayer(dx, dy) {
    const steps = Math.max(
      1,
      Math.ceil(
        Math.max(
          Math.abs(dx),
          Math.abs(dy)
        ) / 0.1
      )
    );

    const stepX = dx / steps;
    const stepY = dy / steps;

    for (
      let step = 0;
      step < steps;
      step++
    ) {
      if (
        !playerCollides(
          playerX + stepX,
          playerY
        )
      ) {
        playerX += stepX;
      } else {
        velX = 0;
      }

      if (
        !playerCollides(
          playerX,
          playerY + stepY
        )
      ) {
        playerY += stepY;
      } else {
        velY = 0;
      }
    }

    playerX = clamp(
      playerX,
      1,
      WORLD_W - 2
    );
  }

  function targetBlock() {
    const verticalInput = joyY();

    // Straight down: mine/place the block DIRECTLY beneath the player and
    // ignore facing. Previously every target was shifted sideways by
    // `facing * 0.95`, so the block under your feet was unreachable -- aiming
    // down only gave you the diagonal block in front. Math.round(playerY)
    // lands on the block the player is standing on across the whole resting
    // range, and follows you straight down as you dig.
    if (verticalInput > 0.55) {
      return {
        x: Math.floor(playerX),
        y: Math.round(playerY)
      };
    }

    // Straight up: the block directly above the player's head.
    if (verticalInput < -0.55) {
      return {
        x: Math.floor(playerX),
        y: Math.round(playerY) - 3
      };
    }

    // Neutral: the block in front, at body height, in the facing direction.
    const targetX = Math.floor(
      playerX + facing * 0.95
    );

    const targetY = Math.floor(
      playerY - 0.85
    );

    return {
      x: targetX,
      y: targetY
    };
  }

  function mineBlock() {
    if (mineCooldown > 0) {
      return;
    }

    mineCooldown = 7;

    const target = targetBlock();
    const block = blockAt(
      target.x,
      target.y
    );

    if (block === AIR) {
      return;
    }

    setBlock(
      target.x,
      target.y,
      AIR
    );

    if (block === GRASS) {
      inventory[DIRT]++;
    } else if (block === LEAF) {
      if (Math.random() < 0.35) {
        inventory[WOOD]++;
      }
    } else {
      inventory[block]++;
    }

    piezo.playSong(Effects.coin);
  }

  function placeBlock() {
    if (placeCooldown > 0) {
      return;
    }

    placeCooldown = 7;

    const target = targetBlock();
    const block = hotbar[selected];

    if (
      blockAt(target.x, target.y) !== AIR
    ) {
      return;
    }

    if (inventory[block] <= 0) {
      return;
    }

    setBlock(
      target.x,
      target.y,
      block
    );

    // Prevent placing a block inside the player.
    if (
      playerCollides(
        playerX,
        playerY
      )
    ) {
      setBlock(
        target.x,
        target.y,
        AIR
      );

      return;
    }

    inventory[block]--;

    piezo.playSong(Effects.jump);
  }

  function blockColor(block) {
    if (block === GRASS) {
      return colors.rgb(55, 210, 65);
    }

    if (block === DIRT) {
      return colors.rgb(125, 78, 38);
    }

    if (block === STONE) {
      return colors.rgb(105, 110, 120);
    }

    if (block === WOOD) {
      return colors.rgb(145, 88, 38);
    }

    if (block === LEAF) {
      return colors.rgb(25, 145, 50);
    }

    if (block === COAL) {
      return colors.rgb(45, 48, 55);
    }

    return colors.black;
  }

  function drawBlock(
    screenX,
    screenY,
    block,
    worldX,
    worldY
  ) {
    const color = blockColor(block);

    drawRect(
      screenX,
      screenY,
      TILE,
      TILE,
      color
    );

    if (block === GRASS) {
      drawRect(
        screenX,
        screenY,
        TILE,
        1,
        colors.rgb(100, 245, 80)
      );
    } else if (
      block === DIRT &&
      ((worldX + worldY) & 1)
    ) {
      setPx(
        screenX + 1,
        screenY + 2,
        colors.rgb(85, 50, 28)
      );
    } else if (block === STONE) {
      setPx(
        screenX +
          (((worldX + worldY) & 2)
            ? 1
            : 2),
        screenY + 1,
        colors.rgb(145, 145, 150)
      );
    } else if (block === WOOD) {
      drawRect(
        screenX + 1,
        screenY,
        1,
        TILE,
        colors.rgb(95, 55, 25)
      );
    } else if (
      block === LEAF &&
      ((worldX * 3 + worldY) & 1)
    ) {
      setPx(
        screenX + 2,
        screenY + 1,
        colors.rgb(80, 210, 75)
      );
    } else if (block === COAL) {
      setPx(
        screenX + 1,
        screenY + 1,
        colors.black
      );

      setPx(
        screenX + 2,
        screenY + 2,
        colors.black
      );
    }
  }

  function drawPlayer() {
    const screenX = Math.round(
      (playerX - cameraX) * TILE
    );

    const screenY = Math.round(
      (playerY - cameraY) * TILE
    );

    const skin =
      colors.rgb(235, 175, 120);

    const shirt =
      colors.rgb(40, 145, 220);

    const pants =
      colors.rgb(45, 55, 145);

    // Head
    drawRect(
      screenX - 1,
      screenY - 7,
      3,
      3,
      skin
    );

    // Body
    drawRect(
      screenX - 1,
      screenY - 4,
      3,
      3,
      shirt
    );

    // Legs
    setPx(
      screenX - 1,
      screenY - 1,
      pants
    );

    setPx(
      screenX + 1,
      screenY - 1,
      pants
    );

    // Eye
    setPx(
      screenX +
        (facing > 0 ? 1 : -1),
      screenY - 6,
      colors.black
    );
  }

  function drawTarget() {
    const target = targetBlock();

    const screenX = Math.round(
      (target.x - cameraX) * TILE
    );

    const screenY = Math.round(
      (target.y - cameraY) * TILE
    );

    if (
      screenX < 0 ||
      screenX > 60 ||
      screenY < 0 ||
      screenY > 51
    ) {
      return;
    }

    setPx(
      screenX,
      screenY,
      colors.white
    );

    setPx(
      screenX + 3,
      screenY,
      colors.white
    );

    setPx(
      screenX,
      screenY + 3,
      colors.white
    );

    setPx(
      screenX + 3,
      screenY + 3,
      colors.white
    );
  }

  function drawHotbar() {
    // Hotbar is above the bottom edge.
    drawRect(
      12,
      45,
      40,
      9,
      colors.rgb(18, 18, 22)
    );

    for (
      let slot = 0;
      slot < 3;
      slot++
    ) {
      const x = 15 + slot * 12;
      const block = hotbar[slot];

      if (slot === selected) {
        drawRect(
          x - 2,
          46,
          10,
          8,
          colors.white
        );

        drawRect(
          x - 1,
          47,
          8,
          6,
          colors.rgb(35, 35, 40)
        );
      }

      drawBlock(
        x,
        48,
        block,
        0,
        0
      );

      drawText(
        x + 5,
        47,
        String(
          Math.min(
            9,
            inventory[block]
          )
        ),
        colors.white
      );
    }
  }

  api.dpadHandler = (direction) => {
    if (direction === "up") {
      jumpQueued = true;
    } else if (direction === "down") {
      mineQueued = true;
    }
  };

  api.joyClickHandler = () => {
    placeQueued = true;
  };

  generateWorld();

  while (!api.exitRequested) {
    if (mineCooldown > 0) {
      mineCooldown--;
    }

    if (placeCooldown > 0) {
      placeCooldown--;
    }

    let horizontalInput = joyX();

    if (held.left) {
      horizontalInput = -1;
    }

    if (held.right) {
      horizontalInput = 1;
    }

    if (
      Math.abs(horizontalInput) < 0.18
    ) {
      horizontalInput = 0;
    }

    if (horizontalInput !== 0) {
      facing =
        horizontalInput > 0
          ? 1
          : -1;
    }

    velX += horizontalInput * 0.035;

    velX *=
      horizontalInput === 0
        ? 0.72
        : 0.88;

    velX = clamp(
      velX,
      -0.16,
      0.16
    );

    const jumpPressed =
      !!held.up ||
      joyY() < -0.72;

    const newJumpPress =
      jumpPressed &&
      !jumpPressedLastFrame;

    if (
      (jumpQueued || newJumpPress) &&
      grounded()
    ) {
      velY = -0.34;
      piezo.playSong(Effects.jump);
    }

    jumpQueued = false;
    jumpPressedLastFrame =
      jumpPressed;

    if (held.down) {
      mineQueued = true;
    }

    if (mineQueued) {
      mineQueued = false;
      mineBlock();
    }

    if (placeQueued) {
      placeQueued = false;
      placeBlock();
    }

    const slider = sliderPos();

    if (slider >= 0) {
      selected = clamp(
        Math.floor(slider * 3),
        0,
        2
      );
    }

    velY += 0.025;
    velY = Math.min(velY, 0.42);

    movePlayer(velX, velY);

    if (
      playerY > WORLD_H - 1
    ) {
      playerX = 8.5;
      playerY = surface[8] - 0.1;

      velX = 0;
      velY = 0;

      piezo.playSong(
        Effects.damage
      );
    }

    const desiredCameraX =
      playerX - 7.5;

    cameraX +=
      (desiredCameraX - cameraX) *
      0.22;

    cameraX = clamp(
      cameraX,
      0,
      WORLD_W - VIEW_W
    );

    const desiredCameraY =
      playerY - 8;

    cameraY +=
      (desiredCameraY - cameraY) *
      0.22;

    cameraY = clamp(
      cameraY,
      0,
      WORLD_H - VIEW_H
    );

    display.clear();

    // Sky background.
    drawRect(
      0,
      0,
      64,
      64,
      colors.rgb(70, 165, 235)
    );

    const startX =
      Math.floor(cameraX);

    const startY =
      Math.floor(cameraY);

    const offsetX = Math.floor(
      (startX - cameraX) * TILE
    );

    const offsetY = Math.floor(
      (startY - cameraY) * TILE
    );

    for (
      let screenTileY = 0;
      screenTileY < VIEW_H + 1;
      screenTileY++
    ) {
      for (
        let screenTileX = 0;
        screenTileX <= VIEW_W;
        screenTileX++
      ) {
        const worldX =
          startX + screenTileX;

        const worldY =
          startY + screenTileY;

        const block = blockAt(
          worldX,
          worldY
        );

        if (block !== AIR) {
          drawBlock(
            offsetX +
              screenTileX * TILE,
            offsetY +
              screenTileY * TILE,
            block,
            worldX,
            worldY
          );
        }
      }
    }

    drawTarget();
    drawPlayer();
    drawHotbar();

    display.show();

    await sleep(30);
  }
}