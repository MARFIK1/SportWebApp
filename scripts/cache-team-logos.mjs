import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "public", "team-logos");
const SOURCE_DIRS = ["SofascoreData/data", "SofascoreData/reports", ".data"];
const LOGO_URLS = [
    "https://img.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.app/api/v1/team/{id}/image",
    "https://www.sofascore.com/api/v1/team/{id}/image",
    "https://api.sofascore.com/api/v1/team/{id}/image",
    "https://img.sofascore.com/api/v1/team/{id}/image/small",
];

loadLocalEnv(".env");
loadLocalEnv(".env.local");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force") || process.env.TEAM_LOGO_FORCE === "1";
const delayMs = parsePositiveInt(process.env.TEAM_LOGO_DELAY_MS, 1000);
const timeoutMs = parsePositiveInt(process.env.TEAM_LOGO_TIMEOUT_MS, 12000);
const stopAfterBlockedMisses = parsePositiveInt(process.env.TEAM_LOGO_STOP_AFTER_BLOCKED_MISSES, 8);
const limit = parseLimit(process.argv);
const browserCookie = process.env.SOFASCORE_COOKIE?.trim() ?? "";
const requestedWith = process.env.SOFASCORE_X_REQUESTED_WITH?.trim() ?? "";
const optional = process.env.TEAM_LOGO_OPTIONAL === "1" || args.has("--optional");
const userAgent =
    process.env.SOFASCORE_USER_AGENT?.trim() ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const secChUa =
    process.env.SOFASCORE_SEC_CH_UA?.trim() ||
    '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"';
const acceptLanguage = process.env.SOFASCORE_ACCEPT_LANGUAGE?.trim() || "pl;q=0.6";

const teams = new Map();

function loadLocalEnv(fileName) {
    const filePath = path.join(ROOT, fileName);
    if (!existsSync(filePath)) {
        return;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separator = trimmed.indexOf("=");
        if (separator <= 0) {
            continue;
        }

        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if (!key || process.env[key] !== undefined) {
            continue;
        }

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    }
}

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

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": acceptLanguage,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Priority: "i",
        Referer: "https://www.sofascore.com/",
        "Sec-Ch-Ua": secChUa,
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-site",
        "Sec-Gpc": "1",
        "User-Agent": userAgent,
    };

    if (browserCookie) {
        headers.Cookie = browserCookie;
    }

    if (requestedWith) {
        headers["x-requested-with"] = requestedWith;
    }

    try {
        return await fetch(url, {
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal,
            headers,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function downloadLogo(id) {
    const failures = [];
    let blockedResponses = 0;
    let responses = 0;

    for (const template of LOGO_URLS) {
        const url = template.replace("{id}", id);

        try {
            const response = await fetchWithTimeout(url);
            responses += 1;
            if (!response.ok) {
                if (response.status === 403) {
                    blockedResponses += 1;
                }
                failures.push(`${response.status} ${new URL(url).hostname}`);
                continue;
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.toLowerCase().startsWith("image/")) {
                failures.push(`${contentType || "no content-type"} ${new URL(url).hostname}`);
                continue;
            }

            const image = Buffer.from(await response.arrayBuffer());
            if (image.byteLength === 0) {
                failures.push(`empty ${new URL(url).hostname}`);
                continue;
            }

            await writeFile(logoPath(id), image);
            return { ok: true, source: url };
        } catch {
            failures.push(`request failed ${new URL(url).hostname}`);
            continue;
        }
    }

    return {
        ok: false,
        blocked: responses > 0 && blockedResponses === responses,
        reason: [...new Set(failures)].join(", ") || "unknown",
    };
}

await collectFromSources();
await mkdir(OUTPUT_DIR, { recursive: true });

const allTeams = [...teams.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
const selectedTeams = limit ? allTeams.slice(0, limit) : allTeams;

console.log(`Found ${allTeams.length} team IDs in local data.`);
console.log(`Browser cookie header: ${browserCookie ? "yes" : "no"}`);
console.log(`x-requested-with header: ${requestedWith ? "yes" : "no"}`);
console.log(`Optional mode: ${optional ? "yes" : "no"}`);
if (dryRun) {
    for (const [id, name] of selectedTeams.slice(0, 30)) {
        console.log(`${id}${name ? ` ${name}` : ""}`);
    }
    if (selectedTeams.length > 30) {
        console.log(`...and ${selectedTeams.length - 30} more`);
    }
    process.exit(0);
}

let downloaded = 0;
let skipped = 0;
let failed = 0;
let blockedMisses = 0;

for (const [id, name] of selectedTeams) {
    if (!force && existsSync(logoPath(id))) {
        skipped += 1;
        continue;
    }

    const result = await downloadLogo(id);
    if (result.ok) {
        downloaded += 1;
        blockedMisses = 0;
        console.log(`[OK] ${id}${name ? ` ${name}` : ""} <- ${result.source}`);
    } else {
        failed += 1;
        blockedMisses = result.blocked ? blockedMisses + 1 : 0;
        console.log(`[MISS] ${id}${name ? ` ${name}` : ""} (${result.reason})`);

        if (blockedMisses >= stopAfterBlockedMisses) {
            console.error(
                `Stopping after ${blockedMisses} consecutive all-403 misses. ` +
                    "Sofascore is blocking this Node session; retry later, use VPN, or pass browser cookies.",
            );
            process.exitCode = optional ? 0 : 1;
            break;
        }
    }

    await sleep(delayMs);
}

console.log(`Done. downloaded=${downloaded}, skipped=${skipped}, failed=${failed}, output=${OUTPUT_DIR}`);
