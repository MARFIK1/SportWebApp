"""
Data managers for football match and player data.
"""

import os
import json
from datetime import datetime
from collections import defaultdict


class FootballDataManager:

    def __init__(self, base_dir, comp_type, country, league):
        self.base_dir = base_dir
        self.comp_type = comp_type
        self.country = country
        self.league = league

        if comp_type == 'european':
            self.competition_dir = os.path.join(base_dir, comp_type, league)
        else:
            self.competition_dir = os.path.join(base_dir, comp_type, country, league)

        self.paths = {
            'raw': os.path.join(self.competition_dir, 'raw'),
            'processed': os.path.join(self.competition_dir, 'processed'),
            'features': os.path.join(self.competition_dir, 'features'),
            'lineups': os.path.join(self.competition_dir, 'lineups'),
            'player_stats': os.path.join(self.competition_dir, 'player_stats'),
            'players': os.path.join(self.competition_dir, 'players'),
        }
        for path in self.paths.values():
            os.makedirs(path, exist_ok=True)

    def _safe_get(self, data, *keys, default=0):
        for key in keys:
            val = data.get(key)
            if val is not None:
                return val
        return default

    def _season_slug(self, season_name):
        """E.g. 'UEFA Champions League 21/22' -> 'champions_league_21_22'"""
        import re
        year_match = re.search(r'(\d{2})/(\d{2})', season_name)
        if year_match:
            return f"{self.league}_{year_match.group(1)}_{year_match.group(2)}"
        # Fallback for edge cases (no year found)
        return season_name.replace('/', '_').replace(' ', '_').lower()
    
    def save_raw_matches(self, season_name, matches_data):
        sorted_matches = sorted(matches_data, key=lambda x: (x.get('round') or 0, x.get('date') or ''))
        
        filepath = os.path.join(self.paths['raw'], f'{self._season_slug(season_name)}.json')
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'competition_type': self.comp_type,
                    'country': self.country,
                    'league': self.league,
                    'season': season_name,
                    'scraped_at': datetime.now().isoformat(),
                    'total_matches': len(matches_data)
                },
                'matches': sorted_matches
            }, f, ensure_ascii=False, indent=2)
        
        return filepath
    
    def compute_team_stats(self, matches_data):
        team_stats = defaultdict(lambda: {
            'matches_played': 0, 'home_matches': 0, 'away_matches': 0,
            'wins': 0, 'draws': 0, 'losses': 0, 'home_wins': 0, 'away_wins': 0,
            'goals_for': 0, 'goals_against': 0,
            'xg_for': 0, 'xg_against': 0,
            'clean_sheets': 0, 'total_shots': 0, 'shots_on_target': 0,
            'possession_sum': 0, 'corners': 0, 'fouls': 0,
            'yellow_cards': 0, 'red_cards': 0,
        })
        
        for match in matches_data:
            home_team = match.get('home_team')
            away_team = match.get('away_team')
            home_score = match.get('home_score') or 0
            away_score = match.get('away_score') or 0
            
            h = team_stats[home_team]
            h['matches_played'] += 1
            h['home_matches'] += 1
            h['goals_for'] += home_score
            h['goals_against'] += away_score
            h['xg_for'] += self._safe_get(match, 'home_xg', 'home_expectedgoals')
            h['xg_against'] += self._safe_get(match, 'away_xg', 'away_expectedgoals')
            h['total_shots'] += self._safe_get(match, 'home_totalshotsongoal')
            h['shots_on_target'] += self._safe_get(match, 'home_shotsongoal')
            h['possession_sum'] += self._safe_get(match, 'home_ballpossession', default=50)
            h['corners'] += self._safe_get(match, 'home_cornerkicks')
            h['fouls'] += self._safe_get(match, 'home_fouls')
            h['yellow_cards'] += self._safe_get(match, 'home_yellow_cards_calc', 'home_yellowcards')
            h['red_cards'] += self._safe_get(match, 'home_red_cards_calc', 'home_redcards')
            if away_score == 0:
                h['clean_sheets'] += 1
            
            a = team_stats[away_team]
            a['matches_played'] += 1
            a['away_matches'] += 1
            a['goals_for'] += away_score
            a['goals_against'] += home_score
            a['xg_for'] += self._safe_get(match, 'away_xg', 'away_expectedgoals')
            a['xg_against'] += self._safe_get(match, 'home_xg', 'home_expectedgoals')
            a['total_shots'] += self._safe_get(match, 'away_totalshotsongoal')
            a['shots_on_target'] += self._safe_get(match, 'away_shotsongoal')
            a['possession_sum'] += self._safe_get(match, 'away_ballpossession', default=50)
            a['corners'] += self._safe_get(match, 'away_cornerkicks')
            a['fouls'] += self._safe_get(match, 'away_fouls')
            a['yellow_cards'] += self._safe_get(match, 'away_yellow_cards_calc', 'away_yellowcards')
            a['red_cards'] += self._safe_get(match, 'away_red_cards_calc', 'away_redcards')
            if home_score == 0:
                a['clean_sheets'] += 1
            
            if home_score > away_score:
                h['wins'] += 1
                h['home_wins'] += 1
                a['losses'] += 1
            elif home_score < away_score:
                a['wins'] += 1
                a['away_wins'] += 1
                h['losses'] += 1
            else:
                h['draws'] += 1
                a['draws'] += 1
        
        result = {}
        for team, stats in team_stats.items():
            mp = stats['matches_played']
            hm = max(stats['home_matches'], 1)
            am = max(stats['away_matches'], 1)
            
            result[team] = {
                'matches_played': mp,
                'wins': stats['wins'],
                'draws': stats['draws'],
                'losses': stats['losses'],
                'points': stats['wins'] * 3 + stats['draws'],
                'win_rate': round(stats['wins'] / mp, 3),
                'home_win_rate': round(stats['home_wins'] / hm, 3),
                'away_win_rate': round(stats['away_wins'] / am, 3),
                'goals_for': stats['goals_for'],
                'goals_against': stats['goals_against'],
                'goal_diff': stats['goals_for'] - stats['goals_against'],
                'avg_goals_for': round(stats['goals_for'] / mp, 2),
                'avg_goals_against': round(stats['goals_against'] / mp, 2),
                'xg_for': round(stats['xg_for'], 2),
                'xg_against': round(stats['xg_against'], 2),
                'clean_sheets': stats['clean_sheets'],
                'avg_shots': round(stats['total_shots'] / mp, 1),
                'avg_possession': round(stats['possession_sum'] / mp, 1),
                'total_yellow_cards': int(stats['yellow_cards']),
                'total_red_cards': int(stats['red_cards']),
            }
        
        return result
    
    def compute_h2h(self, matches_data):
        h2h = defaultdict(list)
        
        for match in matches_data:
            home = match.get('home_team')
            away = match.get('away_team')
            key = tuple(sorted([home, away]))
            h2h[key].append({
                'date': match.get('date'),
                'home_team': home,
                'away_team': away,
                'home_score': match.get('home_score'),
                'away_score': match.get('away_score'),
            })
        
        result = {}
        for (team1, team2), matches in h2h.items():
            key = f"{team1}_vs_{team2}"
            matches_sorted = sorted(matches, key=lambda x: x['date'] or '', reverse=True)
            
            team1_wins = sum(1 for m in matches if 
                           (m['home_team'] == team1 and (m['home_score'] or 0) > (m['away_score'] or 0)) or
                           (m['away_team'] == team1 and (m['away_score'] or 0) > (m['home_score'] or 0)))
            team2_wins = sum(1 for m in matches if 
                           (m['home_team'] == team2 and (m['home_score'] or 0) > (m['away_score'] or 0)) or
                           (m['away_team'] == team2 and (m['away_score'] or 0) > (m['home_score'] or 0)))
            
            result[key] = {
                'team1': team1,
                'team2': team2,
                'total_matches': len(matches),
                f'{team1}_wins': team1_wins,
                f'{team2}_wins': team2_wins,
                'draws': len(matches) - team1_wins - team2_wins,
                'matches': matches_sorted
            }
        
        return result
    
    def save_processed_data(self, season_name, matches_data):
        slug = self._season_slug(season_name)
        
        team_stats = self.compute_team_stats(matches_data)
        team_path = os.path.join(self.paths['processed'], f'teams_{slug}.json')
        with open(team_path, 'w', encoding='utf-8') as f:
            json.dump(team_stats, f, ensure_ascii=False, indent=2)

        h2h = self.compute_h2h(matches_data)
        h2h_path = os.path.join(self.paths['processed'], f'h2h_{slug}.json')
        with open(h2h_path, 'w', encoding='utf-8') as f:
            json.dump(h2h, f, ensure_ascii=False, indent=2)
        
        return team_stats, h2h


