export type CompetitionType = "league" | "cups" | "european" | "international";

export interface Competition {
    slug: string;
    name: string;
    country: string;
    compType: CompetitionType;
    tournamentId: number;
    dataPath: string;
    priority: number;
}

const competitions: Competition[] = [
    { slug: "england-premier-league", name: "Premier League", country: "england", compType: "league", tournamentId: 17, dataPath: "league/england/premier_league", priority: 1 },
    { slug: "spain-la-liga", name: "La Liga", country: "spain", compType: "league", tournamentId: 8, dataPath: "league/spain/la_liga", priority: 2 },
    { slug: "germany-bundesliga", name: "Bundesliga", country: "germany", compType: "league", tournamentId: 35, dataPath: "league/germany/bundesliga", priority: 3 },
    { slug: "italy-serie-a", name: "Serie A", country: "italy", compType: "league", tournamentId: 23, dataPath: "league/italy/serie_a", priority: 4 },
    { slug: "france-ligue-1", name: "Ligue 1", country: "france", compType: "league", tournamentId: 34, dataPath: "league/france/ligue_1", priority: 5 },

    { slug: "netherlands-eredivisie", name: "Eredivisie", country: "netherlands", compType: "league", tournamentId: 37, dataPath: "league/netherlands/eredivisie", priority: 10 },
    { slug: "portugal-primeira-liga", name: "Primeira Liga", country: "portugal", compType: "league", tournamentId: 238, dataPath: "league/portugal/primeira_liga", priority: 11 },
    { slug: "turkey-super-lig", name: "Süper Lig", country: "turkey", compType: "league", tournamentId: 52, dataPath: "league/turkey/super_lig", priority: 12 },
    { slug: "belgium-jupiler-pro-league", name: "Jupiler Pro League", country: "belgium", compType: "league", tournamentId: 38, dataPath: "league/belgium/jupiler_pro_league", priority: 13 },
    { slug: "austria-bundesliga", name: "Austrian Bundesliga", country: "austria", compType: "league", tournamentId: 45, dataPath: "league/austria/bundesliga", priority: 14 },
    { slug: "scotland-premiership", name: "Scottish Premiership", country: "scotland", compType: "league", tournamentId: 36, dataPath: "league/scotland/premiership", priority: 15 },
    { slug: "greece-super-league", name: "Super League Greece", country: "greece", compType: "league", tournamentId: 185, dataPath: "league/greece/super_league", priority: 16 },
    { slug: "poland-ekstraklasa", name: "Ekstraklasa", country: "poland", compType: "league", tournamentId: 202, dataPath: "league/poland/ekstraklasa", priority: 17 },
    { slug: "usa-mls", name: "MLS", country: "usa", compType: "league", tournamentId: 242, dataPath: "league/usa/mls", priority: 18 },
    { slug: "saudi-arabia-saudi-pro-league", name: "Saudi Pro League", country: "saudi_arabia", compType: "league", tournamentId: 955, dataPath: "league/saudi_arabia/saudi_pro_league", priority: 19 },

    { slug: "england-championship", name: "Championship", country: "england", compType: "league", tournamentId: 18, dataPath: "league/england/championship", priority: 20 },
    { slug: "england-league-one", name: "League One", country: "england", compType: "league", tournamentId: 24, dataPath: "league/england/league_one", priority: 21 },
    { slug: "england-league-two", name: "League Two", country: "england", compType: "league", tournamentId: 25, dataPath: "league/england/league_two", priority: 22 },
    { slug: "spain-la-liga-2", name: "La Liga 2", country: "spain", compType: "league", tournamentId: 54, dataPath: "league/spain/la_liga_2", priority: 23 },
    { slug: "germany-2-bundesliga", name: "2. Bundesliga", country: "germany", compType: "league", tournamentId: 44, dataPath: "league/germany/2_bundesliga", priority: 24 },
    { slug: "italy-serie-b", name: "Serie B", country: "italy", compType: "league", tournamentId: 53, dataPath: "league/italy/serie_b", priority: 25 },
    { slug: "france-ligue-2", name: "Ligue 2", country: "france", compType: "league", tournamentId: 182, dataPath: "league/france/ligue_2", priority: 26 },
    { slug: "poland-1-liga", name: "I Liga", country: "poland", compType: "league", tournamentId: 229, dataPath: "league/poland/1_liga", priority: 27 },

    { slug: "england-fa-cup", name: "FA Cup", country: "england", compType: "cups", tournamentId: 19, dataPath: "cups/england/fa_cup", priority: 30 },
    { slug: "england-efl-cup", name: "EFL Cup", country: "england", compType: "cups", tournamentId: 21, dataPath: "cups/england/efl_cup", priority: 31 },
    { slug: "england-community-shield", name: "Community Shield", country: "england", compType: "cups", tournamentId: 346, dataPath: "cups/england/community_shield", priority: 32 },
    { slug: "spain-copa-del-rey", name: "Copa del Rey", country: "spain", compType: "cups", tournamentId: 329, dataPath: "cups/spain/copa_del_rey", priority: 33 },
    { slug: "spain-supercopa", name: "Supercopa de España", country: "spain", compType: "cups", tournamentId: 213, dataPath: "cups/spain/supercopa", priority: 34 },
    { slug: "germany-dfb-pokal", name: "DFB-Pokal", country: "germany", compType: "cups", tournamentId: 217, dataPath: "cups/germany/dfb_pokal", priority: 35 },
    { slug: "germany-supercup", name: "DFL-Supercup", country: "germany", compType: "cups", tournamentId: 799, dataPath: "cups/germany/supercup", priority: 36 },
    { slug: "italy-coppa-italia", name: "Coppa Italia", country: "italy", compType: "cups", tournamentId: 328, dataPath: "cups/italy/coppa_italia", priority: 37 },
    { slug: "italy-supercoppa", name: "Supercoppa Italiana", country: "italy", compType: "cups", tournamentId: 341, dataPath: "cups/italy/supercoppa", priority: 38 },
    { slug: "france-coupe-de-france", name: "Coupe de France", country: "france", compType: "cups", tournamentId: 335, dataPath: "cups/france/coupe_de_france", priority: 39 },
    { slug: "france-trophee-des-champions", name: "Trophée des Champions", country: "france", compType: "cups", tournamentId: 339, dataPath: "cups/france/trophee_des_champions", priority: 40 },
    { slug: "poland-puchar-polski", name: "Puchar Polski", country: "poland", compType: "cups", tournamentId: 281, dataPath: "cups/poland/puchar_polski", priority: 41 },

    { slug: "uefa-champions-league", name: "UEFA Champions League", country: "uefa", compType: "european", tournamentId: 7, dataPath: "european/champions_league", priority: 50 },
    { slug: "uefa-europa-league", name: "UEFA Europa League", country: "uefa", compType: "european", tournamentId: 679, dataPath: "european/europa_league", priority: 51 },
    { slug: "uefa-conference-league", name: "UEFA Conference League", country: "uefa", compType: "european", tournamentId: 17015, dataPath: "european/conference_league", priority: 52 },
    { slug: "uefa-super-cup", name: "UEFA Super Cup", country: "uefa", compType: "european", tournamentId: 465, dataPath: "european/super_cup", priority: 53 },

    { slug: "fifa-world-cup", name: "FIFA World Cup", country: "fifa", compType: "international", tournamentId: 16, dataPath: "international/world_cup", priority: 60 },
    { slug: "fifa-world-cup-qualifiers-europe", name: "World Cup Qualifiers (UEFA)", country: "fifa", compType: "international", tournamentId: 11, dataPath: "international/world_cup_qualifiers_europe", priority: 61 },
    { slug: "uefa-euro", name: "UEFA Euro", country: "uefa", compType: "international", tournamentId: 1, dataPath: "international/euro", priority: 62 },
    { slug: "uefa-euro-qualifiers", name: "UEFA Euro Qualifiers", country: "uefa", compType: "international", tournamentId: 27, dataPath: "international/euro_qualifiers", priority: 63 },
    { slug: "uefa-nations-league", name: "UEFA Nations League", country: "uefa", compType: "international", tournamentId: 10783, dataPath: "international/nations_league", priority: 64 },
];

