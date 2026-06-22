import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "public", "team-logos");
const SOURCE_DIRS = ["SofascoreData/data", "SofascoreData/reports", ".data"];
const LOGO_URLS = [
    "https://img.sofascore.com/api/v1/team/{id}/image",
    "https://img.sofascore.com/api/v1/team/{id}/image/small",
];

const args = process.argv.slice(2);
const argSet = new Set(args);
const dryRun = argSet.has("--dry-run");
const force = argSet.has("--force") || process.env.TEAM_LOGO_FORCE === "1";
const headful = argSet.has("--headful") || process.env.TEAM_LOGO_BROWSER_HEADFUL === "1";
const delayMs = parsePositiveInt(process.env.TEAM_LOGO_DELAY_MS, 2000);
const timeoutMs = parsePositiveInt(process.env.TEAM_LOGO_TIMEOUT_MS, 15000);
const limit = parseLimit(args);
const teams = new Map();

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseLimit(argv) {
    const fromEnv = Number.parseInt(String(process.env.TEAM_LOGO_LIMIT ?? ""), 10);
    if (Number.isFinite(fromEnv) && fromEnv > 0) {
        return fromEnv;
    }

    const index = argv.indexOf("--limit");
    if (index >= 0) {
        const parsed = Number.parseInt(String(argv[index + 1] ?? ""), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return null;
}

function normalizeId(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return String(value);
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
        return value;
    }

    return null;
}

function addTeam(idValue, nameValue) {
    const id = normalizeId(idValue);
    if (!id) {
        return;
    }

    const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : teams.get(id) ?? "";
    teams.set(id, name);
}

function pickName(value, keys) {
    for (const key of keys) {
        if (typeof value?.[key] === "string" && value[key].trim()) {
            return value[key].trim();
        }
    }

    return "";
}

function collectTeams(value) {
    if (!value || typeof value !== "object") {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectTeams(item);
        }
        return;
    }

    addTeam(value.home_team_id, pickName(value, ["home_team", "home_team_name"]));
    addTeam(value.away_team_id, pickName(value, ["away_team", "away_team_name"]));
    addTeam(value.team_id, pickName(value, ["team", "team_name", "name"]));
    addTeam(value.homeTeamId, pickName(value, ["homeTeamName", "homeName"]));
    addTeam(value.awayTeamId, pickName(value, ["awayTeamName", "awayName"]));
    addTeam(value.teamId, pickName(value, ["teamName", "name"]));

    for (const key of ["team", "homeTeam", "awayTeam", "home_team", "away_team"]) {
        const team = value[key];
        if (team && typeof team === "object") {
            addTeam(team.id, team.name);
        }
    }

    for (const item of Object.values(value)) {
        collectTeams(item);
    }
}

async function walkJsonFiles(dir, files = []) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return files;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walkJsonFiles(fullPath, files);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(fullPath);
        }
    }

    return files;
}

async function collectFromSources() {
    for (const source of SOURCE_DIRS) {
        const sourcePath = path.join(ROOT, source);
        if (!existsSync(sourcePath)) {
            continue;
        }

        const files = await walkJsonFiles(sourcePath);
        for (const file of files) {
            try {
                collectTeams(JSON.parse(await readFile(file, "utf8")));
            } catch {
                // Ignore partial or non-report JSON files.
            }
        }
    }
}

function logoPath(id) {
    return path.join(OUTPUT_DIR, `${id}.png`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForProcessExit(child, timeout = 5000) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const timer = setTimeout(resolve, timeout);
        child.once("exit", () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function removeUserDataDir(dir) {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
            await rm(dir, { recursive: true, force: true });
            return;
        } catch (error) {
            lastError = error;
            await sleep(500 * attempt);
        }
    }

    const detail = lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError);
    console.warn(`[WARN] Could not remove temporary browser profile: ${dir} (${detail})`);
}

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, () => {
            const address = server.address();
            server.close(() => resolve(address.port));
        });
    });
}

function findBrowserPath() {
    const candidates = [
        process.env.BROWSER_PATH,
        process.env.BRAVE_PATH,
        process.env.CHROME_PATH,
        path.join(process.env.LOCALAPPDATA ?? "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(process.env.PROGRAMFILES ?? "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
        path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    ].filter(Boolean);

    return candidates.find((candidate) => existsSync(candidate));
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function waitForDevTools(port) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            return await fetchJson(`http://127.0.0.1:${port}/json/version`);
        } catch {
            await sleep(250);
        }
    }

    throw new Error("Browser DevTools endpoint did not start in time.");
}

function createBrowser(port, userDataDir, browserPath) {
    const browserArgs = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-gpu",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
    ];

    if (!headful) {
        browserArgs.push("--headless=new");
    }

    browserArgs.push("about:blank");
    return spawn(browserPath, browserArgs, { stdio: "ignore" });
}

function connectWebSocket(url) {
    if (typeof WebSocket !== "function") {
        throw new Error("Global WebSocket is unavailable. Use Node 22+ or Node 24 for this script.");
    }

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.addEventListener("open", () => resolve(ws), { once: true });
        ws.addEventListener("error", () => reject(new Error("Failed to connect to Browser DevTools websocket.")), {
            once: true,
        });
    });
}

class CdpSession {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();

