"""
Scraping pipeline functions for Sofascore data.
"""

import os
import json
import time
from datetime import datetime, timedelta
from tqdm import tqdm

from .config import BASE_DIR, get_competition
from .managers import FootballDataManager, PlayerDataManager
from .features import MLFeatureGenerator
from .utils import (
    scrape_full_match_data,
    load_existing_data,
    get_existing_event_ids,
    merge_and_sort_matches,
    random_delay,
    extract_odds,
    extract_referee_data,
)


def scrape_season_matches_incremental(scraper, dm, fg, tournament_id, season_id, season_name,
                                       delay=0.5, checkpoint_every=25, update_recent_days=0):
    print(f"\n{'='*50}")
    print(f"[DOWNLOADING] {season_name}")
    print(f"{'='*50}")
    
    slug = dm._season_slug(season_name)
    raw_filepath = os.path.join(dm.paths['raw'], f'{slug}.json')
    
    def save_checkpoint(existing_matches, new_matches):
        all_matches = merge_and_sort_matches(existing_matches, new_matches)
        with open(raw_filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'competition_type': dm.comp_type,
                    'country': dm.country,
                    'league': dm.league,
                    'season': season_name,
                    'scraped_at': datetime.now().isoformat(),
                    'total_matches': len(all_matches),
                    'last_update': datetime.now().isoformat(),
                },
                'matches': all_matches
            }, f, ensure_ascii=False, indent=2)
        return all_matches
    
    existing_ids = get_existing_event_ids(dm, season_name)
    existing_data = load_existing_data(raw_filepath)
    existing_matches = existing_data.get('matches', []) if existing_data else []
    print(f"   Existing matches in database: {len(existing_ids)}")

    all_matches = scraper.get_all_season_matches(tournament_id, season_id)
    finished = [m for m in all_matches if m.get('status', {}).get('type') == 'finished']
    print(f"   Finished matches in API: {len(finished)}")
    
    cutoff_date = None
    if update_recent_days > 0:
        cutoff_date = (datetime.now() - timedelta(days=update_recent_days)).strftime('%Y-%m-%d')
        print(f"   [DATE] Updating matches from: {cutoff_date}")
    
    new_matches_raw = []
    update_matches_raw = []
    
    for m in finished:
        match_id = m.get('id')
        if match_id not in existing_ids:
            new_matches_raw.append(m)
        elif cutoff_date:
            match_timestamp = m.get('startTimestamp', 0)
            match_date = datetime.fromtimestamp(match_timestamp).strftime('%Y-%m-%d')
            if match_date >= cutoff_date:
                update_matches_raw.append(m)
    
    matches_to_fetch = new_matches_raw + update_matches_raw
    print(f"   New matches to fetch: {len(new_matches_raw)}")
    if update_matches_raw:
        print(f"   Matches to update (last {update_recent_days} days): {len(update_matches_raw)}")
    
    if not matches_to_fetch:
        print("   [OK] No new matches - data is up to date!")
        return existing_matches, None
    
    new_matches_data = []
    total = len(matches_to_fetch)
    
    for i, match in enumerate(tqdm(matches_to_fetch, desc=f"Matches ({season_name[:15]}...)")):
        try:
            data = scrape_full_match_data(scraper, match, delay=delay)
            data['season'] = season_name
            new_matches_data.append(data)
            
            if (i + 1) % checkpoint_every == 0:
                save_checkpoint(existing_matches, new_matches_data)
                print(f"   [CHECKPOINT] Saved {len(existing_matches) + len(new_matches_data)} matches")
                
        except Exception as e:
            print(f"   [ERROR] Match {match.get('id')}: {e}")
            if new_matches_data:
                save_checkpoint(existing_matches, new_matches_data)
                print(f"   [CHECKPOINT] (after error) Saved {len(existing_matches) + len(new_matches_data)} matches")
    
    if not new_matches_data:
        return existing_matches, None
    
    all_matches_data = save_checkpoint(existing_matches, new_matches_data)
    
    dm.save_processed_data(season_name, all_matches_data)
    dataset = fg.generate_dataset(all_matches_data, min_round=5)
    features_path = os.path.join(dm.paths['features'], f'features_{slug}.json')
    with open(features_path, 'w', encoding='utf-8') as f:
        json.dump({
            'metadata': {
                'season': season_name,
                'total_samples': len(dataset),
                'last_update': datetime.now().isoformat(),
            },
            'samples': dataset
        }, f, ensure_ascii=False, indent=2)
    
    print(f"   [OK] Saved: +{len(new_matches_data)} new, {len(all_matches_data)} total")
    return all_matches_data, dataset


