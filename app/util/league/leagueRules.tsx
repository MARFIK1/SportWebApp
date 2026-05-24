export type StandingZoneKind = "champions" | "europa" | "conference" | "relegationPlayoff" | "relegation";

export interface StandingZoneRule {
    kind: StandingZoneKind;
    from?: number;
    to?: number;
    bottomCount?: number;
}

export interface StandingZone {
    kind: StandingZoneKind;
    from: number;
    to: number;
}

export interface StandingTeamZoneRule {
    kind: StandingZoneKind;
    teamIds?: number[];
    teamNames?: string[];
}

interface LeagueStandingSeasonOverride {
    zones?: StandingZoneRule[];
    teamZones?: StandingTeamZoneRule[];
}

interface LeagueStandingRuleSet {
    zones: StandingZoneRule[];
    teamZones?: StandingTeamZoneRule[];
    seasonOverrides?: Record<string, LeagueStandingSeasonOverride>;
}

const LEAGUE_STANDING_RULES: Record<string, LeagueStandingRuleSet> = {
    "england-premier-league": {
        zones: [
            { kind: "champions", from: 1, to: 5 },
            { kind: "europa", from: 6, to: 6 },
            { kind: "conference", from: 7, to: 7 },
            { kind: "relegation", bottomCount: 3 },
        ],
        seasonOverrides: {
            "25/26": {
                zones: [
                    { kind: "champions", from: 1, to: 5 },
                    { kind: "europa", from: 6, to: 6 },
                    { kind: "conference", from: 7, to: 8 },
                    { kind: "relegation", bottomCount: 3 },
                ],
            },
            "premier league 25/26": {
                zones: [
                    { kind: "champions", from: 1, to: 5 },
                    { kind: "europa", from: 6, to: 6 },
                    { kind: "conference", from: 7, to: 8 },
                    { kind: "relegation", bottomCount: 3 },
                ],
            },
        },
    },
    "spain-la-liga": {
        zones: [
            { kind: "champions", from: 1, to: 4 },
            { kind: "europa", from: 5, to: 5 },
            { kind: "conference", from: 6, to: 6 },
            { kind: "relegation", bottomCount: 3 },
        ],
        seasonOverrides: {
            "25/26": {
                zones: [
                    { kind: "champions", from: 1, to: 4 },
                    { kind: "europa", from: 5, to: 6 },
                    { kind: "conference", from: 7, to: 7 },
                    { kind: "relegation", bottomCount: 3 },
                ],
                teamZones: [
                    { kind: "europa", teamIds: [2824], teamNames: ["Real Sociedad"] },
                ],
            },
            "la liga 25/26": {
                zones: [
                    { kind: "champions", from: 1, to: 4 },
                    { kind: "europa", from: 5, to: 6 },
                    { kind: "conference", from: 7, to: 7 },
                    { kind: "relegation", bottomCount: 3 },
                ],
                teamZones: [
                    { kind: "europa", teamIds: [2824], teamNames: ["Real Sociedad"] },
                ],
            },
        },
    },
    "italy-serie-a": {
        zones: [
            { kind: "champions", from: 1, to: 4 },
            { kind: "europa", from: 5, to: 5 },
            { kind: "conference", from: 6, to: 6 },
            { kind: "relegation", bottomCount: 3 },
        ],
    },
    "germany-bundesliga": {
        zones: [
            { kind: "champions", from: 1, to: 4 },
            { kind: "europa", from: 5, to: 5 },
            { kind: "conference", from: 6, to: 6 },
            { kind: "relegationPlayoff", from: 16, to: 16 },
            { kind: "relegation", bottomCount: 2 },
        ],
    },
    "france-ligue-1": {
        zones: [
            { kind: "champions", from: 1, to: 3 },
            { kind: "europa", from: 4, to: 4 },
            { kind: "conference", from: 5, to: 5 },
            { kind: "relegationPlayoff", from: 16, to: 16 },
            { kind: "relegation", bottomCount: 2 },
        ],
    },
    "netherlands-eredivisie": {
        zones: [
            { kind: "champions", from: 1, to: 2 },
            { kind: "europa", from: 3, to: 3 },
            { kind: "conference", from: 4, to: 4 },
            { kind: "relegation", bottomCount: 2 },
        ],
    },
    "portugal-primeira-liga": {
        zones: [
            { kind: "champions", from: 1, to: 2 },
            { kind: "europa", from: 3, to: 3 },
            { kind: "conference", from: 4, to: 4 },
            { kind: "relegation", bottomCount: 2 },
        ],
    },
    "poland-ekstraklasa": {
        zones: [
            { kind: "champions", from: 1, to: 1 },
            { kind: "conference", from: 2, to: 3 },
            { kind: "relegation", bottomCount: 3 },
        ],
    },
};

