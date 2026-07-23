import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SOURCE_DATA = path.join(ROOT, "SofascoreData", "data");
const SOURCE_REPORTS = process.env.SOFASCORE_REPORTS_DIR
    ? path.resolve(process.env.SOFASCORE_REPORTS_DIR)
    : path.join(ROOT, "SofascoreData", "reports");
const SOURCE_MODELS = path.join(ROOT, "SofascoreData", "data", "models");
const SOURCE_LOGS = process.env.PREBUILD_LOGS_DIR
    ? path.resolve(ROOT, process.env.PREBUILD_LOGS_DIR)
    : path.join(ROOT, "logs");
const OUT_DIR = process.env.PREBUILD_OUT_DIR
    ? path.resolve(ROOT, process.env.PREBUILD_OUT_DIR)
    : path.join(ROOT, ".data");
const MANIFEST_PATH = path.join(OUT_DIR, ".prebuild-manifest.json");
const LOG_TIME_ZONE = process.env.REPORT_TIME_ZONE || "Europe/Warsaw";
const ACTIVE_LOG_GRACE_MS = Number(process.env.ADMIN_ACTIVE_LOG_GRACE_MINUTES || 360) * 60 * 1000;

const MATCH_FIELDS = new Set([
    "event_id", "home_team", "away_team", "home_team_id", "away_team_id",
    "home_score", "away_score", "home_score_ht", "away_score_ht",
    "home_score_pen", "away_score_pen", "home_score_et", "away_score_et",
    "status", "date", "time", "round", "season", "source_competition",
    "odds_home_win", "odds_draw", "odds_away_win",
    "odds_home_prob", "odds_draw_prob", "odds_away_prob", "odds_overround",
    "odds_over_2_5", "odds_under_2_5", "odds_over_2_5_prob",
    "odds_btts_yes", "odds_btts_no", "odds_btts_prob",
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

function makeWritableRecursive(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.lstatSync(targetPath);
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(targetPath)) {
            makeWritableRecursive(path.join(targetPath, entry));
        }
        try {
            fs.chmodSync(targetPath, 0o700);
        } catch {
            
        }
    } else {
        try {
            fs.chmodSync(targetPath, 0o600);
        } catch {

        }
    }
}

function removePathWithRetry(targetPath) {
    try {
        makeWritableRecursive(targetPath);
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
        } catch {
            throw err;
        }

        try {
            makeWritableRecursive(stalePath);
            fs.rmSync(stalePath, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
            return;
        } catch (staleErr) {
            console.warn(
                "warning: moved stale path aside but could not remove it yet: " +
                stalePath + " (" + staleErr.message + ")"
            );
            return;
        }
    }
}

function resetDir(dir) {
    if (fs.existsSync(dir)) {
        removePathWithRetry(dir);
    }
    ensureDir(dir);
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

function writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function copyUpcomingFiles(srcRawDir, destRawDir) {
    const srcUpcomingDir = path.join(srcRawDir, "upcoming");
    if (!fs.existsSync(srcUpcomingDir)) return { files: 0, matches: 0, bytes: 0 };

    const destUpcomingDir = path.join(destRawDir, "upcoming");
    ensureDir(destUpcomingDir);

    let files = 0;
    let matches = 0;
    let bytes = 0;

    for (const fileName of fs.readdirSync(srcUpcomingDir).filter((name) => name.endsWith(".json")).sort()) {
        const raw = JSON.parse(fs.readFileSync(path.join(srcUpcomingDir, fileName), "utf-8"));
        const trimmedMatches = (raw.matches || []).map(trimMatch);
        const json = JSON.stringify({
            metadata: raw.metadata || {},
            matches: trimmedMatches,
        });
        fs.writeFileSync(path.join(destUpcomingDir, fileName), json);

        files++;
        matches += trimmedMatches.length;
        bytes += Buffer.byteLength(json);
    }

    return { files, matches, bytes };
}

function copyTeamHistoryFiles(srcDataDir, destDataDir) {
    const srcTeamHistoryDir = path.join(srcDataDir, "team_history");
    if (!fs.existsSync(srcTeamHistoryDir)) return { files: 0, matches: 0, bytes: 0 };

    const destTeamHistoryDir = path.join(destDataDir, "team_history");
    ensureDir(destTeamHistoryDir);

    let files = 0;
    let matches = 0;
    let bytes = 0;

    for (const fileName of fs.readdirSync(srcTeamHistoryDir).filter((name) => name.endsWith(".json")).sort()) {
        const raw = JSON.parse(fs.readFileSync(path.join(srcTeamHistoryDir, fileName), "utf-8"));
        const trimmedMatches = (raw.matches || []).map(trimMatch);
        const json = JSON.stringify({
            metadata: raw.metadata || {},
            matches: trimmedMatches,
        });
        fs.writeFileSync(path.join(destTeamHistoryDir, fileName), json);

        files++;
        matches += trimmedMatches.length;
        bytes += Buffer.byteLength(json);
    }

    return { files, matches, bytes };
}

function timeZoneOffsetMs(utcMs, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const zonedAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second),
    );
    return zonedAsUtc - utcMs;
}

