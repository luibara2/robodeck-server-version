/**
 * ROBODECK SERVER v6  (native-FPS bundled GIF gallery + game store + leaderboard + time)
 * =================================================================
 * Zero-dependency Node.js (v16+). Run: node server.js
 *
 *
 * Games live in ./games. Menu order, names, colors, and disabled games
 * are configured in ./game-order.json and re-read on every game-list request.
 *
 * Gallery admin page:
 *   http://YOUR-SERVER:PORT/gallery
 */
"use strict";
const http = require("http");
const dgram = require("dgram");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "8788", 10);
const TOKEN = process.env.TOKEN || "CHANGE-ME-PLEASE";
const TZ_MIN = parseInt(process.env.TZ_MIN || "120", 10);
const DATA_FILE = path.join(__dirname, "scores.json");
const GAMES_DIR = path.join(__dirname, "games");
const GAME_ORDER_FILE = path.join(__dirname, "game-order.json");
const GALLERY_FILE = path.join(__dirname, "gallery.json");
const GALLERY_ADMIN_FILE = path.join(__dirname, "gallery-admin.html");
const MAX_SCORE = 100000;
const TOP_PER_GAME = 10;
const RATE_LIMIT = 20000;
const CHUNK_SIZE = 900;
const MAX_GALLERY_IMAGES = 24;
const MAX_GALLERY_RAW_BYTES = 8 * 1024 * 1024;
const GALLERY_BYTES_PER_IMAGE = 4096;
const GALLERY_CHUNK_SIZE = 1200; // legacy per-frame endpoint
const GALLERY_BUNDLE_CHUNK_SIZE = (() => {
    const requested = Math.floor(Number(process.env.GALLERY_BUNDLE_CHARS) || 1200);
    // Base64 must be split on a 4-character boundary. 1200 avoids IP fragmentation;
    // 6000 is faster on networks where fragmented UDP is reliable.
    return Math.max(400, Math.min(6000, requested - (requested % 4)));
})();

if (TOKEN === "CHANGE-ME-PLEASE") {
    console.warn("!!! TOKEN not set - insecure default.");
}

function clampByte(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, n));
}

function parseColor(value, fallback) {
    if (Array.isArray(value) && value.length >= 3) {
        return [clampByte(value[0]), clampByte(value[1]), clampByte(value[2])];
    }
    if (typeof value === "string") {
        const text = value.trim();
        const hex = text.match(/^#?([0-9a-f]{6})$/i);
        if (hex) {
            return [
                parseInt(hex[1].slice(0, 2), 16),
                parseInt(hex[1].slice(2, 4), 16),
                parseInt(hex[1].slice(4, 6), 16),
            ];
        }
        const rgb = text.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/);
        if (rgb) return [clampByte(rgb[1]), clampByte(rgb[2]), clampByte(rgb[3])];
    }
    return fallback;
}

