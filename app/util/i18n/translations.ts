export type Locale = "en" | "pl";

const translations: Record<Locale, Record<string, string>> = {
    en: {
        // Nav
        home: "Home",
        predictions: "Predictions",
        search_placeholder: "Search teams & players...",

        // Common
        not_found: "Not found",
        match_not_found: "Match not found",
        team_not_found: "Team not found",
        player_not_found: "Player not found",
        no_data: "No prediction data available",
        today: "TODAY",

        // Home
        matches_analyzed: "matches analyzed",
        all_completed: "All matches completed",
        accuracy: "Accuracy",
        view_standings: "VIEW STANDINGS",
        finished: "Finished",
        scheduled: "Scheduled / Postponed",

        // Predictions
        total_matches_today: "Total Matches Today",
        consensus_accuracy: "Consensus Accuracy",
        best_model_day: "Best Model (Day)",
        model_performance: "Model Performance",
        all_time: "all time",
        all_leagues: "All Leagues",

        // Match
        full_time: "FULL TIME",
        postponed: "Postponed",
        not_started: "Not Started",
        expected_goals: "Expected Goals (xG)",
        head_to_head: "Head to Head",
        match_insight: "Match Insight",
        consensus: "CONSENSUS",
        model_confidence: "Model Confidence",
        agreement: "Agreement",
        result: "Result",
        correct: "Correct",
        incorrect: "Incorrect",
        advanced_markets: "Advanced Markets",
        pre_match_analysis: "Pre-Match Analysis",
        btts_probability: "BTTS Probability",
        over_25: "Over 2.5 Goals",
        expected_corners: "Expected Corners",
        expected_cards: "Expected Cards",
        home_form: "Home Form",
        away_form: "Away Form",
        all_model_predictions: "All Model Predictions",
        show_all: "Show all stats",
        show_less: "Show less",
        model: "Model",
        prediction: "Prediction",
        confidence: "Confidence",

        // Team
        rank: "Rank",
        played: "Played",
        wins: "Wins",
        draws: "Draws",
        losses: "Losses",
        gf_ga: "GF / GA",
        gd: "GD",
        points: "Points",
        form: "Form",
        upcoming_matches: "Upcoming Matches",
        recent_results: "Recent Results",
        squad: "Squad",
        goalkeepers: "Goalkeepers",
        defenders: "Defenders",
        midfielders: "Midfielders",
        forwards: "Forwards",

        // Player
        team: "Team",
        age: "Age",
        height: "Height",
        position: "Position",
        recent_team_matches: "Recent Team Matches",
        goalkeeper: "Goalkeeper",
        defender: "Defender",
        midfielder: "Midfielder",
        forward: "Forward",

        // MatchCard
        ml_prediction: "ML Prediction",
        home_win: "Home Win",
        away_win: "Away Win",
        draw: "Draw",
        kick_off: "KICK OFF",

        // Extra
        match_statistics: "Match Statistics",
        matches_count: "matches",
        pending: "pending",
        ft: "FT",
        home_pct: "Home %",
        draw_pct: "Draw %",
        away_pct: "Away %",
        group: "Group",
        playoffs: "Playoffs",
        season: "Season",
    },
    pl: {
        // Nav
        home: "Strona g\u0142\u00f3wna",
        predictions: "Predykcje",
        search_placeholder: "Szukaj dru\u017cyn i graczy...",

        // Common
        not_found: "Nie znaleziono",
        match_not_found: "Nie znaleziono meczu",
        team_not_found: "Nie znaleziono dru\u017cyny",
        player_not_found: "Nie znaleziono gracza",
        no_data: "Brak danych predykcji",
        today: "DZI\u015A",

        // Home
        matches_analyzed: "mecz\u00f3w przeanalizowanych",
        all_completed: "Wszystkie mecze zako\u0144czone",
        accuracy: "Skuteczno\u015b\u0107",
        view_standings: "TABELA",
        finished: "Zako\u0144czone",
        scheduled: "Zaplanowane / Prze\u0142o\u017cone",

        // Predictions
        total_matches_today: "Mecze dzisiaj",
        consensus_accuracy: "Skuteczno\u015b\u0107 konsensusu",
        best_model_day: "Najlepszy model (dzie\u0144)",
        model_performance: "Wyniki modeli",
        all_time: "ca\u0142kowite",
        all_leagues: "Wszystkie ligi",

        // Match
        full_time: "KONIEC MECZU",
        postponed: "Prze\u0142o\u017cony",
        not_started: "Nie rozpocz\u0119ty",
        expected_goals: "Oczekiwane bramki (xG)",
        head_to_head: "Bezpo\u015brednie mecze",
        match_insight: "Analiza meczu",
        consensus: "KONSENSUS",
        model_confidence: "Pewno\u015b\u0107 modelu",
        agreement: "Zgodno\u015b\u0107",
        result: "Wynik",
        correct: "Trafiony",
        incorrect: "Nietrafiony",
        advanced_markets: "Zaawansowane rynki",
        pre_match_analysis: "Analiza przedmeczowa",
        btts_probability: "Obie strzel\u0105 (BTTS)",
        over_25: "Powy\u017cej 2.5 bramek",
        expected_corners: "Oczekiwane rzuty ro\u017cne",
        expected_cards: "Oczekiwane kartki",
        home_form: "Forma gospodarzy",
        away_form: "Forma go\u015bci",
        all_model_predictions: "Predykcje wszystkich modeli",
        show_all: "Poka\u017c wszystkie statystyki",
        show_less: "Poka\u017c mniej",
        model: "Model",
        prediction: "Predykcja",
        confidence: "Pewno\u015b\u0107",

        // Team
        rank: "Pozycja",
        played: "Rozegrane",
        wins: "Wygrane",
        draws: "Remisy",
        losses: "Pora\u017cki",
        gf_ga: "BZ / BS",
        gd: "R\u00f3\u017cnica",
        points: "Punkty",
        form: "Forma",
        upcoming_matches: "Nadchodz\u0105ce mecze",
        recent_results: "Ostatnie wyniki",
        squad: "Kadra",
        goalkeepers: "Bramkarze",
        defenders: "Obro\u0144cy",
        midfielders: "Pomocnicy",
        forwards: "Napastnicy",

        // Player
        team: "Dru\u017cyna",
        age: "Wiek",
        height: "Wzrost",
        position: "Pozycja",
        recent_team_matches: "Ostatnie mecze dru\u017cyny",
        goalkeeper: "Bramkarz",
        defender: "Obro\u0144ca",
        midfielder: "Pomocnik",
        forward: "Napastnik",

        // MatchCard
        ml_prediction: "Predykcja ML",
        home_win: "Wygrana gosp.",
        away_win: "Wygrana go\u015bci",
        draw: "Remis",
        kick_off: "POCZ\u0104TEK",

        // Extra
        match_statistics: "Statystyki meczu",
        matches_count: "mecz\u00f3w",
        pending: "oczekuj\u0105cych",
        ft: "KM",
        home_pct: "Gosp. %",
        draw_pct: "Remis %",
        away_pct: "Go\u015bcie %",
        group: "Grupa",
        playoffs: "Bara\u017ce",
        season: "Sezon",
    },
};

export function getTranslations(locale: Locale): (key: string) => string {
    const dict = translations[locale];
    return (key: string) => dict[key] ?? key;
}

export default translations;
