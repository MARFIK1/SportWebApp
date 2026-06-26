import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function hasStableData(root) {
    return fs.existsSync(path.join(root, "SofascoreData", "data")) &&
        fs.existsSync(path.join(root, "SofascoreData", "reports"));
}

function resolveStableRoot() {
    const candidates = [
        process.env.SPORTWEBAPP_STABLE_ROOT,
        path.join(path.dirname(repoRoot), "SportWebApp-daily-stable"),
        path.join(path.dirname(path.dirname(repoRoot)), "SportWebApp-daily-stable"),
    ].filter(Boolean);
    const uniqueCandidates = [...new Set(candidates)];
    const found = uniqueCandidates.find(hasStableData);

    if (found) return found;

    console.error("Missing stable data directory. Checked:");
    for (const candidate of uniqueCandidates) {
        console.error(`- ${path.join(candidate, "SofascoreData", "data")}`);
        console.error(`- ${path.join(candidate, "SofascoreData", "reports")}`);
    }
    process.exit(1);
}

function syncStableTeamLogos(stableRoot) {
    if (process.env.SKIP_STABLE_LOGO_SYNC === "1") return;

    const sourceDir = path.join(stableRoot, "public", "team-logos");
    const targetDir = path.join(repoRoot, "public", "team-logos");

    if (!fs.existsSync(sourceDir)) return;

    fs.mkdirSync(targetDir, { recursive: true });

    let copied = 0;
    let skipped = 0;
    const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;

        const extension = path.extname(entry.name).toLowerCase();
        if (!supportedExtensions.has(extension)) continue;

        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        const sourceStats = fs.statSync(sourcePath);
        const targetStats = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
        const shouldCopy = !targetStats ||
            sourceStats.size !== targetStats.size ||
            sourceStats.mtimeMs > targetStats.mtimeMs + 1000;

        if (!shouldCopy) {
            skipped += 1;
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
        copied += 1;
    }

    console.log(`Using stable team logos: ${sourceDir}`);
    console.log(`Synced stable team logos: copied ${copied}, already current ${skipped}`);
}

const stableRoot = resolveStableRoot();
const stableData = path.join(stableRoot, "SofascoreData", "data");
const stableReports = path.join(stableRoot, "SofascoreData", "reports");
syncStableTeamLogos(stableRoot);

const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const forwardedArgs = process.argv.slice(2);
const env = {
    ...process.env,
    SOFASCORE_DATA_DIR: stableData,
    SOFASCORE_REPORTS_DIR: stableReports,
};

console.log(`Using stable data: ${stableData}`);
console.log(`Using stable reports: ${stableReports}`);

const child = spawn(process.execPath, [nextBin, "dev", "--webpack", ...forwardedArgs], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
});

child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
});