function sanitizeMenuName(value, fallback) {
    const text = String(value == null ? "" : value)
        .toUpperCase()
        // Keep every character supported by the deck's built-in font.
        .replace(/[^A-Z0-9 _.:!?+\/=()\-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return text || fallback;
}

function readGameOrder() {
    try {
        const raw = JSON.parse(fs.readFileSync(GAME_ORDER_FILE, "utf8"));
        if (Array.isArray(raw)) return { order: raw, disabled: [], games: {} };
        return {
            order: Array.isArray(raw.order) ? raw.order : [],
            disabled: Array.isArray(raw.disabled) ? raw.disabled : [],
            games: raw.games && typeof raw.games === "object" ? raw.games : {},
        };
    } catch (e) {
        return { order: [], disabled: [], games: {} };
    }
}

function listGames() {
    let files = [];
    try {
        files = fs.readdirSync(GAMES_DIR).filter((file) => file.endsWith(".js"));
    } catch (e) {
        return [];
    }

    const cfg = readGameOrder();
    const disabled = new Set(cfg.disabled.map((id) => String(id).toLowerCase()));
    const positions = new Map(cfg.order.map((id, i) => [String(id).toLowerCase(), i]));
    const games = [];

    for (const file of files) {
        try {
            const source = fs.readFileSync(path.join(GAMES_DIR, file), "utf8");
            const header = source.match(/^\/\/!\s*name=(\S+)\s+color=(\d+),(\d+),(\d+)/);
            const id = file.replace(/\.js$/, "").toLowerCase();
            if (disabled.has(id)) continue;

            const defaultName = header ? sanitizeMenuName(header[1], id.toUpperCase()) : id.toUpperCase();
            const defaultColor = header
                ? [clampByte(header[2]), clampByte(header[3]), clampByte(header[4])]
                : [200, 200, 200];
            const override = cfg.games[id] && typeof cfg.games[id] === "object" ? cfg.games[id] : {};

            games.push({
                id,
                name: sanitizeMenuName(override.name, defaultName),
                color: parseColor(override.color, defaultColor),
            });
        } catch (e) {
            console.warn("Could not read game", file, e.message);
        }
    }

    games.sort((a, b) => {
        const ai = positions.has(a.id) ? positions.get(a.id) : 100000;
        const bi = positions.has(b.id) ? positions.get(b.id) : 100000;
        return ai - bi || a.id.localeCompare(b.id);
    });
    return games;
}

function cleanGalleryName(value, fallback) {
    return String(value || fallback)
        .replace(/[\u0000-\u001f]/g, "")
        .slice(0, 20);
}

function normalizeFrameDuration(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) return 100;
    // GIF delay is stored in centiseconds and can technically reach 655.35 s.
    return Math.max(1, Math.min(655350, n));
}

function normalizeStoredGalleryItem(item, index) {
    if (!item || typeof item !== "object") return null;
    const name = cleanGalleryName(item.name, `IMAGE ${index + 1}`);
    if (item.type === "gif" && Array.isArray(item.frames)) {
        const frames = item.frames
            .filter((frame) => frame && typeof frame.data === "string")
            .map((frame) => ({
                durationMs: normalizeFrameDuration(frame.durationMs),
                data: frame.data,
            }));
        if (frames.length > 1) return { name, type: "gif", loop: item.loop !== false, frames };
        if (frames.length === 1) return { name, type: "image", data: frames[0].data };
    }
    if (typeof item.data === "string") return { name, type: "image", data: item.data };
    return null;
}

function readGallery() {
    try {
        const raw = JSON.parse(fs.readFileSync(GALLERY_FILE, "utf8"));
        const images = Array.isArray(raw.images) ? raw.images : [];
        return {
            images: images
                .slice(0, MAX_GALLERY_IMAGES)
                .map(normalizeStoredGalleryItem)
                .filter(Boolean),
        };
    } catch (e) {
        return { images: [] };
    }
}

function decodePackedFrame(data, label) {
    if (typeof data !== "string") throw new Error(`${label} has no data`);
    const buffer = Buffer.from(data, "base64");
    if (buffer.length !== GALLERY_BYTES_PER_IMAGE) {
        throw new Error(`${label} must contain exactly ${GALLERY_BYTES_PER_IMAGE} packed pixels`);
    }
    return buffer;
}

function validateGalleryImages(rawImages) {
    if (!Array.isArray(rawImages)) throw new Error("images must be an array");
    if (rawImages.length > MAX_GALLERY_IMAGES) {
        throw new Error(`maximum is ${MAX_GALLERY_IMAGES} gallery items`);
    }
    let totalRawBytes = 0;
    const items = rawImages.map((item, i) => {
        if (!item || typeof item !== "object") throw new Error(`item ${i + 1} is invalid`);
        const name = cleanGalleryName(item.name, `IMAGE ${i + 1}`);
        if (item.type === "gif" && Array.isArray(item.frames)) {
            if (item.frames.length < 2) throw new Error(`GIF ${i + 1} needs at least 2 frames`);
            const frames = item.frames.map((frame, frameIndex) => {
                const buffer = decodePackedFrame(frame && frame.data, `GIF ${i + 1} frame ${frameIndex + 1}`);
                totalRawBytes += buffer.length;
                return {
                    durationMs: normalizeFrameDuration(frame && frame.durationMs),
                    data: buffer.toString("base64"),
                };
            });
            return { name, type: "gif", loop: item.loop !== false, frames };
        }
        const buffer = decodePackedFrame(item.data, `image ${i + 1}`);
        totalRawBytes += buffer.length;
        return { name, type: "image", data: buffer.toString("base64") };
    });
    if (totalRawBytes > MAX_GALLERY_RAW_BYTES) {
        throw new Error(`gallery is too large; maximum decoded size is ${Math.floor(MAX_GALLERY_RAW_BYTES / 1024 / 1024)} MB`);
    }
    return items;
}

function writeGallery(images) {
    const tmp = GALLERY_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ images }, null, 2));
    fs.renameSync(tmp, GALLERY_FILE);
    galleryCacheKey = "";
}

