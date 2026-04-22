export type MatchResult = "HOME" | "DRAW" | "AWAY";

export interface ModelPrediction {
    prediction: MatchResult;
    prediction_int: number;
    model: string;
    calibrated?: boolean;
    probabilities: Record<MatchResult, number>;
    confidence: number;
    correct: boolean;
}

export interface ConsensusPrediction {
    prediction: MatchResult;
    agreement: string;
    agreement_pct: number;
    votes: Record<MatchResult, number>;
    avg_probabilities: Record<MatchResult, number>;
    correct: boolean;
}

export interface MarketModelPrediction {
    prediction: string | number;
    confidence: number | null;
    probabilities: Record<string, number>;
}

export interface MarketConsensus {
    prediction: string | number;
    agreement: string | null;
    agreement_pct: number | null;
    avg_probabilities: Record<string, number>;
}

export interface MarketPrediction {
    models: Record<string, MarketModelPrediction>;
    consensus: MarketConsensus;
}

export type PredictionVariantKey = "without_odds" | "with_odds";

export interface PredictionVariant {
    predictions: Record<string, ModelPrediction>;
    consensus: ConsensusPrediction;
    market_predictions?: {
        btts?: MarketPrediction;
        over_1_5?: MarketPrediction;
        over_2_5?: MarketPrediction;
        corners_over_8_5?: MarketPrediction;
        corners_over_10_5?: MarketPrediction;
        cards_over_3_5?: MarketPrediction;
        cards_over_4_5?: MarketPrediction;
        total_goals?: MarketPrediction;
        total_corners?: MarketPrediction;
        total_cards?: MarketPrediction;
        [key: string]: MarketPrediction | undefined;
    };
    odds_used: boolean;
    missing_odds_by_target?: Record<string, string[]>;
    skipped_targets?: string[];
}

export interface PredictionMatch {
    id: string;
    event_id?: number | null;
    league: string;
    comp_type: string;
    home_team: string;
    away_team: string;
    start_time: string;
    status: string;
    actual_result: MatchResult | null;
    actual_score: string | null;
    actual_cards: number | null;
    actual_corners: number | null;
    referee_name: string | null;
    predictions: Record<string, ModelPrediction> & { consensus: ConsensusPrediction };
    market_predictions: {
        btts: MarketPrediction;
        over_1_5: MarketPrediction;
        over_2_5: MarketPrediction;
        corners_over_8_5: MarketPrediction;
        corners_over_10_5: MarketPrediction;
        cards_over_3_5: MarketPrediction;
        cards_over_4_5: MarketPrediction;
        total_goals: MarketPrediction;
        total_corners: MarketPrediction;
        total_cards: MarketPrediction;
    };
    default_prediction_variant?: PredictionVariantKey;
    prediction_variants?: Partial<Record<PredictionVariantKey, PredictionVariant>>;
}

export interface ModelAccuracy {
    correct: number;
    incorrect: number;
    total: number;
    accuracy_pct: number;
}

export interface PredictionReport {
    date: string;
    status: string;
    generated_at: string;
    updated_at: string;
    summary: {
        total_matches: number;
        finished_matches: number;
        postponed_matches: number;
        inprogress_matches: number;
        unknown_matches: number;
        pending_matches: number;
        model_accuracy: Record<string, ModelAccuracy>;
    };
    matches: PredictionMatch[];
}

export interface AnalysisGoalsSide {
    avg_scored: number;
    avg_conceded: number;
    clean_sheets: number;
    failed_to_score: number;
    score_pct: number;
    avg_xg_for: number;
    avg_xg_against: number;
    n: number;
}

export interface AnalysisMatch {
    goals: {
        home: AnalysisGoalsSide;
        away: AnalysisGoalsSide;
        expected_goals_home: number;
        expected_goals_away: number;
        expected_total: number;
        btts_pct: number;
        over_1_5_pct: number;
        over_2_5_pct: number;
        over_3_5_pct: number;
    };
    corners: {
        home: { avg_for: number; avg_against: number; n: number };
        away: { avg_for: number; avg_against: number; n: number };
        expected_total: number;
        over_8_5_pct: number;
        over_10_5_pct: number;
    };
    cards: {
        home: { avg_team: number; n: number };
        away: { avg_team: number; n: number };
        expected_total: number;
        over_3_5_pct: number;
        over_4_5_pct: number;
    };
    shots: {
        home: { avg_shots: number; avg_shots_on_target: number; avg_big_chances: number; avg_possession: number; n: number };
        away: { avg_shots: number; avg_shots_on_target: number; avg_big_chances: number; avg_possession: number; n: number };
    };
    form: {
        home: string;
        away: string;
        home_n: number;
        away_n: number;
    };
}

export interface AnalysisReport {
    date: string;
    generated_at: string;
    matches: Record<string, AnalysisMatch>;
}
