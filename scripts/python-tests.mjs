import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const executableNames = process.platform === "win32"
    ? ["python.exe", "python"]
    : ["python3", "python"];
const candidates = [
    process.env.PYTHON,
    path.join(root, ".venv", process.platform === "win32" ? "Scripts" : "bin", executableNames[0]),
    path.join(root, "SofascoreData", ".venv", process.platform === "win32" ? "Scripts" : "bin", executableNames[0]),
    ...executableNames,
].filter(Boolean);

let python = null;
for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["--version"], { cwd: root, encoding: "utf-8" });
    if (!probe.error && probe.status === 0) {
        python = candidate;
        break;
    }
}

if (!python) {
    console.error("No Python runtime found for Backend v2.1 tests.");
    process.exit(1);
}

const result = spawnSync(
    python,
    ["-m", "unittest", "discover", "-s", "SofascoreData/tests", "-p", "test_*.py"],
    {
        cwd: root,
        stdio: "inherit",
        env: {
            ...process.env,
            PYTHONPATH: [path.join(root, "SofascoreData"), process.env.PYTHONPATH]
                .filter(Boolean)
                .join(path.delimiter),
        },
    },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);