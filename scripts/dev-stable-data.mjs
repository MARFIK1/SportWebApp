import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const stableRoot = process.env.SPORTWEBAPP_STABLE_ROOT ||
    path.join(path.dirname(repoRoot), "SportWebApp-daily-stable");
const stableData = path.join(stableRoot, "SofascoreData", "data");
const stableReports = path.join(stableRoot, "SofascoreData", "reports");

for (const dir of [stableData, stableReports]) {
    if (!fs.existsSync(dir)) {
        console.error(`Missing stable data directory: ${dir}`);
        process.exit(1);
    }
}

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