const ZONE_COLORS: Record<StandingZoneKind, string> = {
    champions: "bg-emerald-500",
    europa: "bg-blue-500",
    conference: "bg-cyan-400",
    relegationPlayoff: "bg-amber-400",
    relegation: "bg-red-500",
};

const ZONE_LABEL_KEYS: Record<StandingZoneKind, string> = {
    champions: "zone_champions_league",
    europa: "zone_europa_league",
    conference: "zone_conference_league",
    relegationPlayoff: "zone_relegation_playoff",
    relegation: "zone_relegation",
};

function seasonKeys(season?: string): string[] {
    const normalized = season?.trim().toLowerCase() ?? "";
    if (!normalized) return [];

    const keys = [normalized];
    const shortSeason = normalized.match(/(\d{2})\s*\/\s*(\d{2})/);
    if (shortSeason) {
        keys.push(`${shortSeason[1]}/${shortSeason[2]}`);
    }

    const datedSeason = normalized.match(/(\d{4})-(\d{2})-\d{2}/);
    if (datedSeason) {
        const year = Number(datedSeason[1]);
        const month = Number(datedSeason[2]);
        if (Number.isFinite(year) && Number.isFinite(month)) {
            const startYear = month >= 7 ? year : year - 1;
            const endYear = startYear + 1;
            keys.push(`${String(startYear).slice(-2)}/${String(endYear).slice(-2)}`);
        }
    }

    return Array.from(new Set(keys));
}

function overrideForSeason(ruleSet: LeagueStandingRuleSet, season?: string): LeagueStandingSeasonOverride | undefined {
    for (const key of seasonKeys(season)) {
        const override = ruleSet.seasonOverrides?.[key];
        if (override) return override;
    }
    return undefined;
}

function rulesForSeason(ruleSet: LeagueStandingRuleSet, season?: string): StandingZoneRule[] {
    return overrideForSeason(ruleSet, season)?.zones ?? ruleSet.zones;
}

function teamZonesForSeason(ruleSet: LeagueStandingRuleSet, season?: string): StandingTeamZoneRule[] {
    return overrideForSeason(ruleSet, season)?.teamZones ?? ruleSet.teamZones ?? [];
}

export function getStandingZones(leagueSlug: string, teamsCount: number, season?: string): StandingZone[] {
    const ruleSet = LEAGUE_STANDING_RULES[leagueSlug];
    if (!ruleSet) return [];

    return rulesForSeason(ruleSet, season)
        .map((rule) => {
            const from = rule.bottomCount ? Math.max(1, teamsCount - rule.bottomCount + 1) : rule.from;
            const to = rule.bottomCount ? teamsCount : rule.to ?? rule.from;
            if (!from || !to || from > to) return null;
            return { kind: rule.kind, from, to };
        })
        .filter((zone): zone is StandingZone => zone !== null);
}

export function getPositionZone(position: number, zones: StandingZone[]): StandingZone | undefined {
    return zones.find((zone) => position >= zone.from && position <= zone.to);
}

export function getStandingTeamZones(leagueSlug: string, season?: string): StandingTeamZoneRule[] {
    const ruleSet = LEAGUE_STANDING_RULES[leagueSlug];
    if (!ruleSet) return [];
    return teamZonesForSeason(ruleSet, season);
}

function normalizeTeamName(teamName: string): string {
    return teamName.trim().toLowerCase();
}

export function getTeamStandingZone(
    teamId: number,
    teamName: string,
    teamZones: StandingTeamZoneRule[],
): StandingTeamZoneRule | undefined {
    const normalizedName = normalizeTeamName(teamName);

    return teamZones.find((zone) => {
        if (zone.teamIds?.includes(teamId)) return true;
        return zone.teamNames?.some((name) => normalizeTeamName(name) === normalizedName) ?? false;
    });
}

export function standingZoneColor(kind: StandingZoneKind): string {
    return ZONE_COLORS[kind];
}

export function standingZoneLabelKey(kind: StandingZoneKind): string {
    return ZONE_LABEL_KEYS[kind];
}
