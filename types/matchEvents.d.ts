export type MatchEventType =
    | "card"
    | "goal"
    | "injury_time"
    | "period"
    | "shootout"
    | "substitution"
    | "unknown"
    | "var";

export interface MatchEventPlayer {
    id?: number;
    name: string;
    short_name?: string;
}

export interface MatchTimelineEvent {
    id: string;
    type: MatchEventType;
    source_type: string;
    source_class?: string;
    minute?: number;
    added_time?: number;
    period?: string;
    is_home?: boolean;
    player?: MatchEventPlayer;
    assist?: MatchEventPlayer;
    player_in?: MatchEventPlayer;
    player_out?: MatchEventPlayer;
    reason?: string;
    text?: string;
    home_score?: number;
    away_score?: number;
    length?: number;
}

export interface MatchEventSnapshot {
    event_id: number | string;
    status: string;
    home_team?: string;
    away_team?: string;
    updated_at: string;
    events: MatchTimelineEvent[];
}

export interface MatchEventsArtifact {
    schema_version: 1;
    date: string;
    updated_at: string;
    matches: Record<string, MatchEventSnapshot>;
}

