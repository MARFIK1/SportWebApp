// Deploys production to the fixed Vercel project/domain using a temp staging copy with local .data.
// Run npm run build:prod first.

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEFAULT_DATA_BUILD_SOURCE = path.join(os.tmpdir(), "sportwebapp-data-build");
const EXPLICIT_DATA_BUILD_SOURCE = process.env.SOFASCORE_DATA_BUILD_DIR
    ? path.resolve(process.env.SOFASCORE_DATA_BUILD_DIR)
    : null;
const PREBUILT_DATA_SOURCE = path.join(ROOT, ".data");
const VERCEL_PROJECT = "sport-web-app";
const VERCEL_SCOPE = "sportwebapp-project";
const VERCEL_PROD_DOMAIN = "sport-web-app-eight.vercel.app";
const LOCAL_VERCEL_LINK = path.join(ROOT, ".vercel", "project.json");
const STAGING = path.join(os.tmpdir(), "sportwebapp-vercel-" + crypto.randomBytes(16).toString("hex"));

function fail(message) {
    throw new Error(message);
}

function readSnapshotGeneratedAt(snapshotPath) {
    const manifestPath = path.join(snapshotPath, ".prebuild-manifest.json");
    if (!fs.existsSync(manifestPath)) return 0;

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const generatedAt = Date.parse(manifest.generated_at || "");
        return Number.isFinite(generatedAt) ? generatedAt : 0;
    } catch {
        return 0;
    }
}

function snapshotMtime(snapshotPath) {
    try {
        return fs.statSync(snapshotPath).mtimeMs;
    } catch {
        return 0;
    }
}

function resolveDataSource() {
    if (EXPLICIT_DATA_BUILD_SOURCE) {
        return EXPLICIT_DATA_BUILD_SOURCE;
    }

    return [DEFAULT_DATA_BUILD_SOURCE, PREBUILT_DATA_SOURCE]
        .filter((candidate) => fs.existsSync(candidate))
        .sort((a, b) => {
            const generatedAtDelta = readSnapshotGeneratedAt(b) - readSnapshotGeneratedAt(a);
            if (generatedAtDelta !== 0) return generatedAtDelta;
            return snapshotMtime(b) - snapshotMtime(a);
        })[0] ?? PREBUILT_DATA_SOURCE;
}

const DATA_SOURCE = resolveDataSource();

function shouldSkipSrc(src) {
    const rel = path.relative(ROOT, src);
    if (!rel) return false;
    const norm = rel.split(path.sep).join("/");
    const first = norm.split("/")[0];
    const skipRoots = new Set([
        "node_modules",
        ".next",
        "next-build",
        ".git",
        ".data",
        ".data-build",
        ".vercel-deploy-staging",
        ".venv",
        ".vscode",
        "SofascoreData",
        "logs",
        "coverage",
    ]);
    if (skipRoots.has(first)) return true;
    if (norm.split("/").includes("node_modules")) return true;
    if (first.startsWith(".data.stale-")) return true;
    if (first === ".env" || norm.startsWith(".env.")) return true;
    return false;
}

function patchGitignore(stagingRoot) {
    const p = path.join(stagingRoot, ".gitignore");
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => {
        const t = line.trim();
        if (t === "/.data/" || t === ".data/" || t === ".data") return false;
        if (t === "/public/team-logos/" || t === "public/team-logos/" || t === "public/team-logos") return false;
        return true;
    });
    fs.writeFileSync(p, lines.join("\n").replace(/\n*$/, "\n"));
}

function redactToken(value) {
    if (!process.env.VERCEL_TOKEN) return value;
    return value.replaceAll(process.env.VERCEL_TOKEN, "[redacted]");
}

function readProjectLink(linkPath) {
    if (!fs.existsSync(linkPath)) {
        fail(`Vercel link missing: ${linkPath}`);
    }

    let link;
    try {
        link = JSON.parse(fs.readFileSync(linkPath, "utf-8"));
    } catch {
        fail(`invalid Vercel project link file: ${linkPath}`);
    }

    if (!link || typeof link !== "object" || !link.projectId || !link.orgId) {
        fail(`invalid Vercel project link content in: ${linkPath}`);
    }

    return link;
}

function runVercel(args) {
    const tokenArg = process.env.VERCEL_TOKEN
        ? ` --token "${process.env.VERCEL_TOKEN.replaceAll('"', '\\"')}"`
        : "";
    const command = `npx --yes vercel ${args.join(" ")}${tokenArg}`;

    console.log(redactToken(command) + "\n");

    execSync(command, {
        cwd: STAGING,
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "1" },
    });
}

function ensureProjectLink() {
    const linkPath = path.join(STAGING, ".vercel", "project.json");
    const expected = readProjectLink(LOCAL_VERCEL_LINK);
    const link = readProjectLink(linkPath);

    if (link.projectId !== expected.projectId || link.orgId !== expected.orgId) {
        fail(
            `refusing to deploy to unexpected Vercel project: ` +
            `projectId=${link.projectId}, orgId=${link.orgId}`
        );
    }
}

function cleanupStaging() {
    if (!fs.existsSync(STAGING)) return;

    try {
        fs.rmSync(STAGING, {
            recursive: true,
            force: true,
            maxRetries: 12,
            retryDelay: 250,
        });
    } catch (error) {
        const code = error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        if (code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY") {
            console.warn(`warning: could not remove temporary staging dir (${code}): ${STAGING}`);
            return;
        }
        throw error;
    }
}

console.log("staging copy for Vercel (.data included, no node_modules / full SofascoreData)\n");
console.log(`using data snapshot: ${DATA_SOURCE}\n`);

try {
    if (!fs.existsSync(DATA_SOURCE)) {
        fail("missing data snapshot - run npm run build:prod first");
    }

    fs.cpSync(ROOT, STAGING, {
        recursive: true,
        filter: (src) => !shouldSkipSrc(src),
    });
    fs.cpSync(DATA_SOURCE, path.join(STAGING, ".data"), { recursive: true });

    patchGitignore(STAGING);

    const dataPath = path.join(STAGING, ".data");
    if (!fs.existsSync(dataPath)) {
        fail("missing .data - run npm run build:prod first");
    }

    const manifestPath = path.join(dataPath, ".prebuild-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        fail("missing .data prebuild manifest - run npm run build:prod with local SofascoreData/data first");
    }

    runVercel(["link", "--yes", "--project", VERCEL_PROJECT, "--scope", VERCEL_SCOPE]);
    ensureProjectLink();

    runVercel(["deploy", "--prod", "--yes", "--scope", VERCEL_SCOPE]);
    runVercel(["inspect", VERCEL_PROD_DOMAIN, "--scope", VERCEL_SCOPE]);

    console.log(`\ndone. production: https://${VERCEL_PROD_DOMAIN}\n`);
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${message}\n`);
    process.exitCode = 1;
} finally {
    cleanupStaging();
}
