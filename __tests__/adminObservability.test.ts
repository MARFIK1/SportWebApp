import {
    classifyOperationalLog,
    summarizeLineupUsage,
    summarizeOperationalLog,
} from "@/app/util/data/predictionService";
import type { MatchLineupsArtifact } from "@/types/matchLineups";
import type { PredictionReport } from "@/types/predictions";

const FULL_SUCCESS_LOG = [
    "==> Fetch upcoming matches and predict 2026-08-16",
    "==> Build production bundle",
    "==> Deploy to Vercel",
    "Local daily refresh finished successfully.",
    "Windows PowerShell transcript end",
].join("\n");

const PARTIAL_WARNING_LOG = [
    "==> Update finished report 2026-08-14",
    "WARNING: Update finished report 2026-08-14 failed with exit code 1, continuing",
    "WARNING: Stopping live Sofascore refresh after update for 2026-08-14 failed. Build/deploy will continue with existing reports.",
    "==> Build production bundle",
    "Local daily refresh finished successfully.",
    "Windows PowerShell transcript end",
].join("\n");

const FAILED_LOG = [
    "==> Fetch upcoming matches and predict 2026-08-16",
    "Local daily refresh failed: Build production bundle failed with exit code 1",
    "Windows PowerShell transcript end",
].join("\n");

const LINEUP_NOOP_LOG = [
    "==> Refresh confirmed lineups",
    "Prediction report did not change; build and deployment are not needed.",
    "Windows PowerShell transcript end",
].join("\n");

const LINEUP_SUCCESS_LOG = [
    "==> Refresh confirmed lineups",
    "Lineup-aware prediction report changed.",
    "Lineup refresh, build, and deployment finished successfully.",
    "Windows PowerShell transcript end",
].join("\n");

describe("classifyOperationalLog", () => {
    it("classifies a clean run as success", () => {
        expect(classifyOperationalLog(FULL_SUCCESS_LOG)).toBe("success");
    });

    it("classifies a run that finished despite scrape failures as partial", () => {
        expect(classifyOperationalLog(PARTIAL_WARNING_LOG)).toBe("partial");
    });

    it("classifies a run without a success marker as failed", () => {
        expect(classifyOperationalLog(FAILED_LOG)).toBe("failed");
    });

    it("classifies a lineup no-op run as success", () => {
        expect(classifyOperationalLog(LINEUP_NOOP_LOG)).toBe("success");
    });

    it("classifies a lineup deploy run as success", () => {
        expect(classifyOperationalLog(LINEUP_SUCCESS_LOG)).toBe("success");
    });

    it("returns unknown for a log without markers", () => {
        expect(classifyOperationalLog("==> Fetch upcoming matches")).toBe("unknown");
    });
});

describe("summarizeOperationalLog", () => {
    it("surfaces the partial-run warning line", () => {
        const summary = summarizeOperationalLog(PARTIAL_WARNING_LOG, "partial");
        expect(summary).toContain("failed with exit code 1, continuing");
    });

    it("surfaces the success line for clean runs", () => {
        const summary = summarizeOperationalLog(FULL_SUCCESS_LOG, "success");
        expect(summary).toBe("Local daily refresh finished successfully.");
    });

    it("surfaces the no-op line for skipped lineup runs", () => {
        const summary = summarizeOperationalLog(LINEUP_NOOP_LOG, "success");
        expect(summary).toBe("Prediction report did not change; build and deployment are not needed.");
    });

    it("surfaces the failure line for failed runs", () => {
        const summary = summarizeOperationalLog(FAILED_LOG, "failed");
        expect(summary).toContain("failed with exit code 1");
    });
});

function reportWithVariants(matches: Array<Record<string, unknown>>): PredictionReport {
    return { matches } as unknown as PredictionReport;
}

function lineupArtifact(confirmedFlags: boolean[]): MatchLineupsArtifact {
    const matches: Record<string, { confirmed: boolean }> = {};
    confirmedFlags.forEach((confirmed, index) => {
        matches[String(index + 1)] = { confirmed };
    });
    return { schema_version: 1, matches } as unknown as MatchLineupsArtifact;
}

describe("summarizeLineupUsage", () => {
    it("counts target contexts, lineup-model matches, and lineup coverage", () => {
        const report = reportWithVariants([
            {
                prediction_variants: {
                    without_odds: {
                        lineup_model_used: true,
                        model_context_by_target: {
                            result: "confirmed_lineup",
                            btts: "baseline",
                        },
                    },
                    with_odds: {
                        lineup_model_used: false,
                        model_context_by_target: {
                            result: "baseline_fallback",
                        },
                    },
                },
            },
            {
                prediction_variants: {
                    without_odds: {
                        lineup_model_used: false,
                        model_context_by_target: {
                            result: "baseline",
                            btts: "baseline",
                        },
                    },
                },
            },
            {},
        ]);

        const summary = summarizeLineupUsage([
            { date: "2026-08-16", report, lineups: lineupArtifact([true, false]) },
        ]);

        expect(summary.dates).toHaveLength(1);
        const row = summary.dates[0];
        expect(row.total_matches).toBe(3);
        expect(row.lineup_model_matches).toBe(1);
        expect(row.target_contexts.confirmed_lineup).toBe(1);
        expect(row.target_contexts.baseline).toBe(3);
        expect(row.target_contexts.baseline_fallback).toBe(1);
        expect(row.target_contexts.other).toBe(0);
        expect(row.lineups_collected).toBe(2);
        expect(row.confirmed_lineups).toBe(1);
    });

    it("aggregates totals across dates and tolerates missing artifacts", () => {
        const reportA = reportWithVariants([
            {
                prediction_variants: {
                    without_odds: {
                        lineup_model_used: true,
                        model_context_by_target: { result: "confirmed_lineup" },
                    },
                },
            },
        ]);
        const reportB = reportWithVariants([
            {
                prediction_variants: {
                    without_odds: {
                        model_context_by_target: { result: "baseline" },
                    },
                },
            },
        ]);

        const summary = summarizeLineupUsage([
            { date: "2026-08-15", report: reportA, lineups: lineupArtifact([true]) },
            { date: "2026-08-16", report: reportB, lineups: null },
            { date: "2026-08-17", report: null, lineups: null },
        ]);

        expect(summary.dates).toHaveLength(3);
        expect(summary.totals.total_matches).toBe(2);
        expect(summary.totals.lineup_model_matches).toBe(1);
        expect(summary.totals.target_contexts.confirmed_lineup).toBe(1);
        expect(summary.totals.target_contexts.baseline).toBe(1);
        expect(summary.totals.confirmed_lineups).toBe(1);
        expect(summary.totals.lineups_collected).toBe(1);
    });
});