function localTimeInZoneToIso(year, month, day, hour, minute, second, timeZone = LOG_TIME_ZONE) {
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    let utcMs = localAsUtc - timeZoneOffsetMs(localAsUtc, timeZone);
    utcMs = localAsUtc - timeZoneOffsetMs(utcMs, timeZone);
    return new Date(utcMs).toISOString();
}

function startedAtFromLogName(fileName) {
    const match = fileName.match(/(\d{8})-(\d{6})\.log$/);
    if (!match) return null;

    const [, date, time] = match;
    return localTimeInZoneToIso(
        Number(date.slice(0, 4)),
        Number(date.slice(4, 6)),
        Number(date.slice(6, 8)),
        Number(time.slice(0, 2)),
        Number(time.slice(2, 4)),
        Number(time.slice(4, 6)),
    );
}

function isBuildOrDeployLog(raw) {
    return /==> Build production bundle|Creating an optimized production build|==> Deploy to Vercel|staging copy for Vercel|done\. production:/i.test(raw);
}

function logStatus(raw) {
    if (/finished successfully/i.test(raw)) return "success";
    if (/failed with exit code|TerminatingError|Jupyter command .* not found|DEV_NOT_READY|error=/i.test(raw)) return "failed";
    if (isBuildOrDeployLog(raw)) return "success";
    return "unknown";
}

function isCompleteLog(raw) {
    return /Windows PowerShell transcript end|finished successfully|failed with exit code|TerminatingError/i.test(raw);
}

function logSummary(raw, status) {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const failure = lines.find((line) => /failed with exit code|TerminatingError|not found|DEV_NOT_READY|error=/i.test(line));
    if (failure) return failure.slice(0, 240);

    const success = lines.find((line) => /finished successfully/i.test(line));
    if (success) return success.slice(0, 240);

    const deploy = lines.find((line) => /done\. production:/i.test(line));
    if (deploy) return deploy.slice(0, 240);

    if (isBuildOrDeployLog(raw)) {
        return "Daily refresh reached the production build/deploy phase; this snapshot belongs to the current run.";
    }

    return status === "unknown" ? "Log ended without a clear success or failure marker." : status;
}

function shouldUseNewestLog(candidate, raw) {
    if (isCompleteLog(raw)) return true;
    if (isBuildOrDeployLog(raw)) return true;
    return Date.now() - candidate.stat.mtimeMs <= ACTIVE_LOG_GRACE_MS;
}

function newestLogEntry(logDir, prefix, kind) {
    if (!fs.existsSync(logDir)) return null;
    const files = fs.readdirSync(logDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".log"))
        .map((entry) => {
            const filePath = path.join(logDir, entry.name);
            const stat = fs.statSync(filePath);
            return { fileName: entry.name, filePath, stat };
        })
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    let latest = null;
    let raw = "";
    for (const candidate of files) {
        const candidateRaw = fs.readFileSync(candidate.filePath, "utf-8");
        if (!latest) {
            latest = candidate;
            raw = candidateRaw;
            if (shouldUseNewestLog(candidate, candidateRaw)) break;
            continue;
        }

        if (isCompleteLog(candidateRaw)) {
            latest = candidate;
            raw = candidateRaw;
            break;
        }
    }

    if (!latest) return null;
    const status = logStatus(raw);
    const tail = raw.split(/\r?\n/).slice(-40);

    return {
        kind,
        file_name: latest.fileName,
        started_at: startedAtFromLogName(latest.fileName),
        last_modified: latest.stat.mtime.toISOString(),
        size_bytes: latest.stat.size,
        status,
        summary: logSummary(raw, status),
        tail,
    };
}

function writeOperationalStatus(logDir, outAdminDir) {
    ensureDir(outAdminDir);
    const status = {
        generated_at: new Date().toISOString(),
        source_logs: logDir,
        daily: newestLogEntry(logDir, "local-daily-refresh-", "daily"),
        weekly: newestLogEntry(logDir, "local-weekly-training-", "weekly"),
    };

    writeJsonFile(path.join(outAdminDir, "operational_status.json"), status);
    console.log("operational_status.json written");
}

