import path from "node:path";
import { execFileSync } from "node:child_process";
import {
    REPO_ROOT,
    frozenAppEnv,
    loadFrozenSnapshot,
    resolveDataDir,
} from "./lib/thesis-demo.mjs";

const dataDir = resolveDataDir();
const manifest = loadFrozenSnapshot(dataDir);
const nextBin = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
const distDir = process.env.NEXT_DIST_DIR || "next-build-thesis-demo";

console.log(`Building frozen thesis demo from ${dataDir}`);
console.log(`Reference date and hard cutoff: ${manifest.data_cutoff}\n`);

execFileSync(process.execPath, [nextBin, "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: frozenAppEnv(dataDir, manifest, { NEXT_DIST_DIR: distDir }),
});
