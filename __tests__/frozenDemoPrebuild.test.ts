import fs from "node:fs";
import path from "node:path";
import rawSnapshotHelpers from "../scripts/lib/prebuild-snapshot.cjs";

const snapshotHelpers = rawSnapshotHelpers as {
    filterMatchesByCutoff: <T extends { date: string }>(
        matches: T[],
        cutoff: string | null,
        context: string,
    ) => { matches: T[]; removed: number };
    parseOptionalYmd: (value: string | undefined, name: string) => string | null;
    resolveReportBounds: (options: {
        copyAll: boolean;
        past: number;
        future: number | null;
        today: string;
        cutoff: string | null;
        start: string | null;
    }) => { minYmd: string | null; maxYmd: string | null };
    isYmdWithinBounds: (value: string, minYmd: string | null, maxYmd: string | null) => boolean;
    seasonEndYear: (value: string) => number | null;
    selectLatestPlayerCandidate: (
        candidates: Array<{ fileName: string; year: number | null }>,
        latestMatchYear: number,
    ) => string | null;
    sanitizeExportMetadata: <T>(value: T) => T;
};

describe("frozen demo prebuild helpers", () => {
    it("uses an inclusive match cutoff", () => {
        const source = [
            { id: 1, date: "2026-07-18" },
            { id: 2, date: "2026-07-19T20:00:00Z" },
            { id: 3, date: "2026-07-20" },
        ];

        expect(snapshotHelpers.filterMatchesByCutoff(source, "2026-07-19", "fixture")).toEqual({
            matches: source.slice(0, 2),
            removed: 1,
        });
    });

    it("rejects malformed cutoff values and match dates", () => {
        expect(() => snapshotHelpers.parseOptionalYmd("2026-02-30", "CUTOFF")).toThrow("CUTOFF");
        expect(() => snapshotHelpers.filterMatchesByCutoff(
            [{ date: "unknown" }],
            "2026-07-19",
            "fixture",
        )).toThrow("fixture");
    });

    it("keeps report copy-all mode inside hard thesis bounds", () => {
        const bounds = snapshotHelpers.resolveReportBounds({
            copyAll: true,
            past: 30,
            future: null,
            today: "2026-08-30",
            cutoff: "2026-07-19",
            start: "2026-04-01",
        });

        expect(bounds).toEqual({ minYmd: "2026-04-01", maxYmd: "2026-07-19" });
        expect(snapshotHelpers.isYmdWithinBounds("2026-07-19", bounds.minYmd, bounds.maxYmd)).toBe(true);
        expect(snapshotHelpers.isYmdWithinBounds("2026-07-20", bounds.minYmd, bounds.maxYmd)).toBe(false);
    });

    it("selects the latest player season that does not end after retained matches", () => {
        const candidates = [
            { fileName: "players_24_25.json", year: snapshotHelpers.seasonEndYear("League 24/25") },
            { fileName: "players_25_26.json", year: snapshotHelpers.seasonEndYear("League 25/26") },
            { fileName: "players_26_27.json", year: snapshotHelpers.seasonEndYear("League 26/27") },
        ];

        expect(snapshotHelpers.selectLatestPlayerCandidate(candidates, 2026)).toBe("players_25_26.json");
    });

    it("removes host-specific paths from exported metadata", () => {
        expect(snapshotHelpers.sanitizeExportMetadata({
            artifact: path.win32.join("C:\\", "Users", "example", "models", "predictor.pkl"),
            nested: [path.posix.join("/", "home", "example", "reports", "diagnostics.csv"), "models/predictor.pkl"],
        })).toEqual({
            artifact: "<external>/predictor.pkl",
            nested: ["<external>/diagnostics.csv", "models/predictor.pkl"],
        });
    });

    it("wires the hard bounds and exported accuracy history into prebuild", () => {
        const prebuild = fs.readFileSync(path.join(process.cwd(), "scripts", "prebuild.mjs"), "utf-8");
        const createDemo = fs.readFileSync(path.join(process.cwd(), "scripts", "create-thesis-demo.mjs"), "utf-8");
        const homePage = fs.readFileSync(path.join(process.cwd(), "app", "page.tsx"), "utf-8");
        expect(prebuild).toContain("PREBUILD_DATA_CUTOFF");
        expect(prebuild).toContain("PREBUILD_REPORT_START");
        expect(prebuild).toContain("filterMatchesByCutoff");
        expect(prebuild).toContain('writeAccuracyHistory(path.join(OUT_DIR, "reports")');
        expect(prebuild).not.toContain("source_data: SOURCE_DATA");
        expect(prebuild).not.toContain("source_reports: SOURCE_REPORTS");
        expect(prebuild).not.toContain("source_models: SOURCE_MODELS");
        expect(createDemo).not.toContain("source_root: sourceRoot");
        expect(createDemo).not.toContain("source_models: modelsDir");
        expect(homePage).toContain(".filter(isWithinAppDataCutoff)");
    });
});
