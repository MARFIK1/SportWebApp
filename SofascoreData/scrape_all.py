"""
Scrape football data from Sofascore API.

Usage:
    python scrape_all.py                              # Current/latest season only (default)
    python scrape_all.py --all                        # Full 5-season scrape
    python scrape_all.py --type league                # Only domestic leagues
    python scrape_all.py --type cups                  # Only domestic cups
    python scrape_all.py --type european              # Only European competitions
    python scrape_all.py --type international          # Only international
    python scrape_all.py --league premier_league      # Specific league only
    python scrape_all.py --country england            # All competitions in a country
    python scrape_all.py --seasons 3                  # Override number of seasons
    python scrape_all.py --no-players                 # Skip player data
    python scrape_all.py --backfill-odds              # Backfill missing betting odds
    python scrape_all.py --backfill-odds --force      # Refresh betting odds through the next 2 days
    python scrape_all.py --backfill-odds --limit 100  # Backfill max 100 matches
    python scrape_all.py --show-seasons la_liga       # Show available season IDs

Requires Chrome/Brave browser for scraping (Selenium).
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sofascore import (
    COMPETITIONS,
    BASE_DIR,
    create_stealth_driver,
    SofascoreSeleniumScraper,
    FootballDataManager,
    PlayerDataManager,
    MLFeatureGenerator,
)
from sofascore.pipeline import scrape_competition, combine_all_seasons_data
from sofascore.utils import extract_odds, random_delay

COMP_TYPES = ['league', 'cups', 'european', 'international']
DEFAULT_SEASONS = 1
FULL_HISTORY_SEASONS = 5
ODDS_FIELDS = [
    'odds_home_win', 'odds_draw', 'odds_away_win',
    'odds_over_2_5', 'odds_under_2_5',
    'odds_btts_yes', 'odds_btts_no',
]
ODDS_REQUEST_DELAY = 1.5
ODDS_BATCH_SIZE = 25
ODDS_BATCH_PAUSE = 8.0
ODDS_NULL_ABORT_THRESHOLD = 20


def scrape_all(scraper, comp_types=None, country_filter=None, league_filter=None,
               num_seasons=DEFAULT_SEASONS, scrape_players=True):
    if comp_types is None:
        comp_types = COMP_TYPES

    results = {}

    for comp_type in comp_types:
        type_config = COMPETITIONS.get(comp_type, {})
        if not type_config:
            continue

        print(f"\n{'='*60}")
        print(f"  [{comp_type.upper()}]")
        print(f"{'='*60}")

        for country, country_comps in sorted(type_config.items()):
            if country_filter and country != country_filter:
                continue

            for comp_name, comp_data in sorted(country_comps.items()):
                if league_filter and comp_name != league_filter:
                    continue

                tournament_id = comp_data.get('tournament_id')
                if not tournament_id:
                    continue

                print(f"\n{'#'*60}")
                print(f"# {country.upper()} / {comp_name.upper()}")
                print(f"{'#'*60}")

                try:
                    data = scrape_competition(
                        scraper,
                        comp_type=comp_type,
                        country=country,
                        league=comp_name,
                        scrape_players=scrape_players,
                        num_seasons=num_seasons,
                    )
                    results[f"{comp_type}/{country}/{comp_name}"] = data
                except Exception as e:
                    print(f"[ERROR] {country}/{comp_name}: {e}")

    return results


def _season_sort_key(raw_file: Path, file_data: dict):
    season = str(file_data.get('metadata', {}).get('season') or raw_file.stem)
    match = re.search(r'(\d{2})[\/_](\d{2})', season)
    if match:
        return (int(match.group(1)), int(match.group(2)), raw_file.name)
    return (0, 0, raw_file.name)


def _load_backfill_raw_files(data_dir: Path, season_count: int):
    files_by_competition = {}

    for raw_file in sorted(data_dir.rglob('*.json')):
        if 'upcoming' in str(raw_file) or raw_file.name == 'all_seasons.json':
            continue
        if raw_file.parent.name != 'raw':
            continue
        try:
            with open(raw_file, 'r', encoding='utf-8') as f:
                file_data = json.load(f)
        except Exception:
            continue

        files_by_competition.setdefault(raw_file.parent, []).append(
            (_season_sort_key(raw_file, file_data), raw_file, file_data)
        )

    selected = []
    for entries in files_by_competition.values():
        entries.sort(key=lambda item: item[0], reverse=True)
        selected.extend(entries[:season_count])

    selected.sort(key=lambda item: str(item[1]))
    return [(raw_file, file_data) for _key, raw_file, file_data in selected]


def backfill_odds(
    scraper,
    limit=0,
    recent_days=0,
    upcoming_days=2,
    force=False,
    season_count=DEFAULT_SEASONS,
    request_delay=ODDS_REQUEST_DELAY,
    batch_size=ODDS_BATCH_SIZE,
    batch_pause=ODDS_BATCH_PAUSE,
    null_abort_threshold=ODDS_NULL_ABORT_THRESHOLD,
):
    print("\n" + "=" * 60)
    print("BACKFILL ODDS")
    print("=" * 60)
    print(f"Mode: {'refresh existing odds' if force else 'fill missing odds'}")
    print(f"Season files per competition: {season_count}")
    print(f"Request delay: ~{request_delay:.1f}s")
    if batch_size > 0 and batch_pause > 0:
        print(f"Batch pause: ~{batch_pause:.1f}s every {batch_size} matches")
    if null_abort_threshold > 0:
        print(f"Null-safety stop: {null_abort_threshold} consecutive API nulls")

    data_dir = Path(BASE_DIR)
    cutoff_date = None
    max_date = None
    today = datetime.now().date()
    if recent_days > 0:
        cutoff_date = (today - timedelta(days=recent_days)).strftime('%Y-%m-%d')
        print(f"Only matches from: {cutoff_date}")
    if upcoming_days > 0:
        if cutoff_date is None:
            cutoff_date = today.strftime('%Y-%m-%d')
        max_date = (today + timedelta(days=upcoming_days)).strftime('%Y-%m-%d')
        print(f"Only matches until: {max_date}")

    matches_to_update = []
    for raw_file, file_data in _load_backfill_raw_files(data_dir, season_count):
        for idx, match in enumerate(file_data.get('matches', [])):
            if match.get('odds_home_win') and not force:
                continue
            event_id = match.get('event_id')
            if not event_id:
                continue
            match_date = match.get('date', '')
            if cutoff_date and match_date < cutoff_date:
                continue
            if max_date and match_date > max_date:
                continue
            matches_to_update.append((str(raw_file), idx, event_id, match_date))

    if force:
        print(f"Found {len(matches_to_update)} matches to refresh")
    else:
        print(f"Found {len(matches_to_update)} matches without odds")

    if limit > 0:
        matches_to_update = matches_to_update[:limit]
        print(f"Limited to {limit} matches")

    if not matches_to_update:
        print("Nothing to do.")
        return

    file_updates = {}
    updated = 0
    no_odds = 0
    consecutive_nulls = 0

    for i, (filepath, idx, event_id, match_date) in enumerate(matches_to_update):
        print(f"  [{i+1}/{len(matches_to_update)}] event_id={event_id} ({match_date})...", end=' ')

        odds_markets = scraper.get_match_odds(event_id)
        if odds_markets:
            consecutive_nulls = 0
            odds = extract_odds(odds_markets)
            if odds:
                if filepath not in file_updates:
                    file_updates[filepath] = {}
                file_updates[filepath][idx] = odds
                updated += 1
                print(f"OK ({len(odds)} fields)")
            else:
                no_odds += 1
                print("no odds data")
        else:
            no_odds += 1
            consecutive_nulls += 1
            print("API returned null")

        if null_abort_threshold > 0 and consecutive_nulls >= null_abort_threshold:
            print(
                f"\n[WARN] {consecutive_nulls} consecutive odds requests returned null. "
                "Sofascore may be rate-limiting/captcha-blocking this browser session. "
                "Stopping early to avoid hammering the endpoint."
            )
            break

        time.sleep(max(0.1, random_delay(request_delay, min(0.6, request_delay * 0.35))))

        if (i + 1) % 50 == 0 and file_updates:
            _save_odds_updates(file_updates, overwrite_odds=force)
            file_updates.clear()
            print(f"  [CHECKPOINT] Saved {updated} matches so far")

        if (
            batch_size > 0
            and batch_pause > 0
            and (i + 1) % batch_size == 0
            and (i + 1) < len(matches_to_update)
        ):
            if file_updates:
                _save_odds_updates(file_updates, overwrite_odds=force)
                file_updates.clear()
                print(f"[CHECKPOINT] Saved {updated} matches so far")
            print(f"[PAUSE] Sleeping before next odds batch")
            time.sleep(max(1.0, random_delay(batch_pause, min(2.0, batch_pause * 0.25))))

    if file_updates:
        _save_odds_updates(file_updates, overwrite_odds=force)

    print(f"\n[OK] Updated: {updated}, No odds: {no_odds}")


def _save_odds_updates(file_updates, overwrite_odds=False):
    for fp, idx_odds in file_updates.items():
        with open(fp, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for midx, modds in idx_odds.items():
            if midx < len(data.get('matches', [])):
                if overwrite_odds:
                    for odds_field in ODDS_FIELDS:
                        data['matches'][midx].pop(odds_field, None)
                data['matches'][midx].update(modds)
        if data.get('metadata'):
            data['metadata']['last_update'] = datetime.now().isoformat()
        with open(fp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


def show_seasons(scraper, league_name):
    print(f"\nSearching for '{league_name}' in COMPETITIONS...")

    found = False
    for comp_type, countries in COMPETITIONS.items():
        for country, leagues in countries.items():
            for comp_name, config in leagues.items():
                if league_name not in comp_name:
                    continue

                found = True
                tournament_id = config['tournament_id']
                print(f"\n[COMPETITION] {comp_type}/{country}/{comp_name} (tournament_id: {tournament_id})")

                seasons = scraper.get_seasons(tournament_id)
                if not seasons:
                    print("  Failed to fetch seasons")
                    continue

                print(f"  Available seasons ({len(seasons)}):")
                for s in seasons[:15]:
                    print(f"    '{s.get('name', '?')}': {s['id']},")

                print(f"\n  # For COMPETITIONS config:")
                for s in seasons[:8]:
                    print(f"    \"{s.get('name', '?')}\": {s['id']},")

    if not found:
        print(f"  No competition matching '{league_name}' found in COMPETITIONS config.")


def main():
    parser = argparse.ArgumentParser(
        description='Scrape football data from Sofascore API.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scrape_all.py                          # Current/latest season for all competitions
  python scrape_all.py --all                    # Full 5-season scrape
  python scrape_all.py --type league            # Only domestic leagues
  python scrape_all.py --type cups --type european  # Cups + European
  python scrape_all.py --league premier_league  # Just Premier League
  python scrape_all.py --country england        # All English competitions
  python scrape_all.py --seasons 3              # Custom season count
  python scrape_all.py --backfill-odds          # Add missing betting odds
  python scrape_all.py --backfill-odds --force  # Refresh betting odds through the next 2 days
  python scrape_all.py --show-seasons la_liga   # Check season IDs
"""
    )

    parser.add_argument('--type', action='append', dest='types',
                        choices=COMP_TYPES,
                        help='Competition type(s) to scrape (can repeat)')
    parser.add_argument('--country', type=str,
                        help='Filter by country (e.g. england, spain)')
    parser.add_argument('--league', type=str,
                        help='Filter by league name (e.g. premier_league)')
    parser.add_argument('--all', action='store_true',
                        help=f'Scrape the full {FULL_HISTORY_SEASONS}-season history instead of only the current/latest season')
    parser.add_argument('--seasons', type=int,
                        help=f'Custom number of seasons to scrape (default: {DEFAULT_SEASONS}; --all uses {FULL_HISTORY_SEASONS})')
    parser.add_argument('--no-players', action='store_true',
                        help='Skip player data scraping')

    parser.add_argument('--backfill-odds', action='store_true',
                        help='Backfill missing betting odds')
    parser.add_argument('--force', action='store_true',
                        help='Refresh existing odds during odds backfill')
    parser.add_argument('--limit', type=int, default=0,
                        help='Max matches for odds backfill (0 = all)')
    parser.add_argument('--recent-days', type=int, default=0,
                        help='Only backfill odds for last N days (0 = all)')
    parser.add_argument('--upcoming-days', type=int, default=2,
                        help='Only backfill odds from today through N days ahead (default: 2; 0 = no upper date limit)')
    parser.add_argument('--odds-delay', type=float, default=ODDS_REQUEST_DELAY,
                        help=f'Base delay between odds requests in seconds (default: {ODDS_REQUEST_DELAY})')
    parser.add_argument('--odds-batch-size', type=int, default=ODDS_BATCH_SIZE,
                        help=f'Pause after this many odds requests (default: {ODDS_BATCH_SIZE}; 0 = no batch pause)')
    parser.add_argument('--odds-batch-pause', type=float, default=ODDS_BATCH_PAUSE,
                        help=f'Batch pause in seconds during odds backfill (default: {ODDS_BATCH_PAUSE})')
    parser.add_argument('--odds-null-abort', type=int, default=ODDS_NULL_ABORT_THRESHOLD,
                        help=f'Stop after N consecutive null odds responses (default: {ODDS_NULL_ABORT_THRESHOLD}; 0 = disabled)')

    parser.add_argument('--show-seasons', type=str, metavar='LEAGUE',
                        help='Show available season IDs for a competition')

    args = parser.parse_args()

    print("=" * 60)
    print("SOFASCORE SCRAPER")
    print("=" * 60)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    driver, user_agent = create_stealth_driver(headless=False)
    scraper = SofascoreSeleniumScraper(driver)

    driver.get("https://www.sofascore.com")
    time.sleep(3)

    try:
        if args.show_seasons:
            show_seasons(scraper, args.show_seasons)
            return

        if args.all and args.seasons is not None:
            parser.error('--all cannot be combined with --seasons')

        if args.seasons is not None and args.seasons < 1:
            parser.error('--seasons must be at least 1')

        if args.seasons is not None:
            season_count = args.seasons
            mode = "custom"
        elif args.all:
            season_count = FULL_HISTORY_SEASONS
            mode = "full history"
        else:
            season_count = DEFAULT_SEASONS
            mode = "current/latest"

        if args.backfill_odds:
            print(f"Season count: {season_count} ({mode})")
            backfill_odds(
                scraper,
                limit=args.limit,
                recent_days=args.recent_days,
                upcoming_days=args.upcoming_days,
                force=args.force,
                season_count=season_count,
                request_delay=args.odds_delay,
                batch_size=args.odds_batch_size,
                batch_pause=args.odds_batch_pause,
                null_abort_threshold=args.odds_null_abort,
            )
            return

        print(f"Season count: {season_count} ({mode})")

        comp_types = args.types or COMP_TYPES
        results = scrape_all(
            scraper,
            comp_types=comp_types,
            country_filter=args.country,
            league_filter=args.league,
            num_seasons=season_count,
            scrape_players=not args.no_players,
        )

        print(f"\n{'='*60}")
        print(f"COMPLETED: {len(results)} competitions scraped")
        print(f"{'='*60}")

    finally:
        driver.quit()
        print("\nBrowser closed.")


if __name__ == '__main__':
    main()
