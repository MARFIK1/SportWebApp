import fs from "fs";

export function readJson<T>(filePath: string): T | null {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}