let galleryCacheKey = "";
let galleryCache = [];

const galleryUploads = new Map();

function cleanupGalleryUploads() {
    const now = Date.now();
    for (const [id, session] of galleryUploads) {
        if (!session || now - session.createdAt > 5 * 60 * 1000) {
            galleryUploads.delete(id);
        }
    }
}

function openGalleryUpload(data) {
    cleanupGalleryUploads();
    const images = readGallery().images;
    if (images.length >= MAX_GALLERY_IMAGES) return { ok: false, error: "gallery full" };

    const chunks = Math.floor(Number(data.chunks));
    const size = Math.floor(Number(data.size));
    const totalChars = Math.floor(Number(data.totalChars));
    const name = cleanGalleryName(data.name, `PAINT ${Date.now() % 100000}`);

    if (String(data.type || "image") !== "image") return { ok: false, error: "bad type" };
    if (!Number.isFinite(chunks) || chunks < 1 || chunks > 64) return { ok: false, error: "bad chunks" };
    if (size !== GALLERY_BYTES_PER_IMAGE) return { ok: false, error: "bad size" };
    if (!Number.isFinite(totalChars) || totalChars < 100 || totalChars > 10000) return { ok: false, error: "bad total" };

    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    galleryUploads.set(id, {
        id,
        name,
        createdAt: Date.now(),
        chunks,
        totalChars,
        parts: new Array(chunks),
    });

    return { ok: true, id, chunks };
}

function pushGalleryUploadChunk(data) {
    cleanupGalleryUploads();
    const id = String(data.id || "");
    const session = galleryUploads.get(id);
    if (!session) return { ok: false, error: "no upload" };

    const i = Math.floor(Number(data.i));
    if (!Number.isFinite(i) || i < 0 || i >= session.chunks) return { ok: false, error: "bad chunk index" };

    const part = typeof data.data === "string" ? data.data : "";
    if (!part || part.length > 400) return { ok: false, error: "bad chunk" };

    session.parts[i] = part;
    session.createdAt = Date.now();

    return {
        ok: true,
        id,
        i,
        received: session.parts.filter(Boolean).length,
        chunks: session.chunks
    };
}

function finishGalleryUpload(data) {
    cleanupGalleryUploads();
    const id = String(data.id || "");
    const session = galleryUploads.get(id);
    if (!session) return { ok: false, error: "no upload" };

    if (session.parts.some((part) => typeof part !== "string")) {
        return { ok: false, error: "missing chunks" };
    }

    const joined = session.parts.join("");
    galleryUploads.delete(id);

    if (joined.length !== session.totalChars) return { ok: false, error: "bad upload length" };

    let buffer;
    try {
        buffer = Buffer.from(joined, "base64");
    } catch (e) {
        return { ok: false, error: "bad base64" };
    }

    if (buffer.length !== GALLERY_BYTES_PER_IMAGE) return { ok: false, error: "bad image size" };

    const gallery = readGallery();
    if (gallery.images.length >= MAX_GALLERY_IMAGES) return { ok: false, error: "gallery full" };

    const images = gallery.images.concat([{
        name: session.name,
        type: "image",
        data: buffer.toString("base64"),
    }]);

    const validated = validateGalleryImages(images);
    writeGallery(validated);

    console.log(`gallery: deck upload saved "${session.name}" (${validated.length} item(s))`);
    return { ok: true, count: validated.length, name: session.name };
}

