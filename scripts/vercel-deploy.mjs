// Deploy to Vercel with local .data (the CLI respects .gitignore so .data would be skipped otherwise).
// Copies the tree to a temp folder outside the repo (fs.cpSync cannot copy into a subfolder of the source),
// patches /.data/ out of .gitignore in the copy, runs npx --yes vercel deploy --prod --yes.
// Run npm run build:prod first. One-time: npx vercel login, npx vercel link.

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_BUILD_SOURCE = process.env.SOFASCORE_DATA_BUILD_DIR ||
    path.join(os.tmpdir(), "sportwebapp-data-build");
const DATA_SOURCE = fs.existsSync(DATA_BUILD_SOURCE)
    ? DATA_BUILD_SOURCE
    : path.join(ROOT, ".data");

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
        "SofascoreData",
        "coverage",
    ]);
    if (skipRoots.has(first)) return true;
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
        return true;
    });
    fs.writeFileSync(p, lines.join("\n").replace(/\n*$/, "\n"));
}

console.log("staging copy for Vercel (.data included, no node_modules / full SofascoreData)\n");

const STAGING = path.join(os.tmpdir(), "sportwebapp-vercel-" + crypto.randomBytes(16).toString("hex"));

try {
    if (!fs.existsSync(DATA_SOURCE)) {
        console.error("missing data snapshot - run npm run build:prod first\n");
        process.exit(1);
    }

    fs.cpSync(ROOT, STAGING, {
        recursive: true,
        filter: (src) => !shouldSkipSrc(src),
    });
    fs.cpSync(DATA_SOURCE, path.join(STAGING, ".data"), { recursive: true });

    patchGitignore(STAGING);

    const dataPath = path.join(STAGING, ".data");
    if (!fs.existsSync(dataPath)) {
        console.error("missing .data - run npm run build:prod first\n");
        try {
            fs.rmSync(STAGING, { recursive: true, force: true });
        } catch {
            // ignore
        }
        process.exit(1);
    }

    const manifestPath = path.join(dataPath, ".prebuild-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        console.error("missing .data prebuild manifest - run npm run build:prod with local SofascoreData/data first\n");
        try {
            fs.rmSync(STAGING, { recursive: true, force: true });
        } catch {
            // ignore
        }
        process.exit(1);
    }

    const tokenArg = process.env.VERCEL_TOKEN
        ? ` --token "${process.env.VERCEL_TOKEN.replaceAll('"', '\\"')}"`
        : "";
    const command = `npx --yes vercel deploy --prod --yes${tokenArg}`;

    console.log("npx --yes vercel deploy --prod --yes" + (process.env.VERCEL_TOKEN ? " --token [redacted]" : "") + "\n");

    execSync(command, {
        cwd: STAGING,
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "1" },
    });

    console.log("\ndone.\n");
} finally {
    try {
        fs.rmSync(STAGING, { recursive: true, force: true });
    } catch {
        // ignore
    }
}
