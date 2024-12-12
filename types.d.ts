type Standing = {
    league: League;
}

type League = {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    standings: [
        Team[]
    ]
}

type Team = {
    rank: number;
    team: {
        id: number;
        name: string;
        logo: string;
    }
    points: number;
    goalsDiff: number;
    group: string;
    form: string;
    status: string;
    description: string;
    all: Games;
    home: Games;
    away: Games;
    update: string;
}

type Games = {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: {
        for: number;
        against: number;
    }
}

type FixtureInfo = {
    id: number;
    referee: string;
    timezone: string;
    date: string;
    timestamp: number;
    periods: {
        first: number;
        second: number;
    }
    venue: {
        id: number;
        name: string;
        city: string;
    }
    status: {
        long: string;
        short: string;
        elapsed: number;
    }
}

type LeagueFixtures = {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    round: string;
}

type Teams = {
    home: {
        id: number;
        name: string;
        logo: string;
        winner: boolean;
    }
    away: {
        id: number;
        name: string;
        logo: string;
        winner: boolean;
    }
}

type Goals = {
    home: number;
    away: number;
}

type Score = {
    halftime: Goals;
    fulltime: Goals;
    extratime: Goals;
    penalty: Goals;
}

type Fixture = {
    fixture: FixtureInfo;
    league: LeagueFixtures;
    teams: Teams;
    goals: Goals;
    score: Score;
}

type AllFixtures = {
    name: string;
    fixtures: Fixture[];
}

type Player = {
    id: number;
    name: string;
    age: number;
    number: number;
    position: string;
    photo: string;
}

type PlayerExtended = Player & {
    firstname: string;
    lastname: string;
    birth: {
        date: string;
        place: string;
        country: string;
    }
    nationality: string;
    height: string;
    weight: string;
    injured: boolean;
    statistics: Array<{
        team: {
            id: number;
            name: string;
            logo: string;
        }
        league: {
            id: number;
            name: string;
            country: string;
            logo: string;
        }
        games: {
            appearences: number;
            lineups: number;
            minutes: number;
            rating: string;
        }
        substitutes: {
            in: number;
            out: number;
            bench: number;
        }
        shots: {
            total: number;
            on: number;
        }
        goals: {
            total: number;
            conceded: number;
            assists: number;
            saves: number;
        }
        passes: {
            total: number;
            key: number;
            accuracy: number;
        }
        tackles: {
            total: number;
            blocks: number;
            interceptions: number;
        }
        duels: {
            total: number;
            won: number;
        }
        dribbles: {
            attempts: number;
            success: number;
            past: number;
        }
        fouls: {
            drawn: number;
            committed: number;
        }
        cards: {
            yellow: number;
            yellowred: number;
            red: number;
        }
        penalty: {
            won: number;
            commited: number;
            scored: number;
            missed: number;
            saved: number;
        }
    }>
}

export { Standing, Team, AllFixtures, Fixture, Player, PlayerExtended };