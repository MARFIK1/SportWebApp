"""
Regenerate ML features for all competitions (incremental by default).

Usage:
    python regenerate_all_features.py           # Incremental (fast, default)
    python regenerate_all_features.py --force   # Recalculate everything from scratch
    python regenerate_all_features.py --current # Only current season
"""

import os
import sys
import json
import re
import time
import argparse
from datetime import datetime


def get_current_season() -> str:
    """Get current season string (e.g., '25_26' for 2025/2026)."""
    now = datetime.now()
    year = now.year % 100
    month = now.month
    if month >= 8:
        return f"{year:02d}_{year+1:02d}"
    else:
        return f"{year-1:02d}_{year:02d}"


sys.path.insert(0, os.getcwd())
from sofascore.features import MLFeatureGenerator

COMPETITION_TYPES = ['league', 'cups', 'european', 'international']


def create_generator():
    return MLFeatureGenerator(data_manager=None)


def is_match_finished(match):
    """Check if match is finished (backwards compatible)."""
    if match.get('status') in ('postponed', 'canceled'):
        return False
    if match.get('status') == 'finished':
        return True
    if match.get('status') == 'upcoming':
        return False
    return match.get('home_score') is not None


def load_player_stats(base_path):
    player_stats_path = os.path.join(base_path, 'player_stats')
    if not os.path.exists(player_stats_path):
        return []
    all_stats = []
    for f in os.listdir(player_stats_path):
        if not f.endswith('.json'):
            continue
        try:
            with open(os.path.join(player_stats_path, f), 'r', encoding='utf-8') as file:
                data = json.load(file)
            all_stats.extend(data.get('player_stats', []))
        except Exception:
            continue
    return all_stats


def get_season_files(base_path):
    raw_path = os.path.join(base_path, 'raw')
    if not os.path.exists(raw_path):
        return []
    files = []
    season_pattern = re.compile(r'_(\d{2}_\d{2})\.json$')
    for f in os.listdir(raw_path):
        if not f.endswith('.json'):
            continue
        if f == 'all_seasons.json' or 'upcoming' in f.lower():
            continue
        match = season_pattern.search(f)
        if match:
            files.append((f, match.group(1)))
    return sorted(files, key=lambda x: x[1])


def is_season_stale(raw_path, features_path, raw_file, comp_name, season):
    raw_file_path = os.path.join(raw_path, raw_file)
    feat_file_path = os.path.join(features_path, f'features_{comp_name}_{season}.json')

    if not os.path.exists(feat_file_path):
        return True

    raw_mtime = os.path.getmtime(raw_file_path)
    feat_mtime = os.path.getmtime(feat_file_path)
    return raw_mtime > feat_mtime


def generate_season_features(raw_file_path, matches, player_stats, generator):
    """Generate features for a single season. Returns (samples, finished, upcoming)."""
    elo_table = generator._compute_elo_table(matches)

    season_samples = []
    finished_count = 0
    upcoming_count = 0

    for match in matches:
        status = match.get('status')

        if status in ('postponed', 'canceled', 'upcoming'):
            season_samples.append({
                'event_id': match.get('event_id'),
                'date': match.get('date'),
                'time': match.get('time', ''),
                'round': match.get('round'),
                'status': status,
                'home_team': match.get('home_team'),
                'home_team_id': match.get('home_team_id'),
                'away_team': match.get('away_team'),
                'away_team_id': match.get('away_team_id'),
            })
            upcoming_count += 1
            continue

        finished = is_match_finished(match)
        try:
            if finished:
                features = generator.generate_match_features(
                    match=match, all_matches=matches,
                    player_stats=player_stats, elo_table=elo_table
                )
                features['event_id'] = match.get('event_id')
                features['date'] = match.get('date')
                features['time'] = match.get('time', '')
                features['round'] = match.get('round')
                features['status'] = 'finished'
                features['home_team'] = match.get('home_team')
                features['home_team_id'] = match.get('home_team_id')
                features['away_team'] = match.get('away_team')
                features['away_team_id'] = match.get('away_team_id')

                home_score = match.get('home_score', 0) or 0
                away_score = match.get('away_score', 0) or 0
                total_goals = home_score + away_score

                if home_score > away_score:
                    result, result_int = 'H', 0
                elif home_score < away_score:
                    result, result_int = 'A', 2
                else:
                    result, result_int = 'D', 1

                features['label_home_goals'] = home_score
                features['label_away_goals'] = away_score
                features['label_total_goals'] = total_goals
                features['label_result'] = result
                features['label_result_int'] = result_int
                features['label_btts'] = 1 if home_score > 0 and away_score > 0 else 0
                features['label_over_2_5'] = 1 if total_goals > 2.5 else 0
                features['label_over_1_5'] = 1 if total_goals > 1.5 else 0
                finished_count += 1
            season_samples.append(features)
        except Exception:
            continue

    return season_samples, finished_count, upcoming_count