def scrape_player_data_incremental(scraper, pdm, matches, season_name, delay=0.5, checkpoint_every=25, update_recent_days=0):
    print(f"   [DOWNLOADING] Fetching player data...")
    
    slug = pdm._season_slug(season_name)
    lineups_path = os.path.join(pdm.paths['lineups'], f'lineups_{slug}.json')
    stats_path = os.path.join(pdm.paths['player_stats'], f'player_stats_{slug}.json')
    registry_path = os.path.join(pdm.paths['players'], f'players_{slug}.json')
    
    existing_lineups = load_existing_data(lineups_path)
    existing_stats = load_existing_data(stats_path)
    existing_registry = load_existing_data(registry_path)
    
    processed_events = set()
    if existing_lineups and 'lineups' in existing_lineups:
        processed_events = set(l.get('event_id') for l in existing_lineups['lineups'])
    
    cutoff_date = None
    if update_recent_days > 0:
        cutoff_date = (datetime.now() - timedelta(days=update_recent_days)).strftime('%Y-%m-%d')
    
    new_matches = []
    for m in matches:
        event_id = m.get('event_id')
        match_date = m.get('date', '')

        if event_id not in processed_events:
            new_matches.append(m)
        elif cutoff_date and match_date >= cutoff_date:
            new_matches.append(m)
    
    print(f"   Matches to process: {len(new_matches)}")
    
    if not new_matches:
        print("   [OK] Player data is up to date!")
        return None
    
    update_event_ids = set(m.get('event_id') for m in new_matches if m.get('event_id') in processed_events)
    
    all_lineups = [l for l in (existing_lineups.get('lineups', []) if existing_lineups else []) 
                   if l.get('event_id') not in update_event_ids]
    all_player_stats = [s for s in (existing_stats.get('player_stats', []) if existing_stats else [])
                        if s.get('event_id') not in update_event_ids]
    
    player_registry = {}
    if existing_registry and 'teams' in existing_registry:
        for team, players in existing_registry['teams'].items():
            for p in players:
                if p.get('id'):
                    player_registry[p['id']] = p
    
    for i, match in enumerate(tqdm(new_matches, desc="Players")):
        event_id = match.get('event_id') or match.get('id')
        if not event_id:
            continue
        
        match_info = {
            'match_id': f"{season_name.replace(' ', '_')}_{event_id}",
            'event_id': event_id,
            'date': match.get('date'),
            'season': season_name,
            'round': match.get('round'),
            'home_team': match.get('home_team'),
            'away_team': match.get('away_team'),
            'home_score': match.get('home_score'),
            'away_score': match.get('away_score'),
        }
        
        try:
            lineups_data = scraper.get_api_data(f"/event/{event_id}/lineups")
            if lineups_data and 'home' in lineups_data:
                lineup, player_stats = pdm.process_match_lineups(lineups_data, match_info)
                if lineup:
                    all_lineups.append(lineup)
                    all_player_stats.extend(player_stats)
                    for side in ['home', 'away']:
                        for p in lineup[side]['starters'] + lineup[side]['substitutes']:
                            if p['id'] and p['id'] not in player_registry:
                                player_registry[p['id']] = p
            
            if (i + 1) % checkpoint_every == 0:
                pdm.save_season_data(season_name, all_lineups, all_player_stats, player_registry)
                print(f"   [CHECKPOINT] Players: {len(all_lineups)} lineups saved")
                
        except Exception as e:
            if all_lineups:
                pdm.save_season_data(season_name, all_lineups, all_player_stats, player_registry)
                print(f"   [CHECKPOINT] (after error) {len(all_lineups)} lineups saved")
        
        time.sleep(random_delay(delay))
    
    all_lineups = sorted(all_lineups, key=lambda x: (x.get('date') or '', x.get('event_id') or 0))
    all_player_stats = sorted(all_player_stats, key=lambda x: (x.get('date') or '', x.get('event_id') or 0))
    pdm.save_season_data(season_name, all_lineups, all_player_stats, player_registry)
    
    print(f"   [OK] Saved: {len(all_lineups)} lineups, {len(all_player_stats)} stats, {len(player_registry)} players")
    return {'lineups': all_lineups, 'player_stats': all_player_stats, 'player_registry': player_registry}


