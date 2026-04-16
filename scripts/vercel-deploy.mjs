// Deploy to Vercel with local .data (the CLI respects .gitignore so .data would be skipped otherwise).
// Copies the tree to a temp folder outside the repo (fs.cpSync cannot copy into a subfolder of the source),
// patches /.data/ out of .gitignore in the copy, runs npx vercel deploy --prod --yes.
// Run npm run build:prod first. One-time: npx vercel login, npx vercel link.

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function shouldSkipSrc(src) {
    const rel = path.relative(ROOT, src);
    if (!rel) return false;
    const norm = rel.split(path.sep).join("/");
    const first = norm.split("/")[0];
    const skipRoots = new Set([
        "node_modules",
        ".next",
        ".git",
        ".vercel-deploy-staging",
        "SofascoreData",
        "coverage",
    ]);
    if (skipRoots.has(first)) return true;
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

const STAGING = fs.mkdtempSync(path.join(os.tmpdir(), "sportwebapp-vercel-"));

try {
    fs.cpSync(ROOT, STAGING, {
        recursive: true,
        filter: (src) => !shouldSkipSrc(src),
    });

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

    console.log("npx vercel deploy --prod --yes\n");

    execSync("npx vercel deploy --prod --yes", {
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
