import {
    getCountTranslation,
    getTranslations,
} from "@/app/util/i18n/translations";

describe("translations", () => {
    it("uses the English singular only for one", () => {
        expect(getCountTranslation("en", "matches_analyzed", 1)).toBe("match analyzed");
        expect(getCountTranslation("en", "matches_analyzed", 2)).toBe("matches analyzed");
    });

    it("uses the correct Polish count forms", () => {
        expect(getCountTranslation("pl", "matches_analyzed", 1)).toBe("mecz przeanalizowany");
        expect(getCountTranslation("pl", "matches_analyzed", 2)).toBe("mecze przeanalizowane");
        expect(getCountTranslation("pl", "matches_analyzed", 12)).toBe("meczów przeanalizowanych");
        expect(getCountTranslation("pl", "matches_analyzed", 22)).toBe("mecze przeanalizowane");
    });

    it("falls back to the base translation when no count variant exists", () => {
        expect(getCountTranslation("pl", "finished", 3)).toBe(getTranslations("pl")("finished"));
    });
});