function packBits(buffer) {
    const out = [];
    let i = 0;
    while (i < buffer.length) {
        let run = 1;
        while (i + run < buffer.length && run < 128 && buffer[i + run] === buffer[i]) run++;
        if (run >= 3) {
            out.push(0x80 | (run - 1), buffer[i]);
            i += run;
            continue;
        }
        const start = i;
        i += run;
        while (i < buffer.length && i - start < 128) {
            run = 1;
            while (i + run < buffer.length && run < 128 && buffer[i + run] === buffer[i]) run++;
            if (run >= 3) break;
            i += run;
        }
        const count = i - start;
        out.push(count - 1);
        for (let j = start; j < i; j++) out.push(buffer[j]);
    }
    return Buffer.from(out);
}

// Delta packet: repeated records of [skipHi, skipLo, runLength, changed bytes...].
// It updates only pixels that differ from the previous GIF frame.
function packDelta(previous, current) {
    const out = [];
    let pos = 0;
    while (pos < current.length) {
        let skip = 0;
        while (pos < current.length && current[pos] === previous[pos]) {
            pos++;
            skip++;
        }
        if (pos >= current.length) break;
        let run = 0;
        const start = pos;
        while (pos < current.length && current[pos] !== previous[pos] && run < 255) {
            pos++;
            run++;
        }
        out.push((skip >> 8) & 255, skip & 255, run);
        for (let j = start; j < start + run; j++) out.push(current[j]);
    }
    return Buffer.from(out);
}

function encodeFullFrame(raw) {
    const rle = packBits(raw);
    return rle.length < raw.length
        ? { format: "rle", encoded: rle }
        : { format: "raw", encoded: raw };
}

const FRAME_FORMAT_CODE = { raw: 0, rle: 1, delta: 2 };

// Binary item bundle (RGF1):
//   4 bytes magic, 4 bytes frame count
//   repeated: duration u32 LE, format u8, encoded length u32 LE, encoded bytes
// The deck downloads this entire compressed bundle before native-timing playback.
function buildGalleryBundle(frames) {
    const header = Buffer.allocUnsafe(8);
    header.write("RGF1", 0, 4, "ascii");
    header.writeUInt32LE(frames.length >>> 0, 4);
    const parts = [header];
    let size = header.length;
    for (const frame of frames) {
        const meta = Buffer.allocUnsafe(9);
        meta.writeUInt32LE(normalizeFrameDuration(frame.durationMs) >>> 0, 0);
        meta[4] = FRAME_FORMAT_CODE[frame.format];
        meta.writeUInt32LE(frame.encoded.length >>> 0, 5);
        parts.push(meta, frame.encoded);
        size += meta.length + frame.encoded.length;
    }
    return Buffer.concat(parts, size);
}

function streamedGallery() {
    let key = "missing";
    try {
        const st = fs.statSync(GALLERY_FILE);
        key = `${st.mtimeMs}:${st.size}`;
    } catch (e) {}
    if (key === galleryCacheKey) return galleryCache;

    galleryCacheKey = key;
    galleryCache = readGallery().images.map((item, index) => {
        const sourceFrames = item.type === "gif"
            ? item.frames
            : [{ durationMs: 0, data: item.data }];
        let previous = null;
        const frames = sourceFrames.map((source, frameIndex) => {
            const raw = Buffer.from(source.data, "base64");
            const full = encodeFullFrame(raw);
            let format = full.format;
            let encoded = full.encoded;
            if (previous && frameIndex > 0) {
                const delta = packDelta(previous, raw);
                if (delta.length < encoded.length) {
                    format = "delta";
                    encoded = delta;
                }
            }
            previous = raw;
            const data = encoded.toString("base64");
            return {
                frame: frameIndex,
                durationMs: normalizeFrameDuration(source.durationMs || 100),
                format,
                rawBytes: raw.length,
                encodedBytes: encoded.length,
                encoded,
                data,
                chunks: Math.max(1, Math.ceil(data.length / GALLERY_CHUNK_SIZE)),
            };
        });
        const bundleBuffer = buildGalleryBundle(frames);
        const bundleData = bundleBuffer.toString("base64");
        return {
            index,
            name: item.name,
            type: item.type === "gif" ? "gif" : "image",
            loop: item.type === "gif" ? item.loop !== false : false,
            frames,
            bundleBytes: bundleBuffer.length,
            bundleData,
            bundleChunks: Math.max(1, Math.ceil(bundleData.length / GALLERY_BUNDLE_CHUNK_SIZE)),
        };
    });
    return galleryCache;
}

