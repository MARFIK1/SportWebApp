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

const stableRoot = resolveStableRoot();
const stableData = path.join(stableRoot, "SofascoreData", "data");
const stableReports = path.join(stableRoot, "SofascoreData", "reports");

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