class PlayerDataManager:

    def __init__(self, data_manager):
        self.dm = data_manager
        self.paths = data_manager.paths
    
    def _timestamp_to_date(self, timestamp):
        if timestamp is None:
            return None
        try:
            return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')
        except:
            return None
    
    def _season_slug(self, season_name):
        import re
        year_match = re.search(r'(\d{2})/(\d{2})', season_name)
        if year_match:
            return f"{self.dm.league}_{year_match.group(1)}_{year_match.group(2)}"
        return season_name.replace('/', '_').replace(' ', '_').lower()

    def extract_player_info(self, player_data, team_name=None):
        player = player_data.get('player', {})
        dob_timestamp = player.get('dateOfBirthTimestamp')
        
        return {
            'id': player.get('id'),
            'name': player.get('name'),
            'short_name': player.get('shortName'),
            'position': player_data.get('position'),
            'jersey_number': player_data.get('jerseyNumber'),
            'date_of_birth': self._timestamp_to_date(dob_timestamp),
            'height': player.get('height'),
            'country': player.get('country', {}).get('name') if player.get('country') else None,
            'team': team_name,
        }
    
    def extract_player_match_stats(self, player_data, match_info):
        player = player_data.get('player', {})
        stats = player_data.get('statistics', {})
        
        return {
            'player_id': player.get('id'),
            'player_name': player.get('name'),
            'date_of_birth': self._timestamp_to_date(player.get('dateOfBirthTimestamp')),
            'match_id': match_info.get('match_id'),
            'event_id': match_info.get('event_id'),
            'date': match_info.get('date'),
            'season': match_info.get('season'),
            'round': match_info.get('round'),
            'team': match_info.get('team'),
            'opponent': match_info.get('opponent'),
            'is_home': match_info.get('is_home'),
            'team_score': match_info.get('team_score'),
            'opponent_score': match_info.get('opponent_score'),
            'match_result': match_info.get('match_result'),
            'position': player_data.get('position'),
            'jersey_number': player_data.get('jerseyNumber'),
            'is_starter': not player_data.get('substitute', False),
            'is_captain': player_data.get('captain', False),
            
            'minutes_played': stats.get('minutesPlayed', 0),
            'rating': stats.get('rating'),

            'goals': stats.get('goals', 0),
            'assists': stats.get('goalAssist', 0),
            'expected_goals': stats.get('expectedGoals'),
            'expected_assists': stats.get('expectedAssists'),
            'shots_total': stats.get('totalShots', 0),
            'shots_on_target': stats.get('onTargetScoringAttempt', 0),
            'shots_blocked': stats.get('blockedScoringAttempt', 0),
            'shots_off_target': stats.get('shotOffTarget', 0),
            'big_chances_missed': stats.get('bigChanceMissed', 0),
            'big_chances_created': stats.get('bigChanceCreated', 0),
            
            'passes_total': stats.get('totalPass', 0),
            'passes_accurate': stats.get('accuratePass', 0),
            'key_passes': stats.get('keyPass', 0),
            'long_balls_total': stats.get('totalLongBalls', 0),
            'long_balls_accurate': stats.get('accurateLongBalls', 0),
            'crosses_total': stats.get('totalCross', 0),
            'crosses_accurate': stats.get('accurateCross', 0),
            'passes_own_half': stats.get('totalOwnHalfPasses', 0),
            'passes_own_half_accurate': stats.get('accurateOwnHalfPasses', 0),
            'passes_opp_half': stats.get('totalOppositionHalfPasses', 0),
            'passes_opp_half_accurate': stats.get('accurateOppositionHalfPasses', 0),
            
            'dribbles_attempted': stats.get('totalDribble', 0),
            'dribbles_won': stats.get('dribbleWon', 0),
            'ball_carries_count': stats.get('ballCarriesCount', 0),
            'ball_carries_distance': stats.get('totalBallCarriesDistance'),
            'best_ball_carry_progression': stats.get('bestBallCarryProgression'),
            'total_progression': stats.get('totalProgression'),
            'possession_lost': stats.get('possessionLostCtrl', 0),
            'unsuccessful_touch': stats.get('unsuccessfulTouch', 0),
            
            'duels_total': stats.get('totalDuel', 0),
            'duels_won': stats.get('duelWon', 0),
            'aerial_duels_won': stats.get('aerialWon', 0),
            'aerial_duels_lost': stats.get('aerialLost', 0),
            'tackles_total': stats.get('totalTackle', 0),
            'tackles_won': stats.get('wonTackle', 0),
            'interceptions': stats.get('interceptionWon', 0),
            'clearances': stats.get('totalClearance', 0),
            'blocks': stats.get('outfielderBlock', 0),
            'ball_recoveries': stats.get('ballRecovery', 0),
            
            'fouls_committed': stats.get('foulCommitted', 0),
            'fouls_won': stats.get('wasFouled', 0),
            'yellow_cards': 1 if stats.get('yellowCard') else 0,
            'red_cards': 1 if stats.get('redCard') else 0,
            'offsides': stats.get('totalOffside', 0),
            
            'touches': stats.get('touches', 0),
            'touches_in_box': stats.get('touchOppBox', 0),
            
            'saves': stats.get('saves', 0),
            'goals_conceded': stats.get('goalsConceded', 0),
            'punches': stats.get('punches', 0),
            'saves_inside_box': stats.get('savedShotsFromInsideTheBox', 0),
            'saves_outside_box': stats.get('savedShotsFromOutsideTheBox', 0),
            
            'defensive_value': stats.get('defensiveValueNormalized'),
            'dribble_value': stats.get('dribbleValueNormalized'),
            'pass_value': stats.get('passValueNormalized'),
        }
    
    def process_match_lineups(self, lineups_data, match_info):
        if not lineups_data:
            return None, []
        
        result = {
            'match_id': match_info.get('match_id'),
            'event_id': match_info.get('event_id'),
            'date': match_info.get('date'),
            'season': match_info.get('season'),
            'home_team': match_info.get('home_team'),
            'away_team': match_info.get('away_team'),
            'home': {'formation': lineups_data.get('home', {}).get('formation'), 'starters': [], 'substitutes': []},
            'away': {'formation': lineups_data.get('away', {}).get('formation'), 'starters': [], 'substitutes': []},
        }
        
        player_stats = []
        
        for side in ['home', 'away']:
            side_data = lineups_data.get(side, {})
            players = side_data.get('players', [])
            
            team_name = match_info.get(f'{side}_team')
            opponent = match_info.get('away_team' if side == 'home' else 'home_team')
            team_score = match_info.get(f'{side}_score')
            opp_score = match_info.get('away_score' if side == 'home' else 'home_score')
            
            if team_score > opp_score: match_result = 'W'
            elif team_score < opp_score: match_result = 'L'
            else: match_result = 'D'
            
            player_match_info = {
                **match_info,
                'team': team_name,
                'opponent': opponent,
                'is_home': side == 'home',
                'team_score': team_score,
                'opponent_score': opp_score,
                'match_result': match_result,
            }
            
            for p in players:
                player_info = self.extract_player_info(p, team_name)
                if p.get('substitute', False):
                    result[side]['substitutes'].append(player_info)
                else:
                    result[side]['starters'].append(player_info)
                
                if p.get('statistics', {}).get('minutesPlayed', 0) > 0:
                    stats = self.extract_player_match_stats(p, player_match_info)
                    player_stats.append(stats)
        
        return result, player_stats
    
    def save_season_data(self, season_name, lineups_list, all_player_stats, player_registry):
        slug = self._season_slug(season_name)
        
        lineups_path = os.path.join(self.paths['lineups'], f'lineups_{slug}.json')
        with open(lineups_path, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {'season': season_name, 'total_matches': len(lineups_list)},
                'lineups': lineups_list
            }, f, ensure_ascii=False, indent=2)
        
        stats_path = os.path.join(self.paths['player_stats'], f'player_stats_{slug}.json')
        with open(stats_path, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {'season': season_name, 'total_records': len(all_player_stats)},
                'player_stats': all_player_stats
            }, f, ensure_ascii=False, indent=2)
        
        players_by_team = defaultdict(list)
        for player in player_registry.values():
            team = player.get('team') or 'Unknown'
            players_by_team[team].append(player)
        
        position_order = {'G': 0, 'D': 1, 'M': 2, 'F': 3}
        for team in players_by_team:
            players_by_team[team] = sorted(
                players_by_team[team],
                key=lambda p: (position_order.get(p.get('position'), 4), p.get('name', ''))
            )
        
        registry_data = {
            'metadata': {
                'season': season_name,
                'total_players': len(player_registry),
                'total_teams': len(players_by_team),
            },
            'teams': dict(players_by_team)
        }
        
        registry_path = os.path.join(self.paths['players'], f'players_{slug}.json')
        with open(registry_path, 'w', encoding='utf-8') as f:
            json.dump(registry_data, f, ensure_ascii=False, indent=2)
        
        return {'lineups': lineups_path, 'player_stats': stats_path, 'registry': registry_path}
