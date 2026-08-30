import {
    appDataCutoffYmd,
    expandYmdDateRange,
    isValidYmdDate,
    isWithinAppDataCutoff,
    normalizeReportDate,
    todayYmd,
} from "@/app/util/data/dateUtils";

const originalDataCutoff = process.env.APP_DATA_CUTOFF;
const originalReferenceDate = process.env.APP_REFERENCE_DATE;

afterEach(() => {
    if (originalDataCutoff === undefined) delete process.env.APP_DATA_CUTOFF;
    else process.env.APP_DATA_CUTOFF = originalDataCutoff;
    if (originalReferenceDate === undefined) delete process.env.APP_REFERENCE_DATE;
    else process.env.APP_REFERENCE_DATE = originalReferenceDate;
});

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

    it("formats today in the report timezone instead of UTC", () => {
        expect(todayYmd(new Date("2026-04-30T22:30:00Z"))).toBe("2026-05-01");
    });

    it("freezes the implicit app clock without changing explicit date formatting", () => {
        process.env.APP_REFERENCE_DATE = "2026-07-19";

        expect(todayYmd()).toBe("2026-07-19");
        expect(todayYmd(new Date("2026-08-30T12:00:00Z"))).toBe("2026-08-30");
    });

    it("enforces the configured inclusive app data cutoff", () => {
        process.env.APP_DATA_CUTOFF = "2026-07-19";

        expect(appDataCutoffYmd()).toBe("2026-07-19");
        expect(isWithinAppDataCutoff("2026-07-19T20:00:00Z")).toBe(true);
        expect(isWithinAppDataCutoff("2026-07-20")).toBe(false);
        expect(isWithinAppDataCutoff("unknown")).toBe(false);
    });

    it("fails fast for an invalid frozen date", () => {
        process.env.APP_DATA_CUTOFF = "2026-02-30";
        expect(() => appDataCutoffYmd()).toThrow("APP_DATA_CUTOFF");
    });

    it("fills calendar days missing between available reports", () => {
        expect(expandYmdDateRange(["2026-07-17", "2026-07-15", "2026-07-15"])).toEqual([
            "2026-07-15",
            "2026-07-16",
            "2026-07-17",
        ]);
    });
});