function readGame(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
    try {
        return fs.readFileSync(path.join(GAMES_DIR, id + ".js"), "utf8");
    } catch (e) {
        return null;
    }
}

let scores = {};
try {
    scores = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) {
    scores = {};
}
let saveTimer = null;
function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const tmp = DATA_FILE + ".tmp";
        fs.writeFile(tmp, JSON.stringify(scores), (err) => {
            if (!err) fs.rename(tmp, DATA_FILE, () => {});
        });
    }, 2000);
}
function sanitizeName(raw) {
    return String(raw || "DECK")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 12)
        .toUpperCase() || "DECK";
}
function submitScore(data) {
    const game = sanitizeMenuName(data.game, "");
    const score = Math.floor(Number(data.score));
    const name = sanitizeName(data.device);
    if (!game) return { ok: false, error: "no game" };
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        return { ok: false, error: "bad score" };
    }
    if (!scores[game]) scores[game] = [];
    scores[game].push({ name, score, ts: Date.now() });
    scores[game].sort((a, b) => b.score - a.score);
    scores[game] = scores[game].slice(0, TOP_PER_GAME);
    scheduleSave();
    console.log(`score: ${name} ${game} ${score}`);
    return { ok: true, best: scores[game][0].score };
}
function topEntries() {
    const top = [];
    for (const game of listGames()) {
        const rows = scores[game.name];
        if (rows && rows.length) {
            top.push({ game: game.name, name: rows[0].name, score: rows[0].score });
        }
    }
    return top;
}

const hits = new Map();
function rateLimited(ip) {
    const now = Date.now();
    let hit = hits.get(ip);
    if (!hit || now - hit.windowStart > 60000) {
        hit = { count: 0, windowStart: now };
        hits.set(ip, hit);
    }
    hit.count++;
    if (hits.size > 5000) hits.clear();
    return hit.count > RATE_LIMIT;
}

