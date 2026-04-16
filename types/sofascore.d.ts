export interface SofascoreMatch {
    event_id: number;
    date: string;
    round: number;
    home_team_id: number;
    home_team: string;
    away_team_id: number;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    home_score_ht: number | null;
    away_score_ht: number | null;
    home_score_et?: number | null;
    away_score_et?: number | null;
    home_score_pen?: number | null;
    away_score_pen?: number | null;
    status: string;
    season: string;

    home_ballpossession: number | null;
    away_ballpossession: number | null;
    home_expectedgoals: number | null;
    away_expectedgoals: number | null;
    home_xg: number | null;
    away_xg: number | null;
    home_bigchancecreated: number | null;
    away_bigchancecreated: number | null;
    home_totalshotsongoal: number | null;
    away_totalshotsongoal: number | null;
    home_shotsongoal: number | null;
    away_shotsongoal: number | null;
    home_shotsoffgoal: number | null;
    away_shotsoffgoal: number | null;
    home_blockedscoringattempt: number | null;
    away_blockedscoringattempt: number | null;
    home_totalshotsinsidebox: number | null;
    away_totalshotsinsidebox: number | null;
    home_totalshotsoutsidebox: number | null;
    away_totalshotsoutsidebox: number | null;
    home_goalkeepersaves: number | null;
    away_goalkeepersaves: number | null;

    home_cornerkicks: number | null;
    away_cornerkicks: number | null;
    home_fouls: number | null;
    away_fouls: number | null;
    home_passes: number | null;
    away_passes: number | null;
    home_accuratepasses: number | null;
    away_accuratepasses: number | null;
    home_totaltackle: number | null;
    away_totaltackle: number | null;
    home_freekicks: number | null;
    away_freekicks: number | null;
    home_yellowcards: number | null;
    away_yellowcards: number | null;
    home_offsides: number | null;
    away_offsides: number | null;
    home_throwins: number | null;
    away_throwins: number | null;

    home_hitwoodwork: number | null;
    away_hitwoodwork: number | null;
    home_bigchancemissed: number | null;
    away_bigchancemissed: number | null;
    home_accuratethroughball: number | null;
    away_accuratethroughball: number | null;
    home_touchesinoppbox: number | null;
    away_touchesinoppbox: number | null;
    home_fouledfinalthird: number | null;
    away_fouledfinalthird: number | null;
    home_finalthirdentries: number | null;
    away_finalthirdentries: number | null;
    home_finalthirdphasestatistic: number | null;
    away_finalthirdphasestatistic: number | null;
    home_accuratelongballs: number | null;
    away_accuratelongballs: number | null;
    home_accuratecross: number | null;
    away_accuratecross: number | null;

    home_duelwonpercent: number | null;
    away_duelwonpercent: number | null;
    home_dispossessed: number | null;
    away_dispossessed: number | null;
    home_groundduelspercentage: number | null;
    away_groundduelspercentage: number | null;
    home_aerialduelspercentage: number | null;
    away_aerialduelspercentage: number | null;
    home_dribblespercentage: number | null;
    away_dribblespercentage: number | null;
    home_wontacklepercent: number | null;
    away_wontacklepercent: number | null;
    home_interceptionwon: number | null;
    away_interceptionwon: number | null;
    home_ballrecovery: number | null;
    away_ballrecovery: number | null;
    home_totalclearance: number | null;
    away_totalclearance: number | null;
    home_errorsleadtoshot: number | null;
    away_errorsleadtoshot: number | null;

    home_goalsprevented: number | null;
    away_goalsprevented: number | null;
    home_divesaves: number | null;
    away_divesaves: number | null;
    home_highclaims: number | null;
    away_highclaims: number | null;
    home_punches: number | null;
    away_punches: number | null;
    home_goalkicks: number | null;
    away_goalkicks: number | null;

    home_yellow_cards_calc: number | null;
    away_yellow_cards_calc: number | null;
    home_red_cards_calc: number | null;
    away_red_cards_calc: number | null;

    odds_home_win: number | null;
    odds_draw: number | null;
    odds_away_win: number | null;
    odds_btts_yes: number | null;
    odds_btts_no: number | null;
}

export interface SofascoreUpcomingMatch {
    event_id: number;
    status: string;
    date: string;
    time: string;
    round: number;
    home_team_id: number;
    home_team: string;
    away_team_id: number;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    home_score_ht: number | null;
    away_score_ht: number | null;
    odds_home_win: number | null;
    odds_draw: number | null;
    odds_away_win: number | null;
}

export interface SofascoreMatchFile {
    metadata: {
        competition_type: string;
        country: string;
        league: string;
        season: string;
        scraped_at: string;
        total_matches: number;
        finished_matches: number;
        upcoming_matches: number;
        last_update: string;
    };
    matches: SofascoreMatch[];
}

export interface SofascoreUpcomingFile {
    metadata: Record<string, unknown>;
    matches: SofascoreUpcomingMatch[];
    features?: Record<string, unknown>[];
}
