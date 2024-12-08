type LeagueRules = {
    championsLeague: [number, number];
    europaLeague?: [number, number];
    conferenceLeague?: [number, number];
    relegationPlayoff?: [number, number];
    relegation: [number, number];
};

const leagueRules: Record<number, LeagueRules> = {
    39: { // Premier League
        championsLeague: [1, 4],
        europaLeague: [5, 5],
        conferenceLeague: [6, 6],
        relegation: [18, 20],
    },
    140: { // La Liga
        championsLeague: [1, 4],
        europaLeague: [5, 6],
        relegation: [18, 20],
    },
    78: { // Bundesliga
        championsLeague: [1, 4],
        europaLeague: [5, 5],
        conferenceLeague: [6, 6],
        relegationPlayoff: [16, 16],
        relegation: [17, 18],
    },
    135: { // Serie A
        championsLeague: [1, 4],
        europaLeague: [5, 5],
        conferenceLeague: [6, 6],
        relegation: [18, 20],
    },
    61: { // Ligue 1
        championsLeague: [1, 3],
        europaLeague: [4, 4],
        relegation: [17, 20],
    },
};

export function getRowClass(leagueId: number, position: number): string {
    const rules = leagueRules[leagueId];
    if (!rules) return "";

    if (position >= rules.championsLeague[0] && position <= rules.championsLeague[1]) {
        return "bg-green-600/20";
    } else if (rules.europaLeague && position >= rules.europaLeague[0] && position <= rules.europaLeague[1]) {
        return "bg-blue-600/20";
    } else if (rules.conferenceLeague && position >= rules.conferenceLeague[0] && position <= rules.conferenceLeague[1]) {
        return "bg-purple-600/20";
    } else if (rules.relegationPlayoff && position >= rules.relegationPlayoff[0] && position <= rules.relegationPlayoff[1]) {
        return "bg-orange-600/20";
    } else if (position >= rules.relegation[0] && position <= rules.relegation[1]) {
        return "bg-red-600/20";
    }
    return "";
}

export function getLegend(leagueId: number): { color: string; description: string }[] {
    const rules = leagueRules[leagueId];
    if (!rules) return [];

    const legend = [];
    legend.push({ color: "green", description: "Champions League – Group Stage" });

    if (rules.europaLeague) {
        legend.push({ color: "blue", description: "Europa League – Group Stage" });
    }
    if (rules.conferenceLeague) {
        legend.push({ color: "purple", description: "Europa Conference League – Qualification" });
    }
    if (rules.relegationPlayoff) {
        legend.push({ color: "orange", description: "Relegation Play-off" });
    }
    legend.push({ color: "red", description: "Relegation" });

    return legend;
}