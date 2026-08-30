import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
    DEFAULT_CONFIG_PATH,
    DEFAULT_DEMO_DATA_DIR,
    REPO_ROOT,
    readJson,
} from "./lib/thesis-demo.mjs";

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (!["--source-root", "--output-dir", "--config", "--models-dir"].includes(argument)) {
            throw new Error(`Unknown argument: ${argument}`);
        }
        if (!argv[index + 1]) throw new Error(`${argument} requires a value`);
        options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = argv[++index];
    }
    return options;
}

function hasSnapshotSource(candidate) {
    return fs.existsSync(path.join(candidate, "data")) &&
        fs.existsSync(path.join(candidate, "reports"));
}

function resolveSourceRoot(explicitRoot) {
    const candidates = [
        explicitRoot,
        process.env.THESIS_SOURCE_ROOT,
        path.join(path.dirname(REPO_ROOT), "SportWebApp-daily-stable", "SofascoreData"),
        path.join(path.dirname(path.dirname(REPO_ROOT)), "SportWebApp-daily-stable", "SofascoreData"),
    ].filter(Boolean).map((candidate) => path.resolve(REPO_ROOT, candidate));
    const sourceRoot = [...new Set(candidates)].find(hasSnapshotSource);
    if (sourceRoot) return sourceRoot;
    throw new Error("Missing thesis snapshot source. Checked:\n" + candidates.join("\n"));
}

function gitValue(checkout, args) {
    try {
        return execFileSync("git", ["-C", checkout, ...args], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        return null;
    }
}

function walkFiles(root) {
    const files = [];
    if (!fs.existsSync(root)) return files;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(entryPath));
        else if (entry.isFile()) files.push(entryPath);
    }
    return files;
}

function verifyMatchArray(matches, cutoff, context, state) {
    if (!Array.isArray(matches)) return;
    for (const match of matches) {
        if (typeof match?.date !== "string") continue;
        const date = match.date.slice(0, 10);
        if (date > cutoff) {
            throw new Error(`Post-cutoff match ${date} found in ${context}`);
        }
        state.matchDates.push(date);
        state.matches++;
    }
}

function verifyFrozenOutput(outputDir, cutoff) {
    const state = { matches: 0, matchDates: [], reports: [] };
    const files = walkFiles(outputDir);
    for (const filePath of files) {
        const relative = path.relative(outputDir, filePath).replace(/\\/g, "/");
        const reportMatch = relative.match(/^reports\/(\d{4}-\d{2}-\d{2})\//);
        if (reportMatch) {
            if (reportMatch[1] > cutoff) {
                throw new Error(`Post-cutoff report directory found: ${reportMatch[1]}`);
            }
            state.reports.push(reportMatch[1]);
        }

        const matchContainer = relative.includes("/raw/all_seasons.json") ||
            relative.includes("/raw/upcoming/") ||
            /^team_history\/\d+\.json$/.test(relative) ||
            /^reports\/\d{4}-\d{2}-\d{2}\/predictions_(?:finished|unfinished)\.json$/.test(relative);
        if (!matchContainer || !filePath.endsWith(".json")) continue;
        verifyMatchArray(readJson(filePath).matches, cutoff, relative, state);
    }

    const accuracyPath = path.join(outputDir, "models", "accuracy_history.json");
    if (fs.existsSync(accuracyPath)) {
        for (const row of readJson(accuracyPath).dates || []) {
            if (row.date > cutoff) throw new Error(`Post-cutoff accuracy row found: ${row.date}`);
        }
    }

    const reportDates = [...new Set(state.reports)].sort();
    return {
        matches_checked: state.matches,
        match_date_min: state.matchDates.sort().at(0) ?? null,
        match_date_max: state.matchDates.sort().at(-1) ?? null,
        report_directories: reportDates.length,
        report_date_min: reportDates.at(0) ?? null,
        report_date_max: reportDates.at(-1) ?? null,
    };
}

function fileSha256(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeChecksums(outputDir) {
    const checksumPath = path.join(outputDir, "checksums.sha256");
    const files = walkFiles(outputDir).filter((filePath) => filePath !== checksumPath).sort();
    const lines = files.map((filePath) => (
        `${fileSha256(filePath)}  ${path.relative(outputDir, filePath).replace(/\\/g, "/")}`
    ));
    fs.writeFileSync(checksumPath, lines.join("\n") + "\n", "utf-8");
    return files;
}

const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(REPO_ROOT, args.config || DEFAULT_CONFIG_PATH);
const config = readJson(configPath);
const sourceRoot = resolveSourceRoot(args.sourceRoot);
const outputDir = path.resolve(REPO_ROOT, args.outputDir || process.env.THESIS_DEMO_DATA_DIR || DEFAULT_DEMO_DATA_DIR);
const modelsDir = path.resolve(REPO_ROOT, args.modelsDir || path.join(sourceRoot, "data", "models"));
const dataCutoff = config.data_cutoff;
const referenceDate = config.data_cutoff;

console.log(`Creating frozen thesis demo: ${config.snapshot_id}`);
console.log(`Source: ${sourceRoot}`);
console.log(`Output: ${outputDir}`);
console.log(`Data cutoff: ${dataCutoff}\n`);

execFileSync(process.execPath, ["scripts/prebuild.mjs"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
        ...process.env,
        PREBUILD_SOURCE_DATA_DIR: path.join(sourceRoot, "data"),
        PREBUILD_SOURCE_REPORTS_DIR: path.join(sourceRoot, "reports"),
        PREBUILD_SOURCE_MODELS_DIR: modelsDir,
        PREBUILD_OUT_DIR: outputDir,
        PREBUILD_DATA_CUTOFF: dataCutoff,
        PREBUILD_REPORT_START: config.analysis_start,
        PREBUILD_COPY_ALL_REPORTS: "1",
        PREBUILD_INCLUDE_OPERATIONAL_STATUS: "0",
        PREBUILD_CLEAN: "1",
    },
});

const verification = verifyFrozenOutput(outputDir, dataCutoff);
const appStatus = gitValue(REPO_ROOT, ["status", "--porcelain"]);
const manifest = {
    schema_version: 1,
    mode: "frozen-demo",
    snapshot_id: config.snapshot_id,
    analysis_start: config.analysis_start,
    analysis_end: config.analysis_end,
    data_cutoff: dataCutoff,
    reference_date: referenceDate,
    generated_at: new Date().toISOString(),
    source_name: path.basename(sourceRoot),
    source_models_name: path.basename(modelsDir),
    source_git_commit: gitValue(path.dirname(sourceRoot), ["rev-parse", "HEAD"]),
    app_git_commit: gitValue(REPO_ROOT, ["rev-parse", "HEAD"]),
    app_worktree_dirty: appStatus === null ? null : appStatus.length > 0,
    verification,
};
fs.writeFileSync(
    path.join(outputDir, ".frozen-snapshot.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
);
const files = writeChecksums(outputDir);

if (manifest.app_worktree_dirty === true) {
    console.warn("warning: app worktree is dirty; regenerate the final immutable snapshot after committing");
} else if (manifest.app_worktree_dirty === null) {
    console.warn("warning: app worktree cleanliness could not be determined");
}
console.log("\nFrozen demo verified.");
console.log(`Files checksummed: ${files.length}`);
console.log(`Latest match date: ${verification.match_date_max}`);
console.log(`Report range: ${verification.report_date_min} .. ${verification.report_date_max}`);
console.log(`Run: npm run dev:thesis-demo`);
