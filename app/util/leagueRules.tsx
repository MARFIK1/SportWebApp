type LeagueRules = {
    championsLeague: [number, number];
    europaLeague?: [number, number];
    conferenceLeague?: [number, number];
    relegationPlayoff?: [number, number];
    relegation: [number, number];
    nextround?: [number, number];
    playoff?: [number, number];
}

const leagueRules: Record<number, LeagueRules> = {
    39: { // Premier League
        championsLeague: [1, 4],
        europaLeague: [5, 5],
        relegation: [18, 20],
    },
    140: { // La Liga
        championsLeague: [1, 4],
        europaLeague: [5, 5],
        conferenceLeague: [6, 6],
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
        championsLeague: [1, 2],
        europaLeague: [3, 3],
        conferenceLeague: [4, 4],
        relegationPlayoff: [16, 16],
        relegation: [17, 20],
    },
    2: { // UEFA Champions League
        championsLeague: [1, 8],
        relegation: [0, 0],
        nextround: [1, 8],
        playoff: [9, 24],
    },
    3: { // UEFA Europa League
        championsLeague: [1, 8],
        relegation: [0, 0],
        nextround: [1, 8],
        playoff: [9, 24],
    },
    848: { // UEFA Conference League
        championsLeague: [1, 8],
        relegation: [0, 0],
        nextround: [1, 8],
        playoff: [9, 24],
    },
}

export function getRowClass(leagueId: number, position: number) : string {
    const rules = leagueRules[leagueId];
    if (!rules) return "";

    if (position >= rules.championsLeague[0] && position <= rules.championsLeague[1]) {
        return "bg-cyan-800/60";
    }
    else if (rules.europaLeague && position >= rules.europaLeague[0] && position <= rules.europaLeague[1]) {
        return "bg-orange-800/60";
    }
    else if (rules.conferenceLeague && position >= rules.conferenceLeague[0] && position <= rules.conferenceLeague[1]) {
        return "bg-green-800/60";
    }
    else if (rules.relegationPlayoff && position >= rules.relegationPlayoff[0] && position <= rules.relegationPlayoff[1]) {
        return "bg-yellow-600/40";
    }
    else if (position >= rules.relegation[0] && position <= rules.relegation[1]) {
        return "bg-red-800/60";
    }
    else if (rules.nextround && position >= rules.nextround[0] && position <= rules.nextround[1]) {
        return "bg-cyan-800/60";
    }
    else if (rules.playoff && position >= rules.playoff[0] && position <= rules.playoff[1]) {
        return "bg-orange-800/60";
    }
    return "";
}

export function getLegend(leagueId: number) : { color: string; description: string }[] {
    const rules = leagueRules[leagueId];
    if (!rules) return [];

    const legend = [];
    legend.push({ color: "bg-cyan-800/60", description: "Champions League – Group Stage" });

    if (rules.europaLeague) {
        legend.push({ color: "bg-orange-800/60", description: "Europa League – Group Stage" });
    }
    if (rules.conferenceLeague) {
        legend.push({ color: "bg-green-800/60", description: "Europa Conference League – Qualification" });
    }
    if (rules.relegationPlayoff) {
        legend.push({ color: "bg-yellow-600/40", description: "Relegation Play-off" });
    }
    legend.push({ color: "bg-red-800/60", description: "Relegation" });

    if (rules.nextround) {
        legend.push({ color: "bg-cyan-800/60", description: "Next Round" });
    }
    if (rules.playoff) {
        legend.push({ color: "bg-orange-800/60", description: "Play-off" });
    }

    return legend;
}