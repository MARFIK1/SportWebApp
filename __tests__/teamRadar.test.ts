import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TeamRadar from "@/app/match/[id]/TeamRadar";

jest.mock("@/app/components/common/LanguageProvider", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
}));

describe("TeamRadar", () => {
    it("renders an honest data-quality state when analysis is unavailable", () => {
        const markup = renderToStaticMarkup(
            createElement(TeamRadar, { analysis: null, homeTeam: "Argentina", awayTeam: "Switzerland" }),
        );

        expect(markup).toContain("matchup_radar_unavailable");
        expect(markup).toContain("matchup_radar_unavailable_hint");
        expect(markup).not.toContain("<svg");
    });
});