function todayYmd(date = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: process.env.REPORT_TIME_ZONE || "Europe/Warsaw",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(date);
        const year = parts.find((part) => part.type === "year")?.value;
        const month = parts.find((part) => part.type === "month")?.value;
        const day = parts.find((part) => part.type === "day")?.value;
        if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
        
    }
    return date.toISOString().slice(0, 10);
}

function addCalendarDaysYmd(ymd, deltaDays) {
    const [y, m, d] = ymd.split("-").map(Number);
    const t = Date.UTC(y, m - 1, d);
    return new Date(t + deltaDays * 864e5).toISOString().slice(0, 10);
}

function isYmdInWindow(dateStr, minYmd, maxYmd) {
    return dateStr >= minYmd && (!maxYmd || dateStr <= maxYmd);
}

function copyReportsWindowed(srcReports, destReports) {
    const copyAll = process.env.PREBUILD_COPY_ALL_REPORTS === "1" || process.env.PREBUILD_COPY_ALL_REPORTS === "true";
    if (!fs.existsSync(srcReports)) return { copied: 0, skipped: 0, total: 0 };

    if (copyAll) {
        copyDir(srcReports, destReports);
        const n = fs.readdirSync(srcReports).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).length;
        return { copied: n, skipped: 0, total: n };
    }

    const past = Math.max(0, parseInt(process.env.PREBUILD_REPORT_DAYS_PAST || "30", 10));
    const futureValue = process.env.PREBUILD_REPORT_DAYS_FUTURE;
    const future = futureValue ? Math.max(0, parseInt(futureValue, 10)) : null;
    const today = todayYmd();
    const minYmd = addCalendarDaysYmd(today, -past);
    const maxYmd = future === null ? null : addCalendarDaysYmd(today, future);

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
    console.log("report date range: " + minYmd + " .. " + (maxYmd ?? "open future") + " (" + past + "d back, " + (future === null ? "open future" : future + "d ahead") + ")");
    return { copied, skipped, total: copied + skipped };
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (err) {
        console.warn("warning: could not read " + filePath + " (" + err.message + ")");
        return null;
    }
}

function readPredictionReportForHistory(dateDir) {
    return (
        readJsonIfExists(path.join(dateDir, "predictions_finished.json")) ||
        readJsonIfExists(path.join(dateDir, "predictions_unfinished.json"))
    );
}

function pathInside(parent, candidate) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function copyActiveModelMetadata(sourceModels, outModels) {
    const variants = [
        {
            name: "without_odds",
            pointer: "active_without_odds.json",
            fallbackManifest: "universal_predictor.pkl.manifest.json",
        },
        {
            name: "with_odds",
            pointer: "active_with_odds.json",
            fallbackManifest: "universal_predictor_with_odds.pkl.manifest.json",
        },
    ];
    const active = {};
    ensureDir(outModels);

    for (const variant of variants) {
        const sourcePointer = path.join(sourceModels, variant.pointer);
        const pointer = readJsonIfExists(sourcePointer);
        let manifestRelative = pointer?.manifest || variant.fallbackManifest;
        const sourceManifest = path.resolve(sourceModels, manifestRelative);
        if (!pathInside(sourceModels, sourceManifest)) {
            throw new Error("model manifest escapes source models directory: " + manifestRelative);
        }
        const manifest = readJsonIfExists(sourceManifest);
        if (!manifest) continue;

        if (pointer) {
            if (pointer.variant !== variant.name) {
                throw new Error("active model pointer variant mismatch: " + variant.name);
            }
            if (!pointer.artifact_id || pointer.artifact_id !== manifest.artifact_id) {
                throw new Error("active model pointer artifact ID does not match its manifest: " + variant.name);
            }
            const artifactRelative = pointer.artifact;
            const sourceArtifact = path.resolve(sourceModels, artifactRelative || "");
            if (!artifactRelative || !pathInside(sourceModels, sourceArtifact) || !fs.existsSync(sourceArtifact)) {
                throw new Error("active model pointer references a missing or unsafe artifact: " + variant.name);
            }
            fs.copyFileSync(sourcePointer, path.join(outModels, variant.pointer));
        }
        const destinationManifest = path.join(outModels, manifestRelative);
        ensureDir(path.dirname(destinationManifest));
        fs.copyFileSync(sourceManifest, destinationManifest);
        active[variant.name] = {
            pointer: pointer || null,
            artifact_id: pointer?.artifact_id || manifest.artifact_id || null,
            release_id: pointer?.release_id || manifest?.metadata?.release?.release_id || null,
            manifest: manifestRelative.replace(/\\/g, "/"),
            manifest_version: manifest.version || null,
        };
    }
    return { schema_version: 1, variants: active };
}

