import "server-only";
import moment from "moment";

import { Player, Standing, AllFixtures, PlayerExtended } from "@/types";
import { USE_SAMPLE } from "../sampleData/useSample";
import getStandingsSample from "../sampleData/getStandingsSample";
import getFixturesSample from "../sampleData/getFixturesSample";
import getPlayersSample from "../sampleData/getPlayersSample";

const API_KEY = process.env.API_KEY as string;
const leagues = [
    {id: 39, name: "Premier League"},
    {id: 140, name: "La Liga"},
    {id: 78, name: "Bundesliga"},
    {id: 135, name: "Serie A"},
    {id: 61, name: "Ligue 1"},
    {id: 2, name: "UEFA Champions League"},
    {id: 3, name: "UEFA Europa League"},
    {id: 848, name: "UEFA Conference League"},
    {id: 531, name: "UEFA Super Cup"},
    {id: 15, name: "Fifa Club World Cup"},
    {id: 45, name: "FA Cup"},
    {id: 48, name: "Carribao Cup"},
    {id: 528, name: "Community Shield"},
    {id: 143, name: "Copa del Rey"},
    {id: 556, name: "Super Cup La Liga"},
    {id: 529, name: "Super Cup Bundesliga"},
    {id: 547, name: "Super Cup Serie A"},
    {id: 137, name: "Coppa Italia"},
    {id: 65, name: "Coupe de la Ligue"},
    {id: 66, name: "Coupe de France"},
    {id: 526, name: "Trophee des Champions"}
]

async function getStandings(season: number): Promise<Standing[]> {
    if (USE_SAMPLE) {
        return getStandingsSample();
    }

    const standings: Standing[] = [];
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        next: { revalidate: 3600 }
    };

    for (const league of leagues) {
        const url = `https://api-football-v1.p.rapidapi.com/v3/standings?league=${league.id}&season=${season}`;
        try {
            const data = await fetchWithRetry(url, options);
            const standing = data.response?.[0];
            if (standing) {
                standings.push(standing);
            }
        }
        catch (error) {
            console.error(`Error fetching standings for ${league.name}:`, error);
        }
    }

    return standings;
}

async function getFixtures(season: number): Promise<AllFixtures[]> {
    if (USE_SAMPLE) {
        return getFixturesSample();
    }

    const now = moment();
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        next: { revalidate: 3600 }
    };

    const fixturesByLeague = await Promise.all(
        leagues.map(async (league) => {
            const url = `https://api-football-v1.p.rapidapi.com/v3/fixtures?league=${league.id}&season=${season}`;
            try {
                const response = await fetch(url, options);
                const data = await response.json();
                const fixtures = data.response;

                const futureFixtures = fixtures
                    .filter((fixture: any) => moment(fixture.fixture.date).isSameOrAfter(now, 'day'))
                    .sort((a: any, b: any) => moment(a.fixture.date).diff(moment(b.fixture.date)));

                const pastFixtures = fixtures
                    .filter((fixture: any) => moment(fixture.fixture.date).isBefore(now, 'day'))
                    .sort((a: any, b: any) => moment(b.fixture.date).diff(moment(a.fixture.date)));

                return {
                    name: league.name,
                    fixtures: [...pastFixtures, ...futureFixtures]
                };
            }
            catch (error) {
                console.error(`Error fetching fixtures for ${league.name}:`, error);
                return { name: league.name, fixtures: [] };
            }
        })
    )

    return fixturesByLeague;
}

async function getPlayers(season: number): Promise<{ league: string; teams: { id: number; name: string; players: Player[] }[] }[]> {
    if (USE_SAMPLE) {
        return getPlayersSample();
    }

    const results = await Promise.all(
        leagues.map(async (league) => {
            try {
                const teams = await fetchTeamsByLeague(league.id, season);

                const teamsWithPlayers = await Promise.all(
                    teams.map(async (team: { id: number; name: string; logo: string }) => {
                        try {
                            const players = await fetchTeamSquad(team.id);
                            return { id: team.id, name: team.name, players };
                        }
                        catch (error) {
                            console.error(`Error fetching players for team ${team.id}:`, error);
                            return { id: team.id, name: team.name, players: [] };
                        }
                    })
                )

                return { league: league.name, teams: teamsWithPlayers };
            }
            catch (error) {
                console.error(`Error fetching teams for league ${league.id}:`, error);
                return { league: league.name, teams: [] };
            }
        })
    )

    return results;
}

