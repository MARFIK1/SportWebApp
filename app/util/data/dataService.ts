import fs from "fs";
import path from "path";
import { cache } from "../serverCache";
import { readJson } from "./fileUtils";
import { Competition } from "../league/leagueRegistry";
import { SofascoreMatch, SofascoreMatchFile, SofascoreUpcomingMatch, SofascoreUpcomingFile } from "@/types/sofascore";

function resolveDataDir(): string {
    const prebuilt = path.join(process.cwd(), ".data");
    if (fs.existsSync(prebuilt)) return prebuilt;
    return path.join(process.cwd(), "SofascoreData", "data");
}

const DATA_DIR = process.env.SOFASCORE_DATA_DIR || resolveDataDir();

export const loadAllSeasons = cache((competition: Competition): SofascoreMatch[] => {
    const filePath = path.join(DATA_DIR, competition.dataPath, "raw", "all_seasons.json");
    const data = readJson<SofascoreMatchFile>(filePath);
    return data?.matches ?? [];
});

export function loadSeasonMatches(competition: Competition, seasonFile: string): SofascoreMatch[] {
    const filePath = path.join(DATA_DIR, competition.dataPath, "raw", seasonFile);
    const data = readJson<SofascoreMatchFile>(filePath);
    return data?.matches ?? [];
}

export function loadUpcomingMatches(competition: Competition): SofascoreUpcomingMatch[] {
    const upcomingDir = path.join(DATA_DIR, competition.dataPath, "raw", "upcoming");
    if (!fs.existsSync(upcomingDir)) return [];

    const files = fs.readdirSync(upcomingDir).filter((f) => f.endsWith(".json"));
    const allUpcoming: SofascoreUpcomingMatch[] = [];

    for (const file of files) {
        const data = readJson<SofascoreUpcomingFile>(path.join(upcomingDir, file));
        if (data?.matches) {
            allUpcoming.push(...data.matches);
        }
    }

    return allUpcoming;
}

export function listSeasonFiles(competition: Competition): string[] {
    const rawDir = path.join(DATA_DIR, competition.dataPath, "raw");
    if (!fs.existsSync(rawDir)) return [];

    return fs.readdirSync(rawDir).filter(
        (f) => f.endsWith(".json") && f !== "all_seasons.json" && !f.startsWith("upcoming")
    );
}

export interface StandingRow {
    position: number;
    teamId: number;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
    form: string[];
}

export function computeStandings(matches: SofascoreMatch[]): StandingRow[] {
    const finished = matches
        .filter((m) => m.status === "finished" && m.home_score !== null && m.away_score !== null)
        .sort((a, b) => a.date.localeCompare(b.date));

    const teams = new Map<number, StandingRow>();

    function getTeam(id: number, name: string): StandingRow {
        if (!teams.has(id)) {
            teams.set(id, {
                position: 0,
                teamId: id,
                teamName: name,
                played: 0,
                won: 0,
                drawn: 0,
                lost: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                goalDifference: 0,
                points: 0,
                form: [],
            });
        }
        return teams.get(id)!;
    }

    for (const m of finished) {
        const home = getTeam(m.home_team_id, m.home_team);
        const away = getTeam(m.away_team_id, m.away_team);
        const hg = m.home_score!;
        const ag = m.away_score!;

        home.played++;
        away.played++;
        home.goalsFor += hg;
        home.goalsAgainst += ag;
        away.goalsFor += ag;
        away.goalsAgainst += hg;

        if (hg > ag) {
            home.won++;
            home.points += 3;
            away.lost++;
            home.form.push("W");
            away.form.push("L");
        } else if (hg < ag) {
            away.won++;
            away.points += 3;
            home.lost++;
            home.form.push("L");
            away.form.push("W");
        } else {
            home.drawn++;
            away.drawn++;
            home.points += 1;
            away.points += 1;
            home.form.push("D");
            away.form.push("D");
        }
    }

    const rows = Array.from(teams.values());

    for (const row of rows) {
        row.goalDifference = row.goalsFor - row.goalsAgainst;
        row.form = row.form.slice(-5);
    }

    rows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });

    rows.forEach((row, i) => {
        row.position = i + 1;
    });

    return rows;
}

export function loadPlayers(competition: Competition, seasonFile: string): Record<string, PlayerInfo[]> {
    const playersDir = path.join(DATA_DIR, competition.dataPath, "players");
    const fileName = "players_" + seasonFile;
    const filePath = path.join(playersDir, fileName);
    const data = readJson<{ metadata: Record<string, unknown>; teams: Record<string, PlayerInfo[]> }>(filePath);
    return data?.teams ?? {};
}

export interface PlayerInfo {
    id: number;
    name: string;
    short_name: string;
    position: string;
    jersey_number: string;
    date_of_birth: string;
    height: number;
    country: string;
    team: string;
}