function auditPredictionModelReleases(reportsDir, activeModels) {
    const audit = {
        schema_version: 1,
        reports: 0,
        consistent: 0,
        mixed: [],
        mixed_finished: [],
        mixed_unfinished: [],
        legacy: 0,
        stale_unfinished: [],
        quality_complete: 0,
        quality_degraded: 0,
        quality_legacy: 0,
        degraded_unfinished: [],
    };
    if (!fs.existsSync(reportsDir)) return audit;

    const entries = fs.readdirSync(reportsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name));
    for (const entry of entries) {
        const report = readPredictionReportForHistory(path.join(reportsDir, entry.name));
        if (!report) continue;
        audit.reports++;
        const quality = report.prediction_quality;
        if (!quality || quality.status === "legacy") {
            audit.quality_legacy++;
        } else if (quality.status === "degraded") {
            audit.quality_degraded++;
            if (report.status !== "finished") {
                const degradedVariants = Object.entries(quality.variants || {})
                    .filter(([, state]) => state?.status === "degraded")
                    .map(([variantName]) => variantName);
                audit.degraded_unfinished.push({
                    date: entry.name,
                    variants: degradedVariants,
                });
            }
        } else {
            audit.quality_complete++;
        }

        const release = report.model_release;
        if (!release || release.status === "legacy") {
            audit.legacy++;
            continue;
        }
        if (release.status === "mixed") {
            audit.mixed.push(entry.name);
            if (report.status === "finished") {
                audit.mixed_finished.push(entry.name);
            } else {
                audit.mixed_unfinished.push(entry.name);
            }
            continue;
        }
        audit.consistent++;
        if (report.status === "finished") continue;

        const staleVariants = [];
        for (const [variantName, state] of Object.entries(release.variants || {})) {
            const reportArtifactId = state?.artifact?.artifact_id;
            const activeArtifactId = activeModels?.variants?.[variantName]?.artifact_id;
            if (reportArtifactId && activeArtifactId && reportArtifactId !== activeArtifactId) {
                staleVariants.push(variantName);
            }
        }
        if (staleVariants.length > 0) {
            audit.stale_unfinished.push({ date: entry.name, variants: staleVariants });
        }
    }
    return audit;
}

function buildAccuracyHistory(srcReports) {
    const rows = [];
    if (!fs.existsSync(srcReports)) {
        return { generated_at: new Date().toISOString(), dates: rows };
    }

    const entries = fs.readdirSync(srcReports, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const report = readPredictionReportForHistory(path.join(srcReports, entry.name));
        const modelAccuracy = report?.summary?.model_accuracy;
        if (!modelAccuracy || typeof modelAccuracy !== "object") continue;

        const models = {};
        for (const [model, stats] of Object.entries(modelAccuracy)) {
            const correct = Number(stats?.correct ?? 0);
            const total = Number(stats?.total ?? 0);
            const incorrect = Number(stats?.incorrect ?? Math.max(0, total - correct));
            if (!Number.isFinite(correct) || !Number.isFinite(incorrect) || !Number.isFinite(total) || total <= 0) {
                continue;
            }
            models[model] = { correct, incorrect, total };
        }

        if (Object.keys(models).length > 0) {
            rows.push({ date: entry.name, models });
        }
    }

    return {
        generated_at: new Date().toISOString(),
        source_reports: srcReports,
        dates: rows,
    };
}

function writeAccuracyHistory(srcReports, outModelsDir) {
    const history = buildAccuracyHistory(srcReports);
    ensureDir(outModelsDir);
    writeJsonFile(path.join(outModelsDir, "accuracy_history.json"), history);
    console.log("accuracy_history.json written (" + history.dates.length + " dates)");
}

console.log("prebuild: writing trimmed data to " + OUT_DIR + "\n");

if (!fs.existsSync(SOURCE_DATA)) {
    const message = "no SofascoreData/data - cannot create a fresh .data snapshot";
    if (process.env.PREBUILD_ALLOW_MISSING_SOURCE === "1" || process.env.PREBUILD_ALLOW_MISSING_SOURCE === "true") {
        console.log(message + " (allowed for CI smoke builds)\n");
        process.exit(0);
    }
    console.error(message + "\n");
    process.exit(1);
}

const cleanOutput = process.env.PREBUILD_CLEAN !== "0" && process.env.PREBUILD_CLEAN !== "false";
if (cleanOutput) {
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

    const upcoming = copyUpcomingFiles(rawDir, outRawDir);
    totalMatches += upcoming.matches;
    matchBytes += upcoming.bytes;

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

    const upcomingSummary = upcoming.files > 0
        ? ", " + upcoming.matches + " upcoming in " + upcoming.files + " files"
        : "";
    console.log("ok " + dataPath + " (" + trimmed.length + " matches" + upcomingSummary + ")");
}