async function fetchTeamsByLeague(leagueId: number, season: number) {
    if (USE_SAMPLE) {
        return [];
    }

    const url = `https://api-football-v1.p.rapidapi.com/v3/teams?league=${leagueId}&season=${season}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        next: { revalidate: 3600 }
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return Array.isArray(data.response) ? data.response.map((team: any) => ({
            id: team.team.id,
            name: team.team.name,
            logo: team.team.logo
        })) : [];
    }
    catch (error) {
        console.error(`Error fetching teams for league ${leagueId}:`, error);
        return [];
    }
}

async function fetchTeamSquad(teamId: number): Promise<Player[]> {
    if (USE_SAMPLE) {
        return [];
    }

    const url = `https://api-football-v1.p.rapidapi.com/v3/players/squads?team=${teamId}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        next: { revalidate: 3600 }
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!data.response || !data.response[0] || !data.response[0].players) {
            console.warn(`No players found for team ${teamId}`);
            return [];
        }

        return data.response[0].players.map((player: any) => ({
            id: player.id,
            name: player.name,
            age: player.age || 0,
            number: player.number || "N/A",
            position: player.position || "Unknown",
            photo: player.photo || "",
        }));
    }
    catch (error) {
        console.error(`Error fetching squad for team ${teamId}:`, error);
        return [];
    }
}
async function fetchPlayerDetails(playerId: string, season: number, teamSquadNumber?: number): Promise<PlayerExtended> {
    if (USE_SAMPLE) {
        return [] as unknown as PlayerExtended;
    }

    const url = `https://api-football-v1.p.rapidapi.com/v3/players?id=${playerId}&season=${season}`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
        },
        next: { revalidate: 3600 }
    };

    try {
        const response = await fetchWithRetry(url, options);
        const data = response.response;

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error(`No player data found for player ID ${playerId}`);
        }

        const playerData = data[0];
        const statistics = playerData.statistics.map((stat: any) => ({
            team: {
                id: stat.team.id,
                name: stat.team.name,
                logo: stat.team.logo || ""
            },
            league: {
                id: stat.league.id,
                name: stat.league.name,
                country: stat.league.country || "Unknown",
                logo: stat.league.logo || ""
            },
            games: {
                appearences: stat.games.appearences || 0,
                lineups: stat.games.lineups || 0,
                minutes: stat.games.minutes || 0,
                rating: stat.games.rating || "N/A",
                position: stat.games.position || "N/A"
            },
            substitutes: {
                in: stat.substitutes?.in || 0,
                out: stat.substitutes?.out || 0,
                bench: stat.substitutes?.bench || 0
            },
            shots: {
                total: stat.shots?.total || 0,
                on: stat.shots?.on || 0
            },
            goals: {
                total: stat.goals.total || 0,
                conceded: stat.goals.conceded || 0,
                assists: stat.goals.assists || 0,
                saves: stat.goals.saves || 0
            },
            passes: {
                total: stat.passes?.total || 0,
                key: stat.passes?.key || 0,
                accuracy: stat.passes?.accuracy || 0
            },
            tackles: {
                total: stat.tackles?.total || 0,
                blocks: stat.tackles?.blocks || 0,
                interceptions: stat.tackles?.interceptions || 0
            },
            duels: {
                total: stat.duels?.total || 0,
                won: stat.duels?.won || 0
            },
            dribbles: {
                attempts: stat.dribbles?.attempts || 0,
                success: stat.dribbles?.success || 0,
                past: stat.dribbles?.past || 0
            },
            fouls: {
                drawn: stat.fouls?.drawn || 0,
                committed: stat.fouls?.committed || 0
            },
            cards: {
                yellow: stat.cards?.yellow || 0,
                yellowred: stat.cards?.yellowred || 0,
                red: stat.cards?.red || 0
            },
            penalty: {
                won: stat.penalty?.won || 0,
                commited: stat.penalty?.commited || 0,
                scored: stat.penalty?.scored || 0,
                missed: stat.penalty?.missed || 0,
                saved: stat.penalty?.saved || 0
            },
        }))

        const position = statistics[0]?.games?.position || "N/A";

        return {
            ...playerData.player,
            number: playerData.player.number || teamSquadNumber || "N/A",
            position,
            statistics
        };
    }
    catch (error) {
        console.error("Error fetching player details:", error);
        throw error;
    }
}

async function fetchWithRetry(url: string, options: any, retries = 3): Promise<any> {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    catch (error) {
        if (retries > 0) {
            console.warn(`Retrying... ${retries} attempts left for URL: ${url}`);
            return fetchWithRetry(url, options, retries - 1);
        }
        console.error("Final failure after retries:", error);
        throw error;
    }
}

export { getStandings, getFixtures, getPlayers, fetchTeamSquad, fetchPlayerDetails };