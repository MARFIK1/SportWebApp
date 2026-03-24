"""
Scrape football data from Sofascore API.

Usage:
    python scrape_all.py                              # All leagues (default)
    python scrape_all.py --type league                # Only domestic leagues
    python scrape_all.py --type cups                  # Only domestic cups
    python scrape_all.py --type european              # Only European competitions
    python scrape_all.py --type international          # Only international
    python scrape_all.py --league premier_league      # Specific league only
    python scrape_all.py --country england            # All competitions in a country
    python scrape_all.py --seasons 3                  # Override number of seasons
    python scrape_all.py --no-players                 # Skip player data
    python scrape_all.py --backfill-odds              # Backfill missing betting odds
    python scrape_all.py --backfill-odds --limit 100  # Backfill max 100 matches
    python scrape_all.py --show-seasons la_liga       # Show available season IDs

Requires Chrome/Brave browser for scraping (Selenium).
"""

import argparse
import json
import os
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

# Optimal season counts for international tournaments
# (they run every 2-4 years, not annually like leagues)
INTERNATIONAL_SEASONS = {
    'euro': 2,
    'world_cup': 2,
    'nations_league': 3,
    'euro_qualifiers': 2,
    'world_cup_qualifiers_europe': 2,
}

COMP_TYPES = ['league', 'cups', 'european', 'international']


def scrape_all(scraper, comp_types=None, country_filter=None, league_filter=None,
               num_seasons=5, scrape_players=True):
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

                if comp_type == 'international':
                    seasons = INTERNATIONAL_SEASONS.get(comp_name, 3)
                else:
                    seasons = num_seasons

                try:
                    data = scrape_competition(
                        scraper,
                        comp_type=comp_type,
                        country=country,
                        league=comp_name,
                        scrape_players=scrape_players,
                        num_seasons=seasons,
                    )
                    results[f"{comp_type}/{country}/{comp_name}"] = data
                except Exception as e:
                    print(f"[ERROR] {country}/{comp_name}: {e}")

    return results


def backfill_odds(scraper, limit=0, recent_days=0):
    print("\n" + "=" * 60)
    print("BACKFILL ODDS")
    print("=" * 60)

    data_dir = Path(BASE_DIR)
    cutoff_date = None
    if recent_days > 0:
        cutoff_date = (datetime.now() - timedelta(days=recent_days)).strftime('%Y-%m-%d')
        print(f"Only matches from: {cutoff_date}")

    matches_to_update = []
    for raw_file in sorted(data_dir.rglob('*.json')):
        if 'upcoming' in str(raw_file) or 'all_seasons' in raw_file.name:
            continue
        if raw_file.parent.name != 'raw':
            continue
        try:
            with open(raw_file, 'r', encoding='utf-8') as f:
                file_data = json.load(f)
        except Exception:
            continue

        for idx, match in enumerate(file_data.get('matches', [])):
            if match.get('odds_home_win'):
                continue
            event_id = match.get('event_id')
            if not event_id:
                continue
            match_date = match.get('date', '')
            if cutoff_date and match_date < cutoff_date:
                continue
            matches_to_update.append((str(raw_file), idx, event_id, match_date))

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

    for i, (filepath, idx, event_id, match_date) in enumerate(matches_to_update):
        print(f"  [{i+1}/{len(matches_to_update)}] event_id={event_id} ({match_date})...", end=' ')

        odds_markets = scraper.get_match_odds(event_id)
        if odds_markets:
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
            print("API returned null")

        time.sleep(random_delay(0.5, 0.3))

        if (i + 1) % 50 == 0 and file_updates:
            _save_odds_updates(file_updates)
            file_updates.clear()
            print(f"  [CHECKPOINT] Saved {updated} matches so far")

    if file_updates:
        _save_odds_updates(file_updates)

    print(f"\n[OK] Updated: {updated}, No odds: {no_odds}")


def _save_odds_updates(file_updates):
    for fp, idx_odds in file_updates.items():
        with open(fp, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for midx, modds in idx_odds.items():
            if midx < len(data.get('matches', [])):
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
  python scrape_all.py                          # All leagues, cups, european, international
  python scrape_all.py --type league            # Only domestic leagues
  python scrape_all.py --type cups --type european  # Cups + European
  python scrape_all.py --league premier_league  # Just Premier League
  python scrape_all.py --country england        # All English competitions
  python scrape_all.py --backfill-odds          # Add missing betting odds
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
    parser.add_argument('--seasons', type=int, default=5,
                        help='Number of seasons to scrape (default: 5)')
    parser.add_argument('--no-players', action='store_true',
                        help='Skip player data scraping')

    parser.add_argument('--backfill-odds', action='store_true',
                        help='Backfill missing betting odds')
    parser.add_argument('--limit', type=int, default=0,
                        help='Max matches for odds backfill (0 = all)')
    parser.add_argument('--recent-days', type=int, default=0,
                        help='Only backfill odds for last N days (0 = all)')

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

        if args.backfill_odds:
            backfill_odds(scraper, limit=args.limit, recent_days=args.recent_days)
            return

        comp_types = args.types or COMP_TYPES
        results = scrape_all(
            scraper,
            comp_types=comp_types,
            country_filter=args.country,
            league_filter=args.league,
            num_seasons=args.seasons,
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