console.log("\nteam history:");
const teamHistory = copyTeamHistoryFiles(SOURCE_DATA, OUT_DIR);
totalMatches += teamHistory.matches;
matchBytes += teamHistory.bytes;
if (teamHistory.files > 0) {
    console.log("copied " + teamHistory.files + " team files (" + teamHistory.matches + " matches)");
} else {
    console.log("no team_history cache");
}

console.log("\nprediction reports:");
if (fs.existsSync(SOURCE_REPORTS)) {
    const { copied, skipped, total } = copyReportsWindowed(SOURCE_REPORTS, path.join(OUT_DIR, "reports"));
    console.log("copied " + copied + " date folders (" + skipped + " outside window, " + total + " in source tree)");
} else {
    console.log("no SofascoreData/reports");
}

console.log("\nmodel release metadata:");
const outModelsDir = path.join(OUT_DIR, "models");
const activeModelReleases = copyActiveModelMetadata(SOURCE_MODELS, outModelsDir);
const modelReleaseAudit = auditPredictionModelReleases(
    path.join(OUT_DIR, "reports"),
    activeModelReleases,
);
console.log(
    "model contracts: " + modelReleaseAudit.consistent + " consistent, " +
    modelReleaseAudit.legacy + " legacy, " + modelReleaseAudit.mixed.length + " mixed"
);
console.log(
    "prediction inputs: " + modelReleaseAudit.quality_complete + " complete, " +
    modelReleaseAudit.quality_degraded + " degraded, " +
    modelReleaseAudit.quality_legacy + " legacy"
);
if (modelReleaseAudit.mixed_finished.length > 0) {
    console.warn(
        "warning: preserving finished reports with mixed historical model contracts: " +
        modelReleaseAudit.mixed_finished.join(", ")
    );
}
if (
    modelReleaseAudit.mixed_unfinished.length > 0 ||
    modelReleaseAudit.stale_unfinished.length > 0 ||
    modelReleaseAudit.degraded_unfinished.length > 0
) {
    throw new Error(
        "prediction model contract gate failed: mixed unfinished=" +
        modelReleaseAudit.mixed_unfinished.length +
        ", stale unfinished=" + modelReleaseAudit.stale_unfinished.length +
        ", degraded unfinished=" + modelReleaseAudit.degraded_unfinished.length
    );
}

console.log("\naccuracy history:");
writeAccuracyHistory(SOURCE_REPORTS, outModelsDir);

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

console.log("\nmodel diagnostics:");
const diagnosticsJson = path.join(SOURCE_MODELS, "model_diagnostics.json");
if (fs.existsSync(diagnosticsJson)) {
    const outModelsDir = path.join(OUT_DIR, "models");
    ensureDir(outModelsDir);
    fs.copyFileSync(diagnosticsJson, path.join(outModelsDir, "model_diagnostics.json"));
    console.log("model_diagnostics.json copied");
} else {
    console.log("no model_diagnostics.json");
}

console.log("\noperational status:");
if (fs.existsSync(SOURCE_LOGS)) {
    writeOperationalStatus(SOURCE_LOGS, path.join(OUT_DIR, "admin"));
} else {
    console.log("no logs directory");
}

const totalBytes = matchBytes + playerBytes;
writeJsonFile(MANIFEST_PATH, {
    generated_at: new Date().toISOString(),
    source_data: SOURCE_DATA,
    source_reports: SOURCE_REPORTS,
    clean_output: cleanOutput,
    active_model_releases: activeModelReleases,
    prediction_model_contracts: modelReleaseAudit,
    competitions: COMPETITIONS.length,
    matches: totalMatches,
    player_rows: totalPlayers,
    bytes: {
        match_json: matchBytes,
        player_json: playerBytes,
        total_json_no_reports: totalBytes,
    },
});
console.log("");
console.log("summary");
console.log("competitions: " + COMPETITIONS.length);
console.log("matches: " + totalMatches.toLocaleString("en-US"));
console.log("player rows: " + totalPlayers.toLocaleString("en-US"));
console.log("match json: " + (matchBytes / 1024 / 1024).toFixed(1) + " MB");
console.log("player json: " + (playerBytes / 1024 / 1024).toFixed(1) + " MB");
console.log("json total (no reports): " + (totalBytes / 1024 / 1024).toFixed(1) + " MB");
console.log("output: " + OUT_DIR);