        ws.addEventListener("message", (event) => this.handleMessage(event));
    }

    handleMessage(event) {
        const message = JSON.parse(event.data);
        if (message.id && this.pending.has(message.id)) {
            const { resolve, reject } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
                reject(new Error(message.error.message));
            } else {
                resolve(message.result ?? {});
            }
            return;
        }

        const callbacks = this.listeners.get(message.method);
        if (callbacks) {
            for (const callback of callbacks) {
                callback(message.params ?? {});
            }
        }
    }

    send(method, params = {}) {
        const id = this.nextId;
        this.nextId += 1;
        this.ws.send(JSON.stringify({ id, method, params }));

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
        });
    }

    on(method, callback) {
        const callbacks = this.listeners.get(method) ?? new Set();
        callbacks.add(callback);
        this.listeners.set(method, callbacks);
        return () => callbacks.delete(callback);
    }
}

async function createPageSession(port) {
    const target = await fetchJson(`http://127.0.0.1:${port}/json/new?https://www.sofascore.com/`, {
        method: "PUT",
    }).catch(() => fetchJson(`http://127.0.0.1:${port}/json/list`).then((items) => items[0]));
    const ws = await connectWebSocket(target.webSocketDebuggerUrl);
    const session = new CdpSession(ws);
    await session.send("Network.enable");
    await session.send("Page.enable");
    await session.send("Page.navigate", { url: "https://www.sofascore.com/" });
    await sleep(3000);
    return { session, ws };
}

async function downloadViaBrowser(session, url) {
    let requestId = "";
    let status = 0;
    let mimeType = "";
    let done = false;

    const offResponse = session.on("Network.responseReceived", (params) => {
        const responseUrl = params.response?.url ?? "";
        if (responseUrl === url || responseUrl.startsWith(url)) {
            requestId = params.requestId;
            status = params.response.status;
            mimeType = params.response.mimeType ?? "";
        }
    });
    const offFinished = session.on("Network.loadingFinished", (params) => {
        if (requestId && params.requestId === requestId) {
            done = true;
        }
    });

    try {
        await session.send("Page.navigate", { url });
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (requestId && done) {
                break;
            }
            await sleep(100);
        }

        if (!requestId) {
            return { ok: false, reason: "no browser response" };
        }
        if (status >= 400) {
            return { ok: false, reason: `${status} ${new URL(url).hostname}` };
        }
        if (!mimeType.toLowerCase().startsWith("image/")) {
            return { ok: false, reason: `${mimeType || "no mime type"} ${new URL(url).hostname}` };
        }

        const body = await session.send("Network.getResponseBody", { requestId });
        const buffer = body.base64Encoded
            ? Buffer.from(body.body, "base64")
            : Buffer.from(body.body ?? "", "utf8");
        if (buffer.byteLength === 0) {
            return { ok: false, reason: `empty ${new URL(url).hostname}` };
        }

        return { ok: true, buffer };
    } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "browser request failed" };
    } finally {
        offResponse();
        offFinished();
    }
}

async function downloadLogo(session, id) {
    const failures = [];

    for (const template of LOGO_URLS) {
        const url = template.replace("{id}", id);
        const result = await downloadViaBrowser(session, url);
        if (result.ok) {
            await writeFile(logoPath(id), result.buffer);
            return { ok: true, source: url };
        }

        failures.push(result.reason);
    }

    return { ok: false, reason: [...new Set(failures)].join(", ") || "unknown" };
}

await collectFromSources();
await mkdir(OUTPUT_DIR, { recursive: true });

const allTeams = [...teams.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
const selectedTeams = limit ? allTeams.slice(0, limit) : allTeams;

console.log(`Found ${allTeams.length} team IDs in local data.`);
console.log(`Browser mode: ${headful ? "headful" : "headless"}`);
if (dryRun) {
    for (const [id, name] of selectedTeams.slice(0, 30)) {
        console.log(`${id}${name ? ` ${name}` : ""}`);
    }
    if (selectedTeams.length > 30) {
        console.log(`...and ${selectedTeams.length - 30} more`);
    }
    process.exit(0);
}

const browserPath = findBrowserPath();
if (!browserPath) {
    throw new Error("Could not find Brave or Chrome. Set BROWSER_PATH to brave.exe or chrome.exe.");
}

const port = await getFreePort();
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "sportwebapp-logo-browser-"));
const browser = createBrowser(port, userDataDir, browserPath);
let downloaded = 0;
let skipped = 0;
let failed = 0;
let ws = null;

try {
    await waitForDevTools(port);
    const page = await createPageSession(port);
    const { session } = page;
    ws = page.ws;

    for (const [id, name] of selectedTeams) {
        if (!force && existsSync(logoPath(id))) {
            skipped += 1;
            continue;
        }

        const result = await downloadLogo(session, id);
        if (result.ok) {
            downloaded += 1;
            console.log(`[OK] ${id}${name ? ` ${name}` : ""} <- ${result.source}`);
        } else {
            failed += 1;
            console.log(`[MISS] ${id}${name ? ` ${name}` : ""} (${result.reason})`);
        }

        await sleep(delayMs);
    }

} finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    browser.kill();
    await waitForProcessExit(browser);
    await removeUserDataDir(userDataDir);
}

console.log(`Done. downloaded=${downloaded}, skipped=${skipped}, failed=${failed}, output=${OUTPUT_DIR}`);
