import fs from "fs";

export function readJson<T>(filePath: string): T | null {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(
                `readJson failed for ${filePath}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
        return null;
    }
}