function handleUdp(data) {
    if (data.t === "time") return { ok: true, epochMs: Date.now(), tzOffsetMin: TZ_MIN };
    if (data.t === "games") return { ok: true, games: listGames() };
    if (data.t === "gmeta") {
        const code = readGame(String(data.name || ""));
        if (code === null) return { ok: false, error: "no game" };
        return {
            ok: true,
            size: code.length,
            chunks: Math.max(1, Math.ceil(code.length / CHUNK_SIZE)),
            chunkSize: CHUNK_SIZE,
        };
    }
    if (data.t === "gchunk") {
        const code = readGame(String(data.name || ""));
        if (code === null) return { ok: false, error: "no game" };
        const i = Math.floor(Number(data.i) || 0);
        const start = i * CHUNK_SIZE;
        const slice = code.slice(start, start + CHUNK_SIZE);
        return { ok: true, i, last: start + CHUNK_SIZE >= code.length, data: slice };
    }
    if (data.t === "glist") {
        const images = streamedGallery();
        return {
            ok: true,
            count: images.length,
            images: images.map((img) => ({
                name: img.name,
                type: img.type,
                loop: img.loop,
                frames: img.frames.length,
            })),
        };
    }
    if (data.t === "gibundle" || data.t === "gibundleopen") {
        const images = streamedGallery();
        const index = Math.floor(Number(data.index));
        const img = images[index];
        if (!img) return { ok: false, error: "no gallery item" };
        const response = {
            ok: true,
            index,
            name: img.name,
            type: img.type,
            loop: img.loop,
            frameCount: img.frames.length,
            bundleBytes: img.bundleBytes,
            chunks: img.bundleChunks,
            chunkSize: GALLERY_BUNDLE_CHUNK_SIZE,
        };
        if (data.t === "gibundleopen") {
            response.i = 0;
            response.last = img.bundleChunks === 1;
            response.data = img.bundleData.slice(0, GALLERY_BUNDLE_CHUNK_SIZE);
        }
        return response;
    }
    if (data.t === "gibundlechunk") {
        const images = streamedGallery();
        const index = Math.floor(Number(data.index));
        const i = Math.floor(Number(data.i));
        const img = images[index];
        if (!img || i < 0 || i >= img.bundleChunks) {
            return { ok: false, error: "no gallery bundle chunk" };
        }
        const start = i * GALLERY_BUNDLE_CHUNK_SIZE;
        return {
            ok: true,
            index,
            i,
            last: i === img.bundleChunks - 1,
            data: img.bundleData.slice(start, start + GALLERY_BUNDLE_CHUNK_SIZE),
        };
    }
    if (data.t === "gimeta" || data.t === "giopen") {
        const images = streamedGallery();
        const index = Math.floor(Number(data.index));
        const frameIndex = Math.max(0, Math.floor(Number(data.frame) || 0));
        const img = images[index];
        const frame = img && img.frames[frameIndex];
        if (!img || !frame) return { ok: false, error: "no gallery frame" };
        const response = {
            ok: true,
            index,
            name: img.name,
            type: img.type,
            loop: img.loop,
            frame: frameIndex,
            frameCount: img.frames.length,
            durationMs: frame.durationMs,
            format: frame.format,
            rawBytes: frame.rawBytes,
            encodedBytes: frame.encodedBytes,
            chunks: frame.chunks,
            chunkSize: GALLERY_CHUNK_SIZE,
        };
        if (data.t === "giopen") {
            response.i = 0;
            response.last = frame.chunks === 1;
            response.data = frame.data.slice(0, GALLERY_CHUNK_SIZE);
        }
        return response;
    }
    if (data.t === "gichunk") {
        const images = streamedGallery();
        const index = Math.floor(Number(data.index));
        const frameIndex = Math.max(0, Math.floor(Number(data.frame) || 0));
        const i = Math.floor(Number(data.i));
        const img = images[index];
        const frame = img && img.frames[frameIndex];
        if (!img || !frame || i < 0 || i >= frame.chunks) {
            return { ok: false, error: "no gallery frame chunk" };
        }
        const start = i * GALLERY_CHUNK_SIZE;
        return {
            ok: true,
            index,
            frame: frameIndex,
            i,
            last: i === frame.chunks - 1,
            data: frame.data.slice(start, start + GALLERY_CHUNK_SIZE),
        };
    }
    if (data.t === "gupopen") return openGalleryUpload(data);
    if (data.t === "gupchunk") return pushGalleryUploadChunk(data);
    if (data.t === "gupfinish") return finishGalleryUpload(data);
    if (data.t === "lb") return { ok: true, top: topEntries() };
    if (data.t === "score") return submitScore(data);
    return { ok: false, error: "unknown" };
}

const udp = dgram.createSocket("udp4");
udp.on("message", (message, remote) => {
    if (rateLimited("u:" + remote.address)) return;
    if (message.length > 512) return;
    let data;
    try {
        data = JSON.parse(message.toString("utf8"));
    } catch (e) {
        return;
    }
    if (!data || data.token !== TOKEN) return;
    let response;
    try {
        response = handleUdp(data);
    } catch (e) {
        console.error("UDP request failed:", e);
        response = { ok: false, error: "server" };
    }
    udp.send(Buffer.from(JSON.stringify(response)), remote.port, remote.address);
});
udp.on("error", (e) => console.error("udp error:", e.message));
udp.bind(PORT, () => console.log(`UDP listening on ${PORT} (deck protocol)`));

