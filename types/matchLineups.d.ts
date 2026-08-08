export interface MatchLineupPlayer {
    id?: number;
    name: string;
    short_name?: string;
    position?: string;
    jersey_number?: string;
    captain?: boolean;
    rating?: number;
}

export interface MatchLineupSide {
    formation?: string;
    starters: MatchLineupPlayer[];
    substitutes: MatchLineupPlayer[];
}

export interface MatchTopRatedPlayer extends MatchLineupPlayer {
    team_side: "home" | "away";
    selection_method: "highest_rating";
}

export interface MatchPlayerOfTheMatch extends MatchLineupPlayer {
    team_side: "home" | "away";
    selection_method: "official";
}

export interface MatchLineupSnapshot {
    event_id: number | string;
    status: string;
    home_team?: string;
    away_team?: string;
    updated_at: string;
    confirmed: boolean;
    home: MatchLineupSide;
    away: MatchLineupSide;
    player_of_the_match?: MatchPlayerOfTheMatch;
    top_rated_player?: MatchTopRatedPlayer;
}

export interface MatchLineupsArtifact {
    schema_version: 1;
    date: string;
    updated_at: string;
    summary?: {
        matches_with_lineups: number;
        official_player_of_the_match: number;
        top_rated_player: number;
        top_rated_fallback: number;
    };
    matches: Record<string, MatchLineupSnapshot>;
}
