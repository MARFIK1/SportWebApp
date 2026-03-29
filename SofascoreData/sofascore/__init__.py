from .config import (
    BASE_DIR,
    COMPETITIONS,
    get_competition,
    get_competition_path,
    list_all_competitions,
)

from .scraper import (
    SofascoreSeleniumScraper,
    create_stealth_driver,
    USER_AGENTS,
    VIEWPORTS,
)

from .managers import (
    FootballDataManager,
    PlayerDataManager,
)

from .features import MLFeatureGenerator

from .predictor import (
    UniversalPredictor,
    TARGET_CONFIGS,
    quick_predict,
    predict_all_leagues,
)

from .lstm_model import LSTMPredictor

from .utils import (
    extract_match_data,
    extract_referee_data,
    extract_statistics,
    random_delay,
    scrape_full_match_data,
    load_existing_data,
    get_existing_event_ids,
    merge_and_sort_matches,
)

from .pipeline import (
    scrape_season_matches_incremental,
    scrape_player_data_incremental,
    scrape_competition,
    combine_all_seasons_data,
    scrape_upcoming_matches,
)

__all__ = [
    'BASE_DIR',
    'COMPETITIONS',
    'get_competition',
    'get_competition_path',
    'list_all_competitions',
    'SofascoreSeleniumScraper',
    'create_stealth_driver',
    'USER_AGENTS',
    'VIEWPORTS',
    'FootballDataManager',
    'PlayerDataManager',
    'MLFeatureGenerator',
    'UniversalPredictor',
    'TARGET_CONFIGS',
    'quick_predict',
    'predict_all_leagues',
    'LSTMPredictor',
    'extract_match_data',
    'extract_referee_data',
    'extract_statistics',
    'random_delay',
    'scrape_full_match_data',
    'load_existing_data',
    'get_existing_event_ids',
    'merge_and_sort_matches',
    'scrape_season_matches_incremental',
    'scrape_player_data_incremental',
    'scrape_competition',
    'combine_all_seasons_data',
    'scrape_upcoming_matches',
]

__version__ = '1.0.0'
