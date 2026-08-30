import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const DEFAULT_CONFIG_PATH = path.join(
    REPO_ROOT,
    "SofascoreData",
    "thesis",
    "snapshot_2026-07-19.json",
);
export const DEFAULT_DEMO_DATA_DIR = path.join(
    path.dirname(REPO_ROOT),
    "SportWebApp-thesis-demo-2026-07-19",
    "app-data",
);

export function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function resolveDataDir(argv = process.argv.slice(2)) {
    const index = argv.indexOf("--data-dir");
    if (index >= 0) {
        if (!argv[index + 1]) throw new Error("--data-dir requires a path");
        return path.resolve(REPO_ROOT, argv[index + 1]);
    }
    return path.resolve(
        REPO_ROOT,
        process.env.THESIS_DEMO_DATA_DIR || DEFAULT_DEMO_DATA_DIR,
    );
}

export function forwardedNextArgs(argv = process.argv.slice(2)) {
    const result = [];
    for (let index = 0; index < argv.length; index++) {
        if (argv[index] === "--data-dir") {
            index++;
            continue;
        }
        result.push(argv[index]);
    }
    return result;
}

export function loadFrozenSnapshot(dataDir) {
    const manifestPath = path.join(dataDir, ".frozen-snapshot.json");
    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            `Missing frozen snapshot manifest: ${manifestPath}\n` +
            "Run npm run snapshot:thesis-demo first.",
        );
    }
    const manifest = readJson(manifestPath);
    if (manifest?.mode !== "frozen-demo" || !manifest.data_cutoff || !manifest.reference_date) {
        throw new Error(`Invalid frozen snapshot manifest: ${manifestPath}`);
    }
    if (!fs.existsSync(path.join(dataDir, "reports"))) {
        throw new Error(`Frozen snapshot has no reports directory: ${dataDir}`);
    }
    return manifest;
}

export function frozenAppEnv(dataDir, manifest, overrides = {}) {
    return {
        ...process.env,
        SOFASCORE_DATA_DIR: dataDir,
        SOFASCORE_REPORTS_DIR: path.join(dataDir, "reports"),
        APP_DATA_CUTOFF: manifest.data_cutoff,
        APP_REFERENCE_DATE: manifest.reference_date,
        REPORT_WINDOW_DISABLED: "1",
        ...overrides,
    };
}
