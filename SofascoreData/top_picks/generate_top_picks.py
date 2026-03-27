"""
Top picks generator - selects the most confident predictions from a daily report.

Usage:
    python top_picks/generate_top_picks.py                         # Today's top picks
    python top_picks/generate_top_picks.py 2026-02-15              # Specific date
    python top_picks/generate_top_picks.py --min-confidence 70     # Higher confidence threshold
    python top_picks/generate_top_picks.py --max-bets 8            # Max 8 picks
"""

import argparse
import io
import json
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower().startswith('cp'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

PROJECT_DIR = Path(__file__).parent.parent
REPORTS_DIR = PROJECT_DIR / 'reports'

MARKET_LABELS = {
    'result': 'Result (1X2)',
    'double_chance_1x': 'Double Chance (1X)',
    'double_chance_x2': 'Double Chance (X2)',
    'double_chance_12': 'Double Chance (12)',
    'btts': 'BTTS (Both Teams To Score)',
    'over_2_5': 'Over 2.5 Goals',
    'over_1_5': 'Over 1.5 Goals',
    'corners_over_8_5': 'Corners Over 8.5',
    'corners_over_10_5': 'Corners Over 10.5',
    'cards_over_3_5': 'Cards Over 3.5',
    'cards_over_4_5': 'Cards Over 4.5',
}

PREDICTION_LABELS = {
    'HOME': 'Home (1)',
    'DRAW': 'Draw (X)',
    'AWAY': 'Away (2)',
    '1X': '1X (Home or Draw)',
    'X2': 'X2 (Draw or Away)',
    '12': '12 (Home or Away)',
    'YES': 'Yes',
    'NO': 'No',
    'OVER': 'Over',
    'UNDER': 'Under',
}

CONFLICT_GROUPS = [
    {'result', 'double_chance_1x', 'double_chance_x2', 'double_chance_12'},
    {'over_1_5', 'over_2_5'},
    {'corners_over_8_5', 'corners_over_10_5'},
    {'cards_over_3_5', 'cards_over_4_5'},
]

_POISSON_MAP = {
    'btts': ('goals', 'btts_pct'),
    'over_1_5': ('goals', 'over_1_5_pct'),
    'over_2_5': ('goals', 'over_2_5_pct'),
    'corners_over_8_5': ('corners', 'over_8_5_pct'),
    'corners_over_10_5': ('corners', 'over_10_5_pct'),
    'cards_over_3_5': ('cards', 'over_3_5_pct'),
    'cards_over_4_5': ('cards', 'over_4_5_pct'),
}

_POISSON_DISAGREEMENT_THRESHOLD = 15  # percentage points

MAX_CARDS_RATIO = 0.40


def load_report(target_date: str) -> dict:
    date_dir = REPORTS_DIR / target_date
    for status in ['finished', 'unfinished']:
        path = date_dir / f"predictions_{status}.json"
        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        old_path = REPORTS_DIR / f"predictions_{target_date}_{status}.json"
        if old_path.exists():
            with open(old_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    return None


def load_analysis(target_date: str) -> dict:
    date_dir = REPORTS_DIR / target_date
    path = date_dir / "analysis.json"
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    old_path = REPORTS_DIR / f"analysis_{target_date}.json"
    if old_path.exists():
        with open(old_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def _make_analysis_key(home: str, away: str) -> str:
    def _normalize(name: str) -> str:
        return name.lower().replace(' ', '_').replace('-', '_').replace('.', '')
    return f"{_normalize(home)}_vs_{_normalize(away)}"


def _get_poisson_pct(analysis: dict, home: str, away: str, market: str) -> float:
    if not analysis:
        return None

    mapping = _POISSON_MAP.get(market)
    if not mapping:
        return None

    section, key = mapping
    match_key = _make_analysis_key(home, away)
    match_data = analysis.get('matches', {}).get(match_key, {})
    section_data = match_data.get(section, {})
    return section_data.get(key)


def compute_confidence(consensus: dict, market: str = 'result',
                       poisson_pct: float = None) -> dict:
    """Composite confidence score: 50% probability, 30% agreement, 20% margin."""
    prediction = consensus.get('prediction')
    agreement_pct = consensus.get('agreement_pct', 0) or 0
    avg_probs = consensus.get('avg_probabilities', {})

    if not prediction or not avg_probs:
        return None

    pred_prob = avg_probs.get(prediction, 0)

    if pred_prob < 50.0:
        return None

    sorted_probs = sorted(avg_probs.values(), reverse=True)
    margin = (sorted_probs[0] - sorted_probs[1]) if len(sorted_probs) >= 2 else 0

    raw_score = 0.50 * pred_prob + 0.30 * agreement_pct + 0.20 * margin

    if market.startswith('double_chance'):
        score = raw_score * 0.75
    elif market == 'result':
        score = raw_score * 1.15
    else:
        score = raw_score

    poisson_agrees = None
    if poisson_pct is not None and market in _POISSON_MAP:
        if market == 'btts':
            model_positive_pct = avg_probs.get('YES', 0)
        else:
            model_positive_pct = avg_probs.get('OVER', 0)

        model_says_positive = model_positive_pct >= 50
        poisson_says_positive = poisson_pct >= 50

        if model_says_positive == poisson_says_positive:
            score *= 1.05
            poisson_agrees = True
        else:
            diff = abs(model_positive_pct - poisson_pct)
            if diff > _POISSON_DISAGREEMENT_THRESHOLD:
                penalty = diff / 100
                score *= (1.0 - penalty)
                poisson_agrees = False

    return {
        'score': round(score, 1),
        'prediction': prediction,
        'probability': round(pred_prob, 1),
        'agreement_pct': round(agreement_pct, 1),
        'margin': round(margin, 1),
        'poisson_agrees': poisson_agrees,
    }


def extract_bets(report: dict, analysis: dict = None) -> list:
    all_bets = []

    for match in report.get('matches', []):
        if match.get('status') in ['finished', 'postponed', 'unknown']:
            continue

        home = match.get('home_team', '?')
        away = match.get('away_team', '?')
        league = match.get('league', '')
        kick_off = match.get('start_time', '')

        base = {
            'match': f"{home} vs {away}",
            'league': league,
            'kick_off': kick_off,
        }

        cons = match.get('consensus', {})
        if cons:
            conf = compute_confidence(cons, market='result')
            if conf:
                all_bets.append({
                    **base,
                    'market': 'result',
                    'market_label': MARKET_LABELS['result'],
                    'pick': conf['prediction'],
                    'pick_label': PREDICTION_LABELS.get(conf['prediction'], conf['prediction']),
                    **conf,
                })

            avg_probs = cons.get('avg_probabilities', {})
            home_p = avg_probs.get('HOME', 0)
            draw_p = avg_probs.get('DRAW', 0)
            away_p = avg_probs.get('AWAY', 0)
            agreement = cons.get('agreement_pct', 50)

            dc_options = {'1X': home_p + draw_p, 'X2': draw_p + away_p, '12': home_p + away_p}
            for dc_name, dc_prob in dc_options.items():
                if dc_prob < 55:
                    continue
                other_prob = 100 - dc_prob
                raw_dc_score = 0.50 * dc_prob + 0.30 * agreement + 0.20 * (dc_prob - other_prob)
                dc_score = raw_dc_score * 0.75
                market_key = f'double_chance_{dc_name.lower()}'
                all_bets.append({
                    **base,
                    'market': market_key,
                    'market_label': MARKET_LABELS.get(market_key, market_key),
                    'pick': dc_name,
                    'pick_label': PREDICTION_LABELS.get(dc_name, dc_name),
                    'score': round(dc_score, 1),
                    'prediction': dc_name,
                    'probability': round(dc_prob, 1),
                    'agreement_pct': round(agreement, 1),
                    'margin': round(dc_prob - (100 - dc_prob), 1),
                    'poisson_agrees': None,
                })

        markets = match.get('market_predictions', {})
        for market_name, market_data in markets.items():
            mkt_cons = market_data.get('consensus', {})
            if not mkt_cons:
                continue

            poisson_pct = _get_poisson_pct(analysis, home, away, market_name)

            conf = compute_confidence(mkt_cons, market=market_name,
                                      poisson_pct=poisson_pct)
            if conf:
                all_bets.append({
                    **base,
                    'market': market_name,
                    'market_label': MARKET_LABELS.get(market_name, market_name),
                    'pick': conf['prediction'],
                    'pick_label': PREDICTION_LABELS.get(conf['prediction'], conf['prediction']),
                    **conf,
                })

    all_bets.sort(key=lambda x: x['score'], reverse=True)
    return all_bets


def _conflicts_with(market: str, used_markets: set) -> bool:
    for group in CONFLICT_GROUPS:
        if market in group and used_markets & group:
            return True
    return False


def _group_bets_by_match(bets: list) -> list:
    grouped = OrderedDict()
    for bet in bets:
        match_name = bet['match']
        if match_name not in grouped:
            grouped[match_name] = {
                'match': match_name,
                'league': bet.get('league', ''),
                'kick_off': bet.get('kick_off', ''),
                'bets': [],
            }
        grouped[match_name]['bets'].append(bet)
    return list(grouped.values())


def select_top_picks(bets: list, max_bets: int = 15, min_confidence: float = 50.0,
                     max_per_match: int = 3) -> list:
    from collections import defaultdict

    selected = []
    max_cards = max(1, round(max_bets * MAX_CARDS_RATIO))
    cards_count = 0
    match_bets = defaultdict(list)
    match_markets = defaultdict(set)

    for bet in bets:
        if len(selected) >= max_bets:
            break
        if bet['score'] < min_confidence:
            continue
        match = bet['match']
        if len(match_bets[match]) >= max_per_match:
            continue
        if _conflicts_with(bet['market'], match_markets[match]):
            continue
        is_cards = bet['market'].startswith('cards_')
        if is_cards and cards_count >= max_cards:
            continue
        selected.append(bet)
        match_bets[match].append(bet)
        match_markets[match].add(bet['market'])
        if is_cards:
            cards_count += 1

    return _group_bets_by_match(selected)


def print_top_picks(picks: list, target_date: str):
    print()
    print("=" * 80)
    print(f"  TOP PICKS FOR {target_date}")
    print(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 80)

    if not picks:
        print("\n  No picks meet the criteria.")
        print("  Try lowering --min-confidence or wait for more matches.")
        return

    total_bets = 0
    all_scores = []

    for i, match_entry in enumerate(picks, 1):
        kick_off = match_entry.get('kick_off', '')
        time_str = f"  ({kick_off})" if kick_off else ''
        print(f"\n  {i}. {match_entry['match']}{time_str}")
        print(f"     League: {match_entry['league']}")
        for bet in match_entry['bets']:
            total_bets += 1
            all_scores.append(bet['score'])
            print(f"     -> {bet['market_label']}: {bet['pick_label']}  "
                  f"(confidence: {bet['score']:.0f}%, prob: {bet['probability']:.0f}%, "
                  f"agreement: {bet['agreement_pct']:.0f}%)")

    print()
    print("-" * 80)
    avg_conf = sum(all_scores) / len(all_scores) if all_scores else 0
    print(f"  Matches: {len(picks)}, Picks: {total_bets}")
    print(f"  Average confidence: {avg_conf:.1f}%")
    print("=" * 80)


def save_top_picks(picks: list, target_date: str):
    date_dir = REPORTS_DIR / target_date
    date_dir.mkdir(parents=True, exist_ok=True)
    path = date_dir / "top_picks.json"

    total_bets = sum(len(m['bets']) for m in picks)
    all_scores = [b['score'] for m in picks for b in m['bets']]

    data = {
        'date': target_date,
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'summary': {
            'total_matches': len(picks),
            'total_bets': total_bets,
            'avg_confidence': round(sum(all_scores) / max(len(all_scores), 1), 1),
        },
        'picks': picks,
    }

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n  Top picks saved: {path}")


def main():
    parser = argparse.ArgumentParser(description='Top picks generator - most confident predictions')
    parser.add_argument('date', nargs='?', default=datetime.now().strftime('%Y-%m-%d'),
                        help='Date in YYYY-MM-DD format (default: today)')
    parser.add_argument('--min-confidence', type=float, default=50.0,
                        help='Minimum confidence threshold (default: 50)')
    parser.add_argument('--max-bets', type=int, default=15,
                        help='Max number of picks (default: 15)')
    parser.add_argument('--max-per-match', type=int, default=3,
                        help='Max picks per match (default: 3)')

    args = parser.parse_args()
    target_date = args.date

    report = load_report(target_date)
    if not report:
        print(f"No prediction report for {target_date}")
        print(f"Run first: python predict_today.py --scrape {target_date}")
        sys.exit(1)

    analysis = load_analysis(target_date)
    if analysis:
        print(f"  Loaded statistical analysis ({len(analysis.get('matches', {}))} matches)")
    else:
        print(f"  No statistical analysis available - picks without Poisson cross-validation")

    all_bets = extract_bets(report, analysis=analysis)

    if not all_bets:
        print(f"No available bets for {target_date}")
        print("All matches may already be finished or postponed.")
        sys.exit(0)

    picks = select_top_picks(
        all_bets,
        max_bets=args.max_bets,
        min_confidence=args.min_confidence,
        max_per_match=args.max_per_match,
    )

    print_top_picks(picks, target_date)
    save_top_picks(picks, target_date)


if __name__ == '__main__':
    main()
