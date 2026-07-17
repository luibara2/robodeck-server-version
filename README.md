# Robodeck — Streaming Game Console

A handheld game console built on the **Saturn (ESP32-S3)** board running the
[**Jaculus**](https://jaculus.org) JavaScript runtime. The deck itself holds no
games — it boots, joins WiFi, and **streams games on demand over UDP** from a
small zero-dependency Node.js server. The same server also keeps a shared
**leaderboard** and an **image gallery** you can push to the deck.

Built for the [Robotický tábor 2026](https://2026.robotickytabor.cz) Robodeck platform.


> **Other versions:** This is the networked build. For a fully offline build (no server, no WiFi, 18 games bundled on the device), see [robodeck-ai-slop](https://github.com/luibara2/robodeck-ai-slop).

```
┌──────────────────────┐        WiFi / UDP :8788        ┌───────────────────────┐
│   Saturn / Robodeck   │  ◄───────────────────────────►  │   Node.js server.js    │
│   deck-firmware.ts    │   games · scores · time · pics  │   games/  scores.json  │
│   (Jaculus runtime)   │                                 │   gallery · leaderboard│
└──────────────────────┘                                 └───────────────────────┘
```

The deck sends small JSON requests (game list, game code in chunks, leaderboard,
time sync, score submit); the server answers. Every request carries a shared
**token** that must match on both sides.

---

## Repository contents

| File / folder        | What it is                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| `deck-firmware.ts`   | The firmware that runs on the Saturn. Becomes `src/index.ts` in a Jaculus project. |
| `server.js`          | The Node.js server (game store + leaderboard + gallery + time). Zero dependencies. |
| `games/`             | The game library. One `.js` file per game, streamed to the deck.        |
| `game-order.json`    | Menu order, display names, tile colors, and disabled games.             |
| `gallery-admin.html` | Web page for uploading images to the gallery (served at `/gallery`).    |

---

## Prerequisites

- **[Node.js](https://nodejs.org) 22 LTS or newer** (v16+ works for the server, but 22 LTS is recommended for the tools).
- **Jaculus CLI tools:**
  ```bash
  npm install -g jaculus-tools@latest
  ```
  Test it with `npx jac` — it should print the help.
- A **Chromium-based browser** (Chrome, Edge, Vivaldi) or recent Firefox for the web firmware installer (needs WebSerial).
- **USB-to-UART driver** for the Saturn — usually [CP210x](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers) or CH340.
  - On Linux, if CH340 isn't detected, uninstall the `brltty` package, and add the [udev rules](https://docs.espressif.com/projects/esp-idf/en/v5.2.2/esp32s2/api-guides/dfu.html#udev-rule-linux-only).

---

# Part 1 — Server setup

The server has **no npm dependencies** — it uses only Node's built-in modules.

### 1. Put the files together

Keep this layout (the server expects these paths relative to `server.js`):

```
server.js
game-order.json
gallery-admin.html
games/
  snake.js
  tetris.js
  ...
```

### 2. Configure via environment variables

Everything is set through env vars — there is no config file to edit.

| Variable              | Default            | Meaning                                                        |
| --------------------- | ------------------ | -------------------------------------------------------------- |
| `PORT`                | `8788`             | Port for **both** the UDP (deck) and HTTP (web) servers.       |
| `TOKEN`               | `CHANGE-ME-PLEASE` | **Shared secret.** Must match the deck's `network.token`.      |
| `TZ_MIN`              | `120`              | Timezone offset in minutes for the deck clock (120 = UTC+2).   |
| `GALLERY_BUNDLE_CHARS`| `1200`             | UDP chunk size for gallery streaming. Raise (e.g. 6000) on reliable networks. |

> ⚠️ **Always set your own `TOKEN`.** If left as the default the server prints a
> warning, and anyone on the network could talk to it.

### 3. Run it

```bash
# Linux / macOS
TOKEN="my-secret-token" PORT=8788 node server.js

# Windows (PowerShell)
$env:TOKEN="my-secret-token"; $env:PORT="8788"; node server.js
```

On start you should see:

```
UDP listening on 8788 (deck protocol)
HTTP leaderboard + gallery on 8788
Games dir: .../games
Game config: .../game-order.json
```

### 4. Find the server's IP address

The deck connects to the server by IP, so you need it for the firmware config.

```bash
# Linux / macOS
ip addr        # or: hostname -I
# Windows
ipconfig
```

Use the address on the **same network the deck will join** (e.g. `192.168.1.50`).

### 5. Web pages (open in a browser)

- `http://YOUR-SERVER-IP:8788/` — live leaderboard (auto-refreshes every 15s).
- `http://YOUR-SERVER-IP:8788/gallery` — upload/manage gallery images.
- `http://YOUR-SERVER-IP:8788/health` — returns `ok` (handy for uptime checks).

The server writes `scores.json` and `gallery.json` next to `server.js` — these
persist the leaderboard and gallery between restarts.

---

# Part 2 — Deck (firmware) setup

Three stages: **flash the Jaculus runtime**, **configure WiFi**, then **build and
upload the firmware**.

## 2a. Flash the Jaculus runtime

This installs the JavaScript runtime onto the Saturn. You only need to do this
once per board (or when updating Jaculus).

1. Connect the Saturn to your computer with a **USB-C** cable.
   - If the board keeps disconnecting/reconnecting, put it into **boot mode**:
     hold the `BOOT` button, press `EN`, then release `BOOT`.
2. Open the **[Jaculus web installer](https://installer.jaculus.org/)** in Chrome/Edge/Vivaldi.
3. Click **Connect to device** and pick the Saturn's serial port (typically
   `COM…`, `ttyACM…`, or "USB JTAG/serial debug unit"). If unsure, unplug and
   replug — the port that disappears/reappears is the right one.
4. Click **Flash firmware (ESP32-S3)** and wait. Don't change any installer settings.
5. When it finishes, unplug and replug the USB cable, then press the `EN` button.

Verify:

```bash
npx jac list-ports          # find your port
npx jac --port <port> version
```

## 2b. Configure WiFi on the Saturn

WiFi is configured on the device with the `jac` CLI — **not** in the firmware
source. The deck's firmware only reads the current IP; you tell it which network
to join using these commands.

> In every command below, replace `<port>` with your serial port (from
> `npx jac list-ports`). You can drop `--port <port>` if only one device is connected.

**Connect the deck to your WiFi network (Station mode):**

```bash
# 1. Add your network's credentials
npx jac --port <port> wifi-add "YOUR_WIFI_SSID"

# 2. Switch the deck into Station mode (connect to that network)
npx jac --port <port> wifi-sta --no-ap-fallback

# 3. Check the result — this shows the current config and, once connected, the IP
npx jac --port <port> wifi-get
```

Once `wifi-get` reports an IP address, the deck can reach the server.

**All available WiFi commands:**

| Command        | What it does                                    |
| -------------- | ----------------------------------------------- |
| `wifi-get`     | Display the current WiFi config and status.     |
| `wifi-add`     | Add a WiFi network (SSID + password).           |
| `wifi-rm`      | Remove a saved WiFi network.                    |
| `wifi-sta`     | Station mode — connect to a WiFi network.       |
| `wifi-ap`      | Access-Point mode — the deck creates a hotspot. |
| `wifi-disable` | Turn WiFi off.                                  |

> If you're unsure of the exact arguments a command expects, run
> `npx jac wifi-add --help` (works for any subcommand) to see its usage.

The server and the deck **must be on the same network** (or the deck's network
must be able to route UDP to the server on `PORT`).

## 2c. Configure and upload the firmware

The firmware is a Jaculus TypeScript project. `deck-firmware.ts` is the program's
entry point and goes in the project's `src/index.ts`.

**1. Create a project** (this also installs the Saturn libraries the firmware imports —
`saturn`, `colors`, `button`, `adc`, `piezo`, `mpu6050`, `i2c`, `wifi`, `udp`, `fs`):

```bash
npx jac project-create --from-device robodeck
cd robodeck
```

Then copy `deck-firmware.ts` over `src/index.ts`.

**2. Edit the network config** at the top of the firmware (`src/index.ts`). Find
the `CONFIG` block and set the `network` section to match your server:

```ts
network: {
  enabled: true,
  host: "192.168.1.50",       // ← your server's IP (from Part 1, step 4)
  port: 8788,                 // ← must match the server's PORT
  token: "my-secret-token",   // ← must EXACTLY match the server's TOKEN
  deviceName: "ROBODECK",     // ← shows up on the leaderboard
},
```

The rest of `CONFIG` maps the hardware (D-pad, joystick, slider, piezo, gyro) to
PMOD pins. Enable/disable and re-pin modules there to match how your Robodeck is
wired — the defaults match the standard build.

**3. Build, flash, and watch the output:**

```bash
npx jac build flash monitor
```

This compiles the project, uploads it, and opens the serial console so you can
see logs (`wifi: connected, IP …`, `DL: …`, etc.). Press `Ctrl+C` to leave the monitor.

On boot the deck shows a **ROBODECK** splash, waits for WiFi, fetches the game
list, leaderboard, and time from the server, then drops into the menu.

---

## Configuring games

### The game menu (`game-order.json`)

Re-read on **every** game-list request, so you can edit it while the server runs.

```jsonc
{
  "order":   ["snake", "flap", "dino", "..."],  // menu order, by file name (no .js)
  "disabled": ["beat"],                          // hidden from the menu
  "games": {                                     // per-game display overrides
    "snake": { "name": "SNAKE", "color": [0, 255, 0] }
  }
}
```

- `order` — the sequence games appear in. Any game files not listed still appear, after the ordered ones.
- `disabled` — game IDs (file names without `.js`) to hide.
- `games` — override the display `name` and tile `color` (RGB 0–255) per game.

### Adding a new game

1. Drop a `<name>.js` file into `games/`.
2. Give it a header comment on the **first line**:
   ```js
   //! name=MYGAME color=255,120,0
   ```
   This sets the default menu label and tile color (overridable in `game-order.json`).
3. Export a run function the deck will call — `export { fn as default }` (or export `run`).
   It receives the `gameApi` object (`display`, `colors`, `piezo`, `setPx`, `drawText`,
   `drawRect`, `joyX`, `joyY`, `sliderPos`, `held`, `mpu`, `gameOverScreen`, …).
   Look at `games/snake.js` for the simplest complete example.

Menu names/labels are limited to the deck's built-in font: `A–Z 0–9` and
`` space _ . : ! ? + / = ( ) - `` (lowercase is upper-cased automatically).

### The image gallery

1. Open `http://YOUR-SERVER-IP:8788/gallery`.
2. Enter your server **token** when prompted, upload images, and save.
3. On the deck, open the **PHOTO / GALLERY** menu item to view them.

Limits: up to 24 images, ~8 MB total raw upload.

---

## Using the deck

Controls depend on your hardware config, but by default:

| Action                | Input                                              |
| --------------------- | -------------------------------------------------- |
| Move in menu          | D-pad up/down, or joystick                         |
| Select                | D-pad right, or joystick click                     |
| Exit a game           | Hold **left + right** together                     |
| Force reconnect       | In menu, hold **all four** D-pad directions        |
| Sync scores/time      | In menu, hold **up + down**                        |
| Settings              | Open the **SETTINGS** menu item (theme, WiFi/IP/server info) |
| Screensaver (clock)   | Auto after ~5 min idle; any input wakes it         |

Scores are submitted to the server automatically on game over (when online). The
best score per game is shared across all decks using the same server + token.

---

## Troubleshooting

| Symptom                                  | Likely cause / fix                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Deck stuck on **WAIT WIFI**              | WiFi not configured or wrong password — redo **2b** (`wifi-add`, `wifi-sta`, `wifi-get`). |
| **SERVER RETRY** / empty menu            | Server not running, wrong `host`/`port`, or **token mismatch**. Confirm the deck's `token` equals the server's `TOKEN`. |
| Connects but no games                    | `games/` is empty, or everything is in `disabled`. Check `game-order.json`.        |
| **E META / E CHNK / DL FAIL**            | UDP packets dropped. Try a smaller `GALLERY_BUNDLE_CHARS`, move closer to the AP, or use a less congested network. |
| Deck keeps disconnecting while flashing  | Put it in boot mode: hold `BOOT`, press `EN`, release `BOOT`.                       |
| Wrong clock time                         | Set `TZ_MIN` on the server to your offset in minutes (e.g. `60` = UTC+1, `120` = UTC+2). |
| Server warns about insecure token        | You didn't set `TOKEN`. Set it, and update the firmware to match.                  |
| `jac`/driver issues                      | See the [Jaculus troubleshooting guide](https://jaculus.org/troubleshooting/).     |

---

## Reference

- Jaculus runtime & tools: <https://jaculus.org>
- Robodeck build & lessons: <https://2026.robotickytabor.cz>
- Firmware install (web): <https://installer.jaculus.org/>
