import { isValidYmdDate, normalizeReportDate } from "@/app/util/data/dateUtils";

describe("dateUtils", () => {
    it("accepts real YYYY-MM-DD dates", () => {
        expect(isValidYmdDate("2026-04-29")).toBe(true);
        expect(normalizeReportDate("2026-04-29")).toBe("2026-04-29");
    });

    it("rejects invalid dates and path-like input", () => {
        for (const value of ["2026-02-30", "../2026-04-29", "2026/04/29", "", "today", "2026-4-9"]) {
            expect(isValidYmdDate(value)).toBe(false);
            expect(normalizeReportDate(value)).toBeNull();
        }
    });
});