def scrape_competition(scraper, comp_type, country, league, seasons_to_scrape=None,
                       scrape_players=True, num_seasons=5, update_recent_days=0):
    print("\n" + "="*60)
    print(f"[COMPETITION] SCRAPING: {comp_type}/{country}/{league}")
    print("="*60)
    
    comp = get_competition(comp_type, country, league)
    if not comp:
        print(f"[ERROR] Competition not found: {comp_type}/{country}/{league}")
        print("   Check COMPETITIONS configuration at the top of the file.")
        return None
    
    tournament_id = comp['tournament_id']
    
    if seasons_to_scrape is None:
        if comp['seasons']:
            seasons_to_scrape = list(comp['seasons'].items())
            print(f"[CONFIG] Using {len(seasons_to_scrape)} seasons from configuration")
        else:
            seasons_api = scraper.get_seasons(tournament_id)
            seasons_to_scrape = [(s['name'], s['id']) for s in seasons_api[:num_seasons]]
            print(f"[API] Fetched {len(seasons_to_scrape)} seasons from API:")
            for name, sid in seasons_to_scrape:
                print(f"   - {name} (ID: {sid})")
    
    dm = FootballDataManager(BASE_DIR, comp_type, country, league)
    fg = MLFeatureGenerator(dm)
    pdm = PlayerDataManager(dm)
    
    all_season_data = {}
    total_new_matches = 0
    
    for season_name, season_id in seasons_to_scrape:
        matches, dataset = scrape_season_matches_incremental(
            scraper, dm, fg,
            tournament_id=tournament_id,
            season_id=season_id,
            season_name=season_name,
            update_recent_days=update_recent_days
        )
        
        if matches:
            all_season_data[season_name] = {'matches': matches, 'dataset': dataset}
            total_new_matches += len([m for m in matches if m])  # count non-None
            
            if scrape_players:
                scrape_player_data_incremental(scraper, pdm, matches, season_name, 
                                               update_recent_days=update_recent_days)
        
        time.sleep(1)
    
    if all_season_data:
        combine_all_seasons_data(dm)
    
    print(f"\n{'='*60}")
    print(f"[DONE] COMPLETED: {comp_type}/{country}/{league}")
    print(f"   Total seasons processed: {len(seasons_to_scrape)}")
    print(f"{'='*60}\n")
    
    return all_season_data


def combine_all_seasons_data(dm):
    all_matches = []
    all_features = []
    seasons_found = []
    
    if os.path.exists(dm.paths['raw']):
        for filename in sorted(os.listdir(dm.paths['raw'])):
            if filename.endswith('.json') and filename != 'all_seasons.json':
                filepath = os.path.join(dm.paths['raw'], filename)
                data = load_existing_data(filepath)
                if data and 'matches' in data:
                    all_matches.extend(data['matches'])
                    season = data.get('metadata', {}).get('season', filename)
                    seasons_found.append(season)
    
    if os.path.exists(dm.paths['features']):
        for filename in sorted(os.listdir(dm.paths['features'])):
            if filename.endswith('.json') and filename != 'features_all_seasons.json':
                filepath = os.path.join(dm.paths['features'], filename)
                data = load_existing_data(filepath)
                if data and 'samples' in data:
                    all_features.extend(data['samples'])
    
    if not all_matches:
        return
    
    all_matches = sorted(all_matches, key=lambda x: (x.get('date') or '', x.get('round') or 0))
    all_features = sorted(all_features, key=lambda x: (x.get('date') or '', x.get('round') or 0))

    with open(os.path.join(dm.paths['raw'], 'all_seasons.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'metadata': {
                'total_matches': len(all_matches),
                'seasons': seasons_found,
                'last_update': datetime.now().isoformat(),
            },
            'matches': all_matches
        }, f, ensure_ascii=False, indent=2)
    
    with open(os.path.join(dm.paths['features'], 'features_all_seasons.json'), 'w', encoding='utf-8') as f:
        json.dump({
            'metadata': {
                'total_samples': len(all_features),
                'seasons': seasons_found,
                'last_update': datetime.now().isoformat(),
            },
            'samples': all_features
        }, f, ensure_ascii=False, indent=2)
    
    print(f"   [COMBINED] {len(all_matches)} matches, {len(all_features)} features from {len(seasons_found)} seasons")