def regenerate_competition_features(comp_type, country, comp_name,
                                    force=False, current_only=False):
    if country == comp_name:
        base_path = f'data/{comp_type}/{comp_name}'
    else:
        base_path = f'data/{comp_type}/{country}/{comp_name}'
    raw_path = os.path.join(base_path, 'raw')
    features_path = os.path.join(base_path, 'features')
    os.makedirs(features_path, exist_ok=True)

    current_season = get_current_season()
    season_files = get_season_files(base_path)
    if not season_files:
        return None

    if current_only:
        season_files = [(f, s) for f, s in season_files if s == current_season]
        if not season_files:
            return None

    player_stats = None
    generator = None

    all_samples = []
    total_finished = 0
    total_upcoming = 0
    regenerated = 0
    cached = 0

    for raw_file, season in season_files:
        raw_file_full = os.path.join(raw_path, raw_file)
        feat_file = os.path.join(features_path, f'features_{comp_name}_{season}.json')

        needs_regen = force or is_season_stale(raw_path, features_path,
                                                raw_file, comp_name, season)

        if not needs_regen:
            try:
                with open(feat_file, 'r', encoding='utf-8') as f:
                    cached_data = json.load(f)
                samples = cached_data.get('samples', [])
                fin = cached_data.get('metadata', {}).get('finished_samples', 0)
                upc = cached_data.get('metadata', {}).get('upcoming_samples', 0)
                all_samples.extend(samples)
                total_finished += fin
                total_upcoming += upc
                cached += 1
                print(f"  Season {season}: {fin} fin + {upc} up [CACHE]")
                continue
            except Exception:
                pass  # fallback: regenerate

        if player_stats is None:
            player_stats = load_player_stats(base_path)
            generator = create_generator()

        try:
            with open(raw_file_full, 'r', encoding='utf-8') as f:
                raw_data = json.load(f)
        except Exception as e:
            print(f"  [ERROR] {raw_file}: {e}")
            continue

        matches = raw_data.get('matches', [])
        if not matches:
            continue

        season_samples, fin, upc = generate_season_features(
            raw_file_full, matches, player_stats, generator
        )

        if season_samples:
            output_data = {
                'metadata': {
                    'comp_type': comp_type,
                    'country': country,
                    'competition': comp_name,
                    'total_samples': len(season_samples),
                    'finished_samples': fin,
                    'upcoming_samples': upc,
                    'generated_at': datetime.now().isoformat()
                },
                'samples': season_samples
            }
            with open(feat_file, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)

            all_samples.extend(season_samples)
            total_finished += fin
            total_upcoming += upc
            regenerated += 1
            print(f"  Season {season}: {fin} fin + {upc} up [REGENERATED]")

    if current_only:
        old_season_files = get_season_files(base_path)
        for raw_file, season in old_season_files:
            if season == current_season:
                continue  # already recalculated above
            feat_file = os.path.join(features_path,
                                     f'features_{comp_name}_{season}.json')
            if os.path.exists(feat_file):
                try:
                    with open(feat_file, 'r', encoding='utf-8') as f:
                        cached_data = json.load(f)
                    samples = cached_data.get('samples', [])
                    fin = cached_data.get('metadata', {}).get('finished_samples', 0)
                    upc = cached_data.get('metadata', {}).get('upcoming_samples', 0)
                    all_samples.extend(samples)
                    total_finished += fin
                    total_upcoming += upc
                except Exception:
                    pass

    if all_samples:
        all_seasons_file = os.path.join(features_path, 'features_all_seasons.json')
        combined_data = {
            'metadata': {
                'comp_type': comp_type,
                'country': country,
                'competition': comp_name,
                'total_samples': len(all_samples),
                'finished_samples': total_finished,
                'upcoming_samples': total_upcoming,
                'has_player_stats': player_stats is not None and len(player_stats) > 0,
                'generated_at': datetime.now().isoformat()
            },
            'samples': all_samples
        }
        with open(all_seasons_file, 'w', encoding='utf-8') as f:
            json.dump(combined_data, f, ensure_ascii=False, indent=2)

    return {
        'total': len(all_samples),
        'finished': total_finished,
        'upcoming': total_upcoming,
        'regenerated': regenerated,
        'cached': cached,
    }


