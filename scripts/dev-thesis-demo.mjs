import path from "node:path";
import { spawn } from "node:child_process";
import {
    REPO_ROOT,
    forwardedNextArgs,
    frozenAppEnv,
    loadFrozenSnapshot,
    resolveDataDir,
} from "./lib/thesis-demo.mjs";

const dataDir = resolveDataDir();
const manifest = loadFrozenSnapshot(dataDir);
const nextBin = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");

console.log(`Using frozen thesis data: ${dataDir}`);
console.log(`Reference date and hard cutoff: ${manifest.data_cutoff}\n`);

const child = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", ...forwardedNextArgs()],
    {
        cwd: REPO_ROOT,
        env: frozenAppEnv(dataDir, manifest),
        stdio: "inherit",
    },
);

child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
});