def scrape_upcoming_matches(scraper, dm, fg, tournament_id, season_id, season_name, delay=0.5):
    from .utils import extract_match_data, extract_referee_data, load_existing_data

    print(f"\n{'='*50}")
    print(f"[UPCOMING] {season_name}")
    print(f"{'='*50}")
    
    upcoming_raw = scraper.get_all_upcoming_matches(tournament_id, season_id)
    print(f"   Found {len(upcoming_raw)} upcoming matches")
    
    if not upcoming_raw:
        return []
    
    slug = dm._season_slug(season_name)
    raw_filepath = os.path.join(dm.paths['raw'], f'{slug}.json')
    existing_data = load_existing_data(raw_filepath)
    finished_matches = existing_data.get('matches', []) if existing_data else []
    
    all_seasons_path = os.path.join(dm.paths['raw'], 'all_seasons.json')
    all_seasons_data = load_existing_data(all_seasons_path)
    if all_seasons_data and 'matches' in all_seasons_data:
        finished_matches = all_seasons_data['matches']
    
    print(f"   Using {len(finished_matches)} finished matches for feature computation")
    
    upcoming_processed = []
    for m in upcoming_raw:
        match_data = extract_match_data(m)
        match_data['status'] = 'notstarted'
        match_data['home_score'] = None
        match_data['away_score'] = None

        event_id = m.get('id')
        if event_id:
            odds_markets = scraper.get_match_odds(event_id)
            if odds_markets:
                odds = extract_odds(odds_markets)
                match_data.update(odds)
            time.sleep(random_delay(delay))

            event_details = scraper.get_event_details(event_id)
            if event_details:
                referee_data = extract_referee_data(event_details)
                if referee_data:
                    match_data.update(referee_data)
            time.sleep(random_delay(delay))

        upcoming_processed.append(match_data)
    
    upcoming_features = []
    for match in upcoming_processed:
        all_data = finished_matches + [match]
        features = fg.generate_match_features(match, all_data)
        features['result'] = None
        features['label_result'] = None
        features['label_result_int'] = None
        features['label_home_goals'] = None
        features['label_away_goals'] = None
        features['label_total_goals'] = None
        features['status'] = 'notstarted'
        upcoming_features.append(features)
    
    upcoming_dir = os.path.join(dm.paths['raw'], 'upcoming')
    os.makedirs(upcoming_dir, exist_ok=True)
    
    upcoming_filepath = os.path.join(upcoming_dir, f'upcoming_{slug}.json')
    with open(upcoming_filepath, 'w', encoding='utf-8') as f:
        json.dump({
            'metadata': {
                'competition_type': dm.comp_type,
                'country': dm.country,
                'league': dm.league,
                'season': season_name,
                'scraped_at': datetime.now().isoformat(),
                'total_matches': len(upcoming_processed),
            },
            'matches': upcoming_processed,
            'features': upcoming_features
        }, f, ensure_ascii=False, indent=2)
    
    print(f"   Saved {len(upcoming_processed)} upcoming matches to {upcoming_filepath}")
    
    return upcoming_features


def scrape_upcoming_for_date(scraper, dm, fg, tournament_id, season_id, season_name, target_date, delay=0.5):
    upcoming = scrape_upcoming_matches(scraper, dm, fg, tournament_id, season_id, season_name, delay)
    
    matches_for_date = [m for m in upcoming if m.get('date', '').startswith(target_date)]
    
    print(f"   Matches on {target_date}: {len(matches_for_date)}")
    return matches_for_date