function jsonResponse(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
}

function readJsonBody(req, limitBytes) {
    return new Promise((resolve, reject) => {
        let body = "";
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error("request is too large"));
                req.destroy();
                return;
            }
            body += chunk.toString("utf8");
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch (e) {
                reject(new Error("invalid JSON"));
            }
        });
        req.on("error", reject);
    });
}

async function handleGalleryApi(req, res) {
    try {
        const data = await readJsonBody(req, 24 * 1024 * 1024);
        if (!data || data.token !== TOKEN) {
            jsonResponse(res, 403, { ok: false, error: "wrong server token" });
            return;
        }
        if (data.action === "load") {
            jsonResponse(res, 200, { ok: true, images: readGallery().images });
            return;
        }
        if (data.action === "save") {
            const images = validateGalleryImages(data.images);
            writeGallery(images);
            console.log(`gallery: saved ${images.length} item(s)`);
            jsonResponse(res, 200, { ok: true, count: images.length });
            return;
        }
        jsonResponse(res, 400, { ok: false, error: "unknown gallery action" });
    } catch (e) {
        jsonResponse(res, 400, { ok: false, error: e.message || "gallery request failed" });
    }
}

function leaderboardHtml() {
    const games = listGames();
    const rows = games.map((game) => {
        const cells = (scores[game.name] || [])
            .slice(0, 5)
            .map((entry) => `<td>${entry.name} <b>${entry.score}</b></td>`)
            .join("");
        return `<tr><th>${game.name}</th>${cells || "<td>-</td>"}</tr>`;
    }).join("\n");
    const list = games
        .map((game) => `<span style="color:rgb(${game.color.join(",")})">${game.name}</span>`)
        .join(" &nbsp; ");
    const galleryCount = readGallery().images.length;
    return `<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="15"><title>Robodeck</title>
<style>body{background:#111;color:#eee;font-family:monospace;padding:2em}h1{color:#4cf}a{color:#7df}
table{border-collapse:collapse}th,td{border:1px solid #444;padding:.4em .8em}th{color:#fc4}b{color:#4f8}</style>
<h1>ROBODECK</h1><p>Games: ${list || "(none - add .js to ./games)"}</p>
<p><a href="/gallery">Manage image gallery</a> (${galleryCount} item${galleryCount === 1 ? "" : "s"})</p>
<table>${rows}</table><p>auto-refresh 15s</p>`;
}

const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    // Normalize trailing slashes and support reverse-proxy prefixes, for example:
    //   /gallery, /gallery/, /robodeck/gallery, /robodeck/gallery/
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const isGalleryPage = pathname === "/gallery" || pathname.endsWith("/gallery");
    const isGalleryApi = pathname === "/api/gallery" || pathname.endsWith("/api/gallery");

    if (pathname === "/health" || pathname.endsWith("/health")) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("ok");
        return;
    }
    if (isGalleryPage && req.method === "GET") {
        try {
            const page = fs.readFileSync(GALLERY_ADMIN_FILE, "utf8");
            res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
            });
            res.end(page);
        } catch (e) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("gallery-admin.html is missing");
        }
        return;
    }
    // POSTing to the same gallery URL is intentional. It works even when a
    // reverse proxy forwards only /gallery and not a separate /api/gallery.
    if ((isGalleryPage || isGalleryApi) && req.method === "POST") {
        await handleGalleryApi(req, res);
        return;
    }
    if (pathname !== "/") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(leaderboardHtml());
});
httpServer.listen(PORT, () => console.log(`HTTP leaderboard + gallery on ${PORT}`));

console.log(`Games dir: ${GAMES_DIR}`);
console.log(`Game config: ${GAME_ORDER_FILE}`);
console.log(`Gallery data: ${GALLERY_FILE}`);
