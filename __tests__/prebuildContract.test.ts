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
});
