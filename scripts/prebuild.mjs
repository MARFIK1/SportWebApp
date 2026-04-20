// Trim SofascoreData to the fields the app uses; write to .data/
// Run: node scripts/prebuild.mjs
// Env: PREBUILD_REPORT_DAYS_PAST / PREBUILD_REPORT_DAYS_FUTURE (default 14), PREBUILD_COPY_ALL_REPORTS=1 for all report dates.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SOURCE_DATA = path.join(ROOT, "SofascoreData", "data");
const SOURCE_REPORTS = path.join(ROOT, "SofascoreData", "reports");
const SOURCE_MODELS = path.join(ROOT, "SofascoreData", "data", "models");
const OUT_DIR = path.join(ROOT, ".data");

const MATCH_FIELDS = new Set([
    "event_id", "home_team", "away_team", "home_team_id", "away_team_id",
    "home_score", "away_score", "home_score_ht", "away_score_ht",
    "home_score_pen", "away_score_pen", "home_score_et", "away_score_et",
    "status", "date", "round", "season",
    "home_ballpossession", "away_ballpossession",
    "home_expectedgoals", "away_expectedgoals",
    "home_xg", "away_xg",
    "home_totalshotsongoal", "away_totalshotsongoal",
    "home_shotsongoal", "away_shotsongoal",
    "home_shotsoffgoal", "away_shotsoffgoal",
    "home_blockedscoringattempt", "away_blockedscoringattempt",
    "home_cornerkicks", "away_cornerkicks",
    "home_fouls", "away_fouls",
    "home_yellowcards", "away_yellowcards",
    "home_goalkeepersaves", "away_goalkeepersaves",
    "home_passes", "away_passes",
    "home_accuratepasses", "away_accuratepasses",
    "home_totaltackle", "away_totaltackle",
]);

const PLAYER_FIELDS = new Set([
    "id", "name", "short_name", "position", "jersey_number",
    "date_of_birth", "height", "country", "team",
]);

// Same paths as leagueRegistry.ts
const COMPETITIONS = [
    "league/england/premier_league", "league/spain/la_liga", "league/germany/bundesliga",
    "league/italy/serie_a", "league/france/ligue_1", "league/netherlands/eredivisie",
    "league/portugal/primeira_liga", "league/turkey/super_lig", "league/belgium/jupiler_pro_league",
    "league/austria/bundesliga", "league/scotland/premiership", "league/greece/super_league",
    "league/poland/ekstraklasa", "league/usa/mls", "league/saudi_arabia/saudi_pro_league",
    "league/england/championship", "league/england/league_one", "league/england/league_two",
    "league/spain/la_liga_2", "league/germany/2_bundesliga", "league/italy/serie_b",
    "league/france/ligue_2", "league/poland/1_liga",
    "cups/england/fa_cup", "cups/england/efl_cup", "cups/england/community_shield",
    "cups/spain/copa_del_rey", "cups/spain/supercopa", "cups/germany/dfb_pokal",
    "cups/germany/supercup", "cups/italy/coppa_italia", "cups/italy/supercoppa",
    "cups/france/coupe_de_france", "cups/france/trophee_des_champions", "cups/poland/puchar_polski",
    "european/champions_league", "european/europa_league", "european/conference_league", "european/super_cup",
    "international/world_cup", "international/world_cup_qualifiers_europe",
    "international/euro", "international/euro_qualifiers", "international/nations_league",
];

function trimMatch(m) {
    const trimmed = {};
    for (const key of MATCH_FIELDS) {
        if (key in m) trimmed[key] = m[key];
    }
    return trimmed;
}

