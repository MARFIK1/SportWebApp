import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SOURCE_DATA_PATH = path.join(ROOT, "SofascoreData", "data");
const PREBUILT_DATA_PATH = path.join(ROOT, ".data");
const DATA_BUILD_PATH = process.env.SOFASCORE_DATA_BUILD_DIR ||
    path.join(os.tmpdir(), "sportwebapp-data-build");
const NEXT_BUILD_PATH = process.env.NEXT_DIST_DIR || (process.env.VERCEL ? ".next" : "next-build");
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

let dataDir = DATA_BUILD_PATH;

if (fs.existsSync(SOURCE_DATA_PATH)) {
    execFileSync(process.execPath, ["scripts/prebuild.mjs"], {
        cwd: ROOT,
        stdio: "inherit",
        env: {
            ...process.env,
            PREBUILD_OUT_DIR: DATA_BUILD_PATH,
            PREBUILD_CLEAN: "1",
        },
    });
} else if (fs.existsSync(PREBUILT_DATA_PATH)) {
    dataDir = PREBUILT_DATA_PATH;
    console.log("build-prod: using prebuilt .data snapshot\n");
} else {
    console.error("build-prod: missing SofascoreData/data and .data snapshot\n");
    process.exit(1);
}

execFileSync(process.execPath, [nextBin, "build"], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
        ...process.env,
        SOFASCORE_DATA_DIR: dataDir,
        NEXT_DIST_DIR: NEXT_BUILD_PATH,
    },
});
