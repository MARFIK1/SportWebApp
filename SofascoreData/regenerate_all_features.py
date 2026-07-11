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
from pathlib import Path


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def get_current_season() -> str:
    """Get current season string (e.g., '25_26' for 2025/2026)."""
    now = datetime.now()
    year = now.year % 100
    month = now.month
    if month >= 8:
        return f"{year:02d}_{year+1:02d}"
    else:
        return f"{year-1:02d}_{year:02d}"


sys.path.insert(0, SCRIPT_DIR)
from sofascore.data_layout import competition_features_path
from sofascore.dataset_builder import (
    DATASET_BUILDER_VERSION,
    build_season_feature_samples,
    deduplicate_matches,
    deduplicate_samples,
)
from sofascore.features import MLFeatureGenerator

COMPETITION_TYPES = ['league', 'cups', 'european', 'international']
DEFAULT_DATA_DIR = os.environ.get('SOFASCORE_DATA_DIR', os.path.join(SCRIPT_DIR, 'data'))


def create_generator():
    return MLFeatureGenerator(data_manager=None)



def load_all_league_player_stats(data_dir=None):
    """Load player_stats from ALL league competitions, indexed by player_id."""
    if data_dir is None:
        data_dir = DEFAULT_DATA_DIR

    index = {}
    league_dir = os.path.join(data_dir, 'league')
    if not os.path.exists(league_dir):
        return index
    for country in os.listdir(league_dir):
        country_path = os.path.join(league_dir, country)
        if not os.path.isdir(country_path):
            continue
        for league in os.listdir(country_path):
            ps_dir = os.path.join(country_path, league, 'player_stats')
            if not os.path.isdir(ps_dir):
                continue
            for fname in os.listdir(ps_dir):
                if not fname.endswith('.json'):
                    continue
                try:
                    with open(os.path.join(ps_dir, fname), 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    for record in data.get('player_stats', []):
                        record['_league'] = league
                        pid = record.get('player_id')
                        if pid:
                            if pid not in index:
                                index[pid] = []
                            index[pid].append(record)
                except Exception as e:
                    print(f"Failed to load {fname}: {e}")
                    continue
    for pid in index:
        index[pid].sort(key=lambda r: r.get('date', ''), reverse=True)
    return index


def load_lineups(base_path):
    """Load lineups from competition directory, indexed by event_id."""
    lineups_path = os.path.join(base_path, 'lineups')
    if not os.path.exists(lineups_path):
        return {}
    index = {}
    for fname in os.listdir(lineups_path):
        if not fname.endswith('.json'):
            continue
        try:
            with open(os.path.join(lineups_path, fname), 'r', encoding='utf-8') as f:
                data = json.load(f)
            for entry in data.get('lineups', []):
                eid = entry.get('event_id')
                if eid:
                    index[str(eid)] = entry
        except Exception as e:
            print(f"Failed to load {fname}: {e}")
            continue
    return index


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
    tournament_pattern = re.compile(r'_(\d{4})\.json$')
    for f in os.listdir(raw_path):
        if not f.endswith('.json'):
            continue
        if f == 'all_seasons.json' or 'upcoming' in f.lower():
            continue
        match = season_pattern.search(f)
        if match:
            files.append((f, match.group(1)))
            continue
        match = tournament_pattern.search(f)
        if match:
            files.append((f, match.group(1)))
    return sorted(files, key=lambda x: x[1])


def is_season_stale(raw_path, features_path, raw_file, comp_name, season):
    raw_file_path = os.path.join(raw_path, raw_file)
    feat_file_path = os.path.join(features_path, f'features_{comp_name}_{season}.json')

    if not os.path.exists(feat_file_path):
        return True
    if os.path.getmtime(raw_file_path) > os.path.getmtime(feat_file_path):
        return True

    try:
        with open(feat_file_path, 'r', encoding='utf-8') as feature_file:
            metadata = json.load(feature_file).get('metadata', {})
        return metadata.get('dataset_builder_version') != DATASET_BUILDER_VERSION
    except (OSError, ValueError, TypeError):
        return True

def generate_season_features(matches, player_stats, generator, season,
                             lineups=None, club_stats_index=None,
                             history_matches=None, elo_matches=None):
    return build_season_feature_samples(
        matches=matches,
        generator=generator,
        season=season,
        player_stats=player_stats,
        lineups=lineups,
        club_stats_index=club_stats_index,
        history_matches=history_matches,
        elo_matches=elo_matches,
    )

def regenerate_competition_features(comp_type, country, comp_name,
                                    force=False, current_only=False,
                                    club_stats_index=None):
    base_path = str(
        competition_features_path(
            Path(DEFAULT_DATA_DIR),
            comp_type,
            country,
            comp_name,
        ).parent
    )
    raw_path = os.path.join(base_path, 'raw')
    features_path = os.path.join(base_path, 'features')
    os.makedirs(features_path, exist_ok=True)

    all_season_files = get_season_files(base_path)
    if not all_season_files:
        return None

    selected_seasons = {season for _, season in all_season_files}
    if current_only:
        current_season = get_current_season()
        current_year = str(datetime.now().year)
        selected_seasons = {
            season
            for _, season in all_season_files
            if season in (current_season, current_year)
        }
        if not selected_seasons:
            return None

    raw_matches_by_file = {}
    history_matches = []
    for raw_file, _ in all_season_files:
        raw_file_full = os.path.join(raw_path, raw_file)
        try:
            with open(raw_file_full, 'r', encoding='utf-8') as source_file:
                matches = json.load(source_file).get('matches', [])
        except (OSError, ValueError, TypeError) as exc:
            print(f"[ERROR] {raw_file}: {exc}")
            continue
        raw_matches_by_file[raw_file] = matches
        history_matches.extend(matches)

    history_matches, raw_duplicates = deduplicate_matches(history_matches)
    player_stats = None
    generator = None
    lineups_data = None
    all_samples = []
    regenerated = 0
    cached = 0
    has_player_stats = False
    builder_versions = set()
    for raw_file, season in all_season_files:
        feat_file = os.path.join(features_path, f'features_{comp_name}_{season}.json')
        can_regenerate = not current_only or season in selected_seasons
        needs_regen = can_regenerate and (
            force
            or is_season_stale(raw_path, features_path, raw_file, comp_name, season)
        )

        if not needs_regen and os.path.exists(feat_file):
            try:
                with open(feat_file, 'r', encoding='utf-8') as feature_file:
                    cached_data = json.load(feature_file)
                samples = cached_data.get('samples', [])
                all_samples.extend(samples)
                metadata = cached_data.get('metadata', {})
                builder_versions.add(metadata.get('dataset_builder_version', 'legacy'))
                has_player_stats = has_player_stats or bool(metadata.get('has_player_stats'))
                fin = metadata.get('finished_samples', 0)
                upc = metadata.get('upcoming_samples', 0)
                cached += 1
                print(f"  Season {season}: {fin} fin + {upc} up [CACHE]")
                continue
            except (OSError, ValueError, TypeError):
                if not can_regenerate:
                    continue
                needs_regen = True

        if not needs_regen:
            continue
        matches = raw_matches_by_file.get(raw_file, [])
        if not matches:
            continue

        if generator is None:
            generator = create_generator()
            player_stats = load_player_stats(base_path)
            has_player_stats = has_player_stats or bool(player_stats)
        if comp_type in ('european', 'international') and lineups_data is None:
            lineups_data = load_lineups(base_path)

        result = generate_season_features(
            matches=matches,
            player_stats=player_stats,
            generator=generator,
            season=season,
            lineups=lineups_data,
            club_stats_index=club_stats_index,
            history_matches=history_matches,
            elo_matches=history_matches,
        )
        output_data = {
            'metadata': {
                'comp_type': comp_type,
                'country': country,
                'competition': comp_name,
                'season': season,
                'dataset_builder_version': DATASET_BUILDER_VERSION,
                'total_samples': len(result.samples),
                'finished_samples': result.finished_samples,
                'upcoming_samples': result.pending_samples,
                'duplicates_removed': result.duplicates_removed,
                'has_player_stats': bool(player_stats),
                'generated_at': datetime.now().isoformat(),
            },
            'samples': result.samples,
        }
        with open(feat_file, 'w', encoding='utf-8') as feature_file:
            json.dump(output_data, feature_file, ensure_ascii=False, indent=2)

        all_samples.extend(result.samples)
        builder_versions.add(DATASET_BUILDER_VERSION)
        regenerated += 1
        print(
            f"  Season {season}: {result.finished_samples} fin + "
            f"{result.pending_samples} up [REGENERATED]"
        )

    all_samples, sample_duplicates = deduplicate_samples(all_samples)
    total_finished = sum(
        sample.get('label_result_int') is not None
        or sample.get('status') == 'finished'
        for sample in all_samples
    )
    total_upcoming = len(all_samples) - total_finished
    source_builder_versions = sorted(builder_versions, key=str)
    combined_builder_version = (
        DATASET_BUILDER_VERSION
        if builder_versions == {DATASET_BUILDER_VERSION}
        else 'mixed'
    )

    if all_samples:
        all_seasons_file = os.path.join(features_path, 'features_all_seasons.json')
        combined_data = {
            'metadata': {
                'comp_type': comp_type,
                'country': country,
                'competition': comp_name,
                'dataset_builder_version': combined_builder_version,
                'source_builder_versions': source_builder_versions,
                'total_samples': len(all_samples),
                'finished_samples': total_finished,
                'upcoming_samples': total_upcoming,
                'duplicates_removed': raw_duplicates + sample_duplicates,
                'has_player_stats': has_player_stats,
                'generated_at': datetime.now().isoformat(),
            },
            'samples': all_samples,
        }
        with open(all_seasons_file, 'w', encoding='utf-8') as feature_file:
            json.dump(combined_data, feature_file, ensure_ascii=False, indent=2)

    return {
        'total': len(all_samples),
        'finished': total_finished,
        'upcoming': total_upcoming,
        'duplicates_removed': raw_duplicates + sample_duplicates,
        'regenerated': regenerated,
        'cached': cached,
    }

def discover_competitions(comp_type):
    base_dir = os.path.join(DEFAULT_DATA_DIR, comp_type)
    if not os.path.exists(base_dir):
        return []
    comps = []
    for entry1 in sorted(os.listdir(base_dir)):
        entry1_path = os.path.join(base_dir, entry1)
        if not os.path.isdir(entry1_path):
            continue

        if os.path.exists(os.path.join(entry1_path, 'raw')):
            comps.append((entry1, entry1))
        elif comp_type not in ('european', 'international'):
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
    club_stats_index = None

    for comp_type in COMPETITION_TYPES:
        print(f"\n{'='*60}")
        print(f"[{comp_type.upper()}]")
        print("=" * 60)

        if comp_type in ('european', 'international') and club_stats_index is None:
            print("  Loading club player stats index...")
            club_stats_index = load_all_league_player_stats()
            print(f"  Loaded stats for {len(club_stats_index)} players")

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
                current_only=args.current,
                club_stats_index=club_stats_index if comp_type in ('european', 'international') else None
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