const bySlug = new Map<string, Competition>();
const byTournamentId = new Map<number, Competition>();
const byDataPath = new Map<string, Competition>();

for (const comp of competitions) {
    bySlug.set(comp.slug, comp);
    byTournamentId.set(comp.tournamentId, comp);
    byDataPath.set(comp.dataPath, comp);
}

export function getCompetitionBySlug(slug: string): Competition | undefined {
    return bySlug.get(slug);
}

export function getCompetitionByTournamentId(id: number): Competition | undefined {
    return byTournamentId.get(id);
}

export function getCompetitionByDataPath(path: string): Competition | undefined {
    return byDataPath.get(path);
}

export function resolveCompetitionByDataPath(dataPath: string): Competition | undefined {
    const direct = byDataPath.get(dataPath);
    if (direct) return direct;
    const parts = dataPath.split("/");
    if (parts.length > 2) {
        return byDataPath.get(parts.slice(0, 2).join("/"));
    }
    return undefined;
}

export function getAllCompetitions(): Competition[] {
    return competitions;
}

export function getCompetitionsByType(type: CompetitionType): Competition[] {
    return competitions.filter((c) => c.compType === type);
}

export function getLeagues(): Competition[] {
    return competitions
        .filter((c) => c.compType === "league")
        .sort((a, b) => a.priority - b.priority);
}

export function getTopLeagues(): Competition[] {
    return competitions
        .filter((c) => c.compType === "league" && c.priority <= 5)
        .sort((a, b) => a.priority - b.priority);
}