function trimPlayer(p) {
    const trimmed = {};
    for (const key of PLAYER_FIELDS) {
        if (key in p) trimmed[key] = p[key];
    }
    return trimmed;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function removePathWithRetry(targetPath) {
    try {
        fs.rmSync(targetPath, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
        });
        return;
    } catch (err) {
        const stalePath = targetPath + ".stale-" + Date.now();
        try {
            fs.renameSync(targetPath, stalePath);
            fs.rmSync(stalePath, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
            return;
        } catch {
            throw err;
        }
    }
}

function resetDir(dir) {
    ensureDir(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        removePathWithRetry(path.join(dir, entry.name));
    }
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function utcTodayYmd() {
    return new Date().toISOString().slice(0, 10);
}

function addCalendarDaysYmd(ymd, deltaDays) {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    return new Date(t + deltaDays * 864e5).toISOString().slice(0, 10);
}

function isYmdInWindow(dateStr, minYmd, maxYmd) {
    return dateStr >= minYmd && dateStr <= maxYmd;
}

function copyReportsWindowed(srcReports, destReports) {
    const copyAll = process.env.PREBUILD_COPY_ALL_REPORTS === "1" || process.env.PREBUILD_COPY_ALL_REPORTS === "true";
    if (!fs.existsSync(srcReports)) return { copied: 0, skipped: 0, total: 0 };

    if (copyAll) {
        copyDir(srcReports, destReports);
        const n = fs.readdirSync(srcReports).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).length;
        return { copied: n, skipped: 0, total: n };
    }

    const past = Math.max(0, parseInt(process.env.PREBUILD_REPORT_DAYS_PAST || "14", 10));
    const future = Math.max(0, parseInt(process.env.PREBUILD_REPORT_DAYS_FUTURE || "14", 10));
    const today = utcTodayYmd();
    const minYmd = addCalendarDaysYmd(today, -past);
    const maxYmd = addCalendarDaysYmd(today, future);

    ensureDir(destReports);
    let copied = 0;
    let skipped = 0;
    const entries = fs.readdirSync(srcReports, { withFileTypes: true });
    for (const e of entries) {
        if (!e.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(e.name)) continue;
        if (!isYmdInWindow(e.name, minYmd, maxYmd)) {
            skipped++;
            continue;
        }
        copyDir(path.join(srcReports, e.name), path.join(destReports, e.name));
        copied++;
    }
    console.log("report date range: " + minYmd + " .. " + maxYmd + " (" + past + "d back, " + future + "d ahead)");
    return { copied, skipped, total: copied + skipped };
}

console.log("prebuild: writing trimmed data to .data/\n");

if (!fs.existsSync(SOURCE_DATA)) {
    console.log("no SofascoreData/data - exit (existing .data left as-is)\n");
    process.exit(0);
}

if (process.env.PREBUILD_CLEAN === "1" || process.env.PREBUILD_CLEAN === "true") {
    resetDir(OUT_DIR);
} else {
    ensureDir(OUT_DIR);
}

let totalMatches = 0;
let totalPlayers = 0;
let matchBytes = 0;
let playerBytes = 0;

for (const dataPath of COMPETITIONS) {
    const rawDir = path.join(SOURCE_DATA, dataPath, "raw");
    const allSeasonsPath = path.join(rawDir, "all_seasons.json");

    if (!fs.existsSync(allSeasonsPath)) {
        console.log("skip " + dataPath + " (no all_seasons.json)");
        continue;
    }

    const outBaseDir = path.join(OUT_DIR, dataPath);
    const outRawDir = path.join(outBaseDir, "raw");
    ensureDir(outRawDir);

    const raw = JSON.parse(fs.readFileSync(allSeasonsPath, "utf-8"));
    const matches = raw.matches || [];
    const trimmed = matches.map(trimMatch);
    const matchJson = JSON.stringify({ metadata: raw.metadata || {}, matches: trimmed });
    fs.writeFileSync(path.join(outRawDir, "all_seasons.json"), matchJson);
    totalMatches += trimmed.length;
    matchBytes += Buffer.byteLength(matchJson);

    const playersDir = path.join(SOURCE_DATA, dataPath, "players");
    if (fs.existsSync(playersDir)) {
        const playerFiles = fs.readdirSync(playersDir)
            .filter((f) => f.startsWith("players_") && f.endsWith(".json"))
            .sort();

        if (playerFiles.length > 0) {
            const latestFile = playerFiles[playerFiles.length - 1];
            const playerData = JSON.parse(fs.readFileSync(path.join(playersDir, latestFile), "utf-8"));
            const teams = playerData.teams || {};
            const trimmedTeams = {};
            for (const [teamName, players] of Object.entries(teams)) {
                trimmedTeams[teamName] = players.map(trimPlayer);
                totalPlayers += players.length;
            }
            const playerJson = JSON.stringify({ teams: trimmedTeams });
            fs.writeFileSync(path.join(outBaseDir, "players.json"), playerJson);
            playerBytes += Buffer.byteLength(playerJson);
        }
    }

    console.log("ok " + dataPath + " (" + trimmed.length + " matches)");
}

console.log("\nprediction reports:");
if (fs.existsSync(SOURCE_REPORTS)) {
    const { copied, skipped, total } = copyReportsWindowed(SOURCE_REPORTS, path.join(OUT_DIR, "reports"));
    console.log("copied " + copied + " date folders (" + skipped + " outside window, " + total + " in source tree)");
} else {
    console.log("no SofascoreData/reports");
}

console.log("\nmodel comparison csv:");
const summaryCsv = path.join(SOURCE_MODELS, "comparison_summary.csv");
if (fs.existsSync(summaryCsv)) {
    const outModelsDir = path.join(OUT_DIR, "models");
    ensureDir(outModelsDir);
    fs.copyFileSync(summaryCsv, path.join(outModelsDir, "comparison_summary.csv"));
    console.log("comparison_summary.csv copied");
} else {
    console.log("no comparison_summary.csv");
}

const totalBytes = matchBytes + playerBytes;
console.log("");
console.log("summary");
console.log("competitions: " + COMPETITIONS.length);
console.log("matches: " + totalMatches.toLocaleString("en-US"));
console.log("player rows: " + totalPlayers.toLocaleString("en-US"));
console.log("match json: " + (matchBytes / 1024 / 1024).toFixed(1) + " MB");
console.log("player json: " + (playerBytes / 1024 / 1024).toFixed(1) + " MB");
console.log("json total (no reports): " + (totalBytes / 1024 / 1024).toFixed(1) + " MB");
console.log("output: " + OUT_DIR);
