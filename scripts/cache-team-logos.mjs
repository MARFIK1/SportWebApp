import { existsSync } from "node:fs";
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

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force") || process.env.TEAM_LOGO_FORCE === "1";
const delayMs = parsePositiveInt(process.env.TEAM_LOGO_DELAY_MS, 1000);
const timeoutMs = parsePositiveInt(process.env.TEAM_LOGO_TIMEOUT_MS, 12000);
const limit = parseLimit(process.argv);

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

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: "https://www.sofascore.com/",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            },
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function downloadLogo(id) {
    const failures = [];

    for (const template of LOGO_URLS) {
        const url = template.replace("{id}", id);

        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) {
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

    return { ok: false, reason: [...new Set(failures)].join(", ") || "unknown" };
}

await collectFromSources();
await mkdir(OUTPUT_DIR, { recursive: true });

const allTeams = [...teams.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
const selectedTeams = limit ? allTeams.slice(0, limit) : allTeams;

console.log(`Found ${allTeams.length} team IDs in local data.`);
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

for (const [id, name] of selectedTeams) {
    if (!force && existsSync(logoPath(id))) {
        skipped += 1;
        continue;
    }

    const result = await downloadLogo(id);
    if (result.ok) {
        downloaded += 1;
        console.log(`[OK] ${id}${name ? ` ${name}` : ""} <- ${result.source}`);
    } else {
        failed += 1;
        console.log(`[MISS] ${id}${name ? ` ${name}` : ""} (${result.reason})`);
    }

    await sleep(delayMs);
}

console.log(`Done. downloaded=${downloaded}, skipped=${skipped}, failed=${failed}, output=${OUTPUT_DIR}`);