export function loadLineups(competition: Competition, seasonFile: string): MatchLineup[] {
    const lineupsDir = path.join(DATA_DIR, competition.dataPath, "lineups");
    const fileName = "lineups_" + seasonFile;
    const filePath = path.join(lineupsDir, fileName);
    const data = readJson<{ metadata: Record<string, unknown>; lineups: MatchLineup[] }>(filePath);
    return data?.lineups ?? [];
}

export function findMatchInCompetitions(eventId: number, competitions: Competition[]): { match: SofascoreMatch; competition: Competition } | null {
    for (const comp of competitions) {
        const matches = loadAllSeasons(comp);
        const match = matches.find((m) => m.event_id === eventId);
        if (match) return { match, competition: comp };
    }
    return null;
}

export function buildTeamIdMap(competitions: Competition[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const comp of competitions) {
        const matches = loadAllSeasons(comp);
        for (const m of matches) {
            if (!map.has(m.home_team)) map.set(m.home_team, m.home_team_id);
            if (!map.has(m.away_team)) map.set(m.away_team, m.away_team_id);
        }
    }
    return map;
}

export interface MatchLineup {
    match_id: string;
    event_id: number;
    date: string;
    season: string;
    home_team: string;
    away_team: string;
    home: {
        formation: string;
        starters: PlayerInfo[];
        substitutes: PlayerInfo[];
    };
    away: {
        formation: string;
        starters: PlayerInfo[];
        substitutes: PlayerInfo[];
    };
}

export function loadLatestPlayers(competition: Competition): Record<string, PlayerInfo[]> {
    // Prebuilt data has a single players.json per competition
    const prebuiltPath = path.join(DATA_DIR, competition.dataPath, "players.json");
    if (fs.existsSync(prebuiltPath)) {
        const data = readJson<{ teams: Record<string, PlayerInfo[]> }>(prebuiltPath);
        return data?.teams ?? {};
    }

    const seasons = listSeasonFiles(competition);
    if (seasons.length === 0) return {};
    const latest = seasons.sort().pop()!;
    return loadPlayers(competition, latest);
}

export interface TeamCompetitionData {
    competition: Competition;
    matches: SofascoreMatch[];
    standing: StandingRow | null;
}

export function findTeamData(teamId: number, competitions: Competition[]): { teamName: string; data: TeamCompetitionData[] } {
    let teamName = "";
    const data: TeamCompetitionData[] = [];

    for (const comp of competitions) {
        const matches = loadAllSeasons(comp);
        const teamMatches = matches.filter((m) => m.home_team_id === teamId || m.away_team_id === teamId);
        if (teamMatches.length === 0) continue;

        if (!teamName) {
            const first = teamMatches[0];
            teamName = first.home_team_id === teamId ? first.home_team : first.away_team;
        }

        const standings = computeStandings(matches);
        const standing = standings.find((r) => r.teamId === teamId) ?? null;

        data.push({ competition: comp, matches: teamMatches, standing });
    }

    return { teamName, data };
}

export function findPlayerInCompetitions(playerId: number, competitions: Competition[]): { player: PlayerInfo; competition: Competition } | null {
    for (const comp of competitions) {
        const teamPlayers = loadLatestPlayers(comp);
        for (const players of Object.values(teamPlayers)) {
            const player = players.find((p) => p.id === playerId);
            if (player) return { player, competition: comp };
        }
    }
    return null;
}

export function getTeamSquad(teamName: string, competitions: Competition[]): PlayerInfo[] {
    for (const comp of competitions) {
        const teamPlayers = loadLatestPlayers(comp);
        if (teamPlayers[teamName] && teamPlayers[teamName].length > 0) {
            return teamPlayers[teamName];
        }
    }
    return [];
}

export interface SearchTeam {
    id: number;
    name: string;
}

export interface SearchPlayer {
    id: number;
    name: string;
    team: string;
    position: string;
}

export function buildSearchData(competitions: Competition[]): { teams: SearchTeam[]; players: SearchPlayer[] } {
    const teamMap = new Map<number, string>();
    const playerMap = new Map<number, SearchPlayer>();

    for (const comp of competitions) {
        const matches = loadAllSeasons(comp);
        for (const m of matches) {
            if (!teamMap.has(m.home_team_id)) teamMap.set(m.home_team_id, m.home_team);
            if (!teamMap.has(m.away_team_id)) teamMap.set(m.away_team_id, m.away_team);
        }

        const teamPlayers = loadLatestPlayers(comp);
        for (const players of Object.values(teamPlayers)) {
            for (const p of players) {
                if (!playerMap.has(p.id)) {
                    playerMap.set(p.id, { id: p.id, name: p.name, team: p.team, position: p.position });
                }
            }
        }
    }

    const teams = Array.from(teamMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    const players = Array.from(playerMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return { teams, players };
}
