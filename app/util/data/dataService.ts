import fs from "fs";
import path from "path";
import { Competition } from "../league/leagueRegistry";
import { SofascoreMatch, SofascoreMatchFile, SofascoreUpcomingMatch, SofascoreUpcomingFile } from "@/types/sofascore";

const DATA_DIR = process.env.SOFASCORE_DATA_DIR || path.join(process.cwd(), "SofascoreData", "data");

function readJson<T>(filePath: string): T | null {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function loadAllSeasons(competition: Competition): SofascoreMatch[] {
    const filePath = path.join(DATA_DIR, competition.dataPath, "raw", "all_seasons.json");
    const data = readJson<SofascoreMatchFile>(filePath);
    return data?.matches ?? [];
}

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
    const finished = matches.filter((m) => m.status === "finished" && m.home_score !== null && m.away_score !== null);

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
