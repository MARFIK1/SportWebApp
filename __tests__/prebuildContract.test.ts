import fs from "fs";
import path from "path";

function readRepoFile(relativePath: string): string {
    return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

describe("prebuild data contract", () => {
    it("keeps prebuild competition paths in sync with leagueRegistry", () => {
        const registry = readRepoFile("app/util/league/leagueRegistry.ts");
        const prebuild = readRepoFile("scripts/prebuild.mjs");

        const registryPaths = Array.from(registry.matchAll(/dataPath:\s*"([^"]+)"/g), (m) => m[1]).sort();
        const prebuildPaths = Array.from(prebuild.matchAll(/"((?:league|cups|european|international)\/[^"]+)"/g), (m) => m[1]).sort();

        expect(prebuildPaths).toEqual(registryPaths);
    });

    it("publishes active model metadata and rejects unsafe unfinished report contracts", () => {
        const prebuild = readRepoFile("scripts/prebuild.mjs");

        expect(prebuild).toContain("active_without_odds.json");
        expect(prebuild).toContain("active_with_odds.json");
        expect(prebuild).toContain("prediction model contract gate failed");
        expect(prebuild).toContain("mixed_finished");
        expect(prebuild).toContain("mixed_unfinished");
        expect(prebuild).toContain("stale_unfinished");
        expect(prebuild).toContain("degraded_unfinished");
        expect(prebuild).toContain("prediction inputs:");
        expect(prebuild).toContain("active_model_releases");
        expect(prebuild).toContain("prediction_model_contracts");
    });
});