def discover_competitions(comp_type):
    base_dir = f'data/{comp_type}'
    if not os.path.exists(base_dir):
        return []
    comps = []
    for entry1 in sorted(os.listdir(base_dir)):
        entry1_path = os.path.join(base_dir, entry1)
        if not os.path.isdir(entry1_path):
            continue

        if os.path.exists(os.path.join(entry1_path, 'raw')):
            comps.append((entry1, entry1))
        else:
            for entry2 in sorted(os.listdir(entry1_path)):
                entry2_path = os.path.join(entry1_path, entry2)
                if os.path.isdir(entry2_path):
                    raw_path = os.path.join(entry2_path, 'raw')
                    if os.path.exists(raw_path):
                        comps.append((entry1, entry2))
    return comps


def main():
    parser = argparse.ArgumentParser(
        description='Regenerate ML features for football matches (incremental).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python regenerate_all_features.py           # Incremental (default, fast)
  python regenerate_all_features.py --current # Only current season (fastest)
  python regenerate_all_features.py --force   # Recalculate everything from scratch
"""
    )
    parser.add_argument(
        '--current', '-c', action='store_true',
        help='Only regenerate current season. Fastest for daily use.'
    )
    parser.add_argument(
        '--force', '-f', action='store_true',
        help='Force full regeneration of ALL seasons (ignore cache).'
    )
    args = parser.parse_args()

    current_season = get_current_season()
    t_start = time.time()

    if args.force:
        mode = "FORCE (everything from scratch)"
    elif args.current:
        mode = f"CURRENT SEASON ONLY ({current_season})"
    else:
        mode = "INCREMENTAL (only changed seasons)"

    print("=" * 60)
    print(f"REGENERATING FEATURES - {mode}")
    print("=" * 60)

    results_by_type = {}

    for comp_type in COMPETITION_TYPES:
        print(f"\n{'='*60}")
        print(f"[{comp_type.upper()}]")
        print("=" * 60)

        competitions = discover_competitions(comp_type)
        if not competitions:
            print(f"  No {comp_type} found")
            continue

        results = []
        for country, comp in competitions:
            print(f"\n  [{country}/{comp}]")
            result = regenerate_competition_features(
                comp_type, country, comp,
                force=args.force,
                current_only=args.current
            )
            if result:
                results.append({'competition': f'{country}/{comp}', **result})

        if results:
            results_by_type[comp_type] = results

    elapsed = time.time() - t_start
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    grand_total = grand_finished = grand_upcoming = 0
    grand_regen = grand_cached = 0

    for comp_type, results in results_by_type.items():
        type_total = sum(r['total'] for r in results)
        type_regen = sum(r['regenerated'] for r in results)
        type_cached = sum(r['cached'] for r in results)
        type_finished = sum(r['finished'] for r in results)
        type_upcoming = sum(r['upcoming'] for r in results)

        print(f"\n[{comp_type.upper()}] {len(results)} competitions "
              f"({type_regen} regenerated, {type_cached} cached)")
        for r in results:
            print(f"  {r['competition']}: {r['total']} "
                  f"({r['finished']} fin + {r['upcoming']} up) "
                  f"[regen={r['regenerated']}, cache={r['cached']}]")
        print(f"  SUBTOTAL: {type_total} samples")

        grand_total += type_total
        grand_finished += type_finished
        grand_upcoming += type_upcoming
        grand_regen += type_regen
        grand_cached += type_cached

    print(f"\n{'='*60}")
    print(f"GRAND TOTAL: {grand_total} samples "
          f"({grand_finished} finished + {grand_upcoming} upcoming)")
    print(f"Seasons: {grand_regen} regenerated, {grand_cached} cached (skipped)")
    print(f"Time: {elapsed:.1f}s")
    print("Done!")


if __name__ == '__main__':
    main()
