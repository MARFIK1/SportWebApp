"""
ML Feature Generator for football match prediction.
"""

from datetime import datetime, timedelta
from collections import defaultdict


class MLFeatureGenerator:
    
    def __init__(self, data_manager):
        self.dm = data_manager
    
    def _safe_get(self, data, key, default=0):
        val = data.get(key)
        return val if val is not None else default
    
    def _get_team_matches(self, team, matches, before_date):
        return [
            m for m in matches 
            if (m.get('date') or '') < before_date and 
               (m.get('home_team') == team or m.get('away_team') == team)
        ]
    
    def compute_rest_days(self, team, matches, match_date):
        team_matches = [
            m for m in matches 
            if (m.get('date') or '') < match_date and 
               (m.get('home_team') == team or m.get('away_team') == team)
        ]
        
        if not team_matches:
            return {'rest_days': 7, 'is_congested': 0}
        
        last_match = max(team_matches, key=lambda x: x.get('date') or '')
        last_date = last_match.get('date')
        
        if not last_date:
            return {'rest_days': 7, 'is_congested': 0}
        
        try:
            current = datetime.strptime(match_date, '%Y-%m-%d')
            previous = datetime.strptime(last_date, '%Y-%m-%d')
            days = (current - previous).days
            return {
                'rest_days': days,
                'is_congested': 1 if days <= 3 else 0,
            }
        except:
            return {'rest_days': 7, 'is_congested': 0}
    
    def compute_form(self, team, matches, before_date, n_matches=5):
        team_matches = [
            m for m in matches 
            if (m.get('date') or '') < before_date and 
               (m.get('home_team') == team or m.get('away_team') == team)
        ]
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]
        
        if not team_matches:
            return {f'form_{k}': 0 for k in [
                'matches', 'points', 'avg_points', 'wins', 'draws', 'losses',
                'goals_for', 'goals_against', 'goal_diff',
                'xg_for', 'xg_against', 'xg_diff',
                'shots', 'shots_on_target', 'clean_sheets'
            ]}
        
        stats = {'points': 0, 'wins': 0, 'draws': 0, 'losses': 0,
                 'goals_for': 0, 'goals_against': 0,
                 'xg_for': 0, 'xg_against': 0,
                 'shots': 0, 'shots_on_target': 0, 'clean_sheets': 0}
        
        for m in team_matches:
            is_home = m.get('home_team') == team
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
            
            if is_home:
                stats['goals_for'] += hs
                stats['goals_against'] += as_
                stats['xg_for'] += self._safe_get(m, 'home_xg')
                stats['xg_against'] += self._safe_get(m, 'away_xg')
                stats['shots'] += self._safe_get(m, 'home_totalshotsongoal')
                stats['shots_on_target'] += self._safe_get(m, 'home_shotsongoal')
                if as_ == 0: stats['clean_sheets'] += 1
                if hs > as_: stats['points'] += 3; stats['wins'] += 1
                elif hs == as_: stats['points'] += 1; stats['draws'] += 1
                else: stats['losses'] += 1
            else:
                stats['goals_for'] += as_
                stats['goals_against'] += hs
                stats['xg_for'] += self._safe_get(m, 'away_xg')
                stats['xg_against'] += self._safe_get(m, 'home_xg')
                stats['shots'] += self._safe_get(m, 'away_totalshotsongoal')
                stats['shots_on_target'] += self._safe_get(m, 'away_shotsongoal')
                if hs == 0: stats['clean_sheets'] += 1
                if as_ > hs: stats['points'] += 3; stats['wins'] += 1
                elif hs == as_: stats['points'] += 1; stats['draws'] += 1
                else: stats['losses'] += 1
        
        n = len(team_matches)
        return {
            'form_matches': n,
            'form_points': stats['points'],
            'form_avg_points': round(stats['points'] / n, 2),
            'form_wins': stats['wins'],
            'form_draws': stats['draws'],
            'form_losses': stats['losses'],
            'form_goals_for': stats['goals_for'],
            'form_goals_against': stats['goals_against'],
            'form_goal_diff': stats['goals_for'] - stats['goals_against'],
            'form_avg_goals_for': round(stats['goals_for'] / n, 2),
            'form_avg_goals_against': round(stats['goals_against'] / n, 2),
            'form_xg_for': round(stats['xg_for'], 2),
            'form_xg_against': round(stats['xg_against'], 2),
            'form_xg_diff': round(stats['xg_for'] - stats['xg_against'], 2),
            'form_shots': stats['shots'],
            'form_shots_on_target': stats['shots_on_target'],
            'form_avg_shots': round(stats['shots'] / n, 1),
            'form_clean_sheets': stats['clean_sheets'],
        }
    
    def compute_table_position(self, team, matches, before_date):
        standings = defaultdict(lambda: {'points': 0, 'gd': 0, 'gf': 0, 'matches': 0})
        
        for m in matches:
            if (m.get('date') or '') >= before_date:
                continue
            
            home, away = m.get('home_team'), m.get('away_team')
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
            
            standings[home]['matches'] += 1
            standings[away]['matches'] += 1
            standings[home]['gf'] += hs
            standings[home]['gd'] += hs - as_
            standings[away]['gf'] += as_
            standings[away]['gd'] += as_ - hs
            
            if hs > as_: standings[home]['points'] += 3
            elif hs < as_: standings[away]['points'] += 3
            else: standings[home]['points'] += 1; standings[away]['points'] += 1
        
        sorted_teams = sorted(
            standings.keys(),
            key=lambda t: (standings[t]['points'], standings[t]['gd'], standings[t]['gf']),
            reverse=True
        )
        
        if team in sorted_teams:
            pos = sorted_teams.index(team) + 1
            return {
                'table_position': pos,
                'table_points': standings[team]['points'],
                'table_goal_diff': standings[team]['gd'],
                'table_matches': standings[team]['matches'],
                'table_ppg': round(standings[team]['points'] / max(standings[team]['matches'], 1), 2),
            }
        return {'table_position': 0, 'table_points': 0, 'table_goal_diff': 0, 'table_matches': 0, 'table_ppg': 0}
    
    def get_h2h_stats(self, home_team, away_team, matches, before_date, n_matches=5):
        h2h_matches = [
            m for m in matches
            if (m.get('date') or '') < before_date and
               ((m.get('home_team') == home_team and m.get('away_team') == away_team) or
                (m.get('home_team') == away_team and m.get('away_team') == home_team))
        ]
        h2h_matches = sorted(h2h_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]
        
        if not h2h_matches:
            return {'h2h_matches': 0, 'h2h_home_wins': 0, 'h2h_away_wins': 0, 
                    'h2h_draws': 0, 'h2h_home_goals': 0, 'h2h_away_goals': 0, 'h2h_home_win_rate': 0.33}
        
        home_wins, away_wins, draws = 0, 0, 0
        home_goals, away_goals = 0, 0
        
        for m in h2h_matches:
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
            
            if m.get('home_team') == home_team:
                home_goals += hs
                away_goals += as_
                if hs > as_: home_wins += 1
                elif hs < as_: away_wins += 1
                else: draws += 1
            else:
                home_goals += as_
                away_goals += hs
                if as_ > hs: home_wins += 1
                elif as_ < hs: away_wins += 1
                else: draws += 1
        
        return {
            'h2h_matches': len(h2h_matches),
            'h2h_home_wins': home_wins,
            'h2h_away_wins': away_wins,
            'h2h_draws': draws,
            'h2h_home_goals': home_goals,
            'h2h_away_goals': away_goals,
            'h2h_home_win_rate': round(home_wins / len(h2h_matches), 2),
        }
    
    def compute_momentum(self, team, matches, before_date):
        """Recent 3 matches vs previous 3 - positive = improving."""
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)
        
        if len(team_matches) < 6:
            return {'momentum_points': 0, 'momentum_goals': 0, 'momentum_xg': 0}
        
        recent_3 = team_matches[:3]
        prev_3 = team_matches[3:6]
        
        def calc_stats(match_list, team):
            points, goals, xg = 0, 0, 0
            for m in match_list:
                is_home = m.get('home_team') == team
                hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
                
                if is_home:
                    goals += hs
                    xg += self._safe_get(m, 'home_xg')
                    if hs > as_: points += 3
                    elif hs == as_: points += 1
                else:
                    goals += as_
                    xg += self._safe_get(m, 'away_xg')
                    if as_ > hs: points += 3
                    elif hs == as_: points += 1
            return points, goals, xg
        
        recent_pts, recent_goals, recent_xg = calc_stats(recent_3, team)
        prev_pts, prev_goals, prev_xg = calc_stats(prev_3, team)
        
        return {
            'momentum_points': recent_pts - prev_pts,  # -9 to +9
            'momentum_goals': recent_goals - prev_goals,
            'momentum_xg': round(recent_xg - prev_xg, 2),
        }
    
    def compute_home_away_form(self, team, matches, before_date, is_home, n_matches=5):
        team_matches = [
            m for m in matches 
            if (m.get('date') or '') < before_date and 
               ((is_home and m.get('home_team') == team) or 
                (not is_home and m.get('away_team') == team))
        ]
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]
        
        if not team_matches:
            return {
                'venue_form_matches': 0,
                'venue_form_points': 0,
                'venue_form_ppg': 0,
                'venue_form_goals_for': 0,
                'venue_form_goals_against': 0,
                'venue_form_clean_sheets': 0,
            }
        
        points, goals_for, goals_against, clean_sheets = 0, 0, 0, 0
        
        for m in team_matches:
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
            
            if is_home:
                goals_for += hs
                goals_against += as_
                if as_ == 0: clean_sheets += 1
                if hs > as_: points += 3
                elif hs == as_: points += 1
            else:
                goals_for += as_
                goals_against += hs
                if hs == 0: clean_sheets += 1
                if as_ > hs: points += 3
                elif hs == as_: points += 1
        
        n = len(team_matches)
        return {
            'venue_form_matches': n,
            'venue_form_points': points,
            'venue_form_ppg': round(points / n, 2),
            'venue_form_goals_for': goals_for,
            'venue_form_goals_against': goals_against,
            'venue_form_clean_sheets': clean_sheets,
        }
    
    def compute_fatigue(self, team, matches, match_date, days=14):
        """How many matches played in the last N days."""
        try:
            current = datetime.strptime(match_date, '%Y-%m-%d')
            cutoff = (current - timedelta(days=days)).strftime('%Y-%m-%d')
        except:
            return {'fatigue_matches': 0, 'fatigue_avg_days': 7}
        
        recent_matches = [
            m for m in matches 
            if cutoff <= (m.get('date') or '') < match_date and 
               (m.get('home_team') == team or m.get('away_team') == team)
        ]
        
        if not recent_matches:
            return {'fatigue_matches': 0, 'fatigue_avg_days': 7}
        
        match_dates = sorted([m.get('date') for m in recent_matches])
        if len(match_dates) > 1:
            total_days = 0
            for i in range(1, len(match_dates)):
                d1 = datetime.strptime(match_dates[i-1], '%Y-%m-%d')
                d2 = datetime.strptime(match_dates[i], '%Y-%m-%d')
                total_days += (d2 - d1).days
            avg_days = total_days / (len(match_dates) - 1)
        else:
            avg_days = 7
        
        return {
            'fatigue_matches': len(recent_matches),
            'fatigue_avg_days': round(avg_days, 1),
        }
    
    def compute_strength_of_schedule(self, team, matches, before_date, n_opponents=5):
        """Average table position of recent opponents."""
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_opponents]
        
        if not team_matches:
            return {'sos_avg_position': 10, 'sos_avg_ppg': 1.0}
        
        standings = defaultdict(lambda: {'points': 0, 'matches': 0})
        for m in matches:
            if (m.get('date') or '') >= before_date:
                continue
            home, away = m.get('home_team'), m.get('away_team')
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
            
            standings[home]['matches'] += 1
            standings[away]['matches'] += 1
            
            if hs > as_: standings[home]['points'] += 3
            elif hs < as_: standings[away]['points'] += 3
            else: standings[home]['points'] += 1; standings[away]['points'] += 1
        
        sorted_teams = sorted(
            standings.keys(),
            key=lambda t: (standings[t]['points'], t),
            reverse=True
        )
        
        team_positions = {t: i+1 for i, t in enumerate(sorted_teams)}
        
        opponents_positions = []
        opponents_ppg = []
        for m in team_matches:
            opp = m.get('away_team') if m.get('home_team') == team else m.get('home_team')
            if opp in team_positions:
                opponents_positions.append(team_positions[opp])
            if opp in standings and standings[opp]['matches'] > 0:
                opponents_ppg.append(standings[opp]['points'] / standings[opp]['matches'])
        
        avg_pos = sum(opponents_positions) / len(opponents_positions) if opponents_positions else 10
        avg_ppg = sum(opponents_ppg) / len(opponents_ppg) if opponents_ppg else 1.0
        
        return {
            'sos_avg_position': round(avg_pos, 1),
            'sos_avg_ppg': round(avg_ppg, 2),
        }
    
    def compute_scoring_patterns(self, team, matches, before_date, n_matches=10):
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]
        
        if not team_matches:
            return {
                'scoring_first_half_pct': 0.5,
                'conceding_first_half_pct': 0.5,
                'clean_sheet_pct': 0.2,
                'failed_to_score_pct': 0.2,
            }
        
        clean_sheets = 0
        failed_to_score = 0
        scored_first_half = 0
        conceded_first_half = 0
        matches_with_ht = 0
        
        for m in team_matches:
            is_home = m.get('home_team') == team
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0
            ht_home = m.get('home_score_ht')
            ht_away = m.get('away_score_ht')
            
            if is_home:
                if as_ == 0: clean_sheets += 1
                if hs == 0: failed_to_score += 1
                if ht_home is not None and ht_away is not None:
                    matches_with_ht += 1
                    if ht_home > 0: scored_first_half += 1
                    if ht_away > 0: conceded_first_half += 1
            else:
                if hs == 0: clean_sheets += 1
                if as_ == 0: failed_to_score += 1
                if ht_home is not None and ht_away is not None:
                    matches_with_ht += 1
                    if ht_away > 0: scored_first_half += 1
                    if ht_home > 0: conceded_first_half += 1
        
        n = len(team_matches)
        return {
            'scoring_first_half_pct': round(scored_first_half / matches_with_ht, 2) if matches_with_ht > 0 else 0.5,
            'conceding_first_half_pct': round(conceded_first_half / matches_with_ht, 2) if matches_with_ht > 0 else 0.5,
            'clean_sheet_pct': round(clean_sheets / n, 2),
            'failed_to_score_pct': round(failed_to_score / n, 2),
        }
    
    def compute_corner_form(self, team, matches, before_date, n_matches=8):
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]

        if not team_matches:
            return {'corner_form_for': 0, 'corner_form_against': 0, 'corner_form_avg_for': 0}

        corners_for, corners_against, n_with_data = 0, 0, 0
        for m in team_matches:
            hc = m.get('home_cornerkicks')
            ac = m.get('away_cornerkicks')
            if hc is None or ac is None:
                continue
            is_home = m.get('home_team') == team
            corners_for += hc if is_home else ac
            corners_against += ac if is_home else hc
            n_with_data += 1

        if n_with_data == 0:
            return {'corner_form_for': 0, 'corner_form_against': 0, 'corner_form_avg_for': 0}

        return {
            'corner_form_for': corners_for,
            'corner_form_against': corners_against,
            'corner_form_avg_for': round(corners_for / n_with_data, 2),
        }

    def compute_card_form(self, team, matches, before_date, n_matches=8):
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]

        if not team_matches:
            return {'card_form_total': 0, 'card_form_avg': 0}

        cards, n_with_data = 0, 0
        for m in team_matches:
            hy = m.get('home_yellow_cards_calc') or m.get('home_yellowcards')
            ay = m.get('away_yellow_cards_calc') or m.get('away_yellowcards')
            if hy is None or ay is None:
                continue
            is_home = m.get('home_team') == team
            cards += int(hy) if is_home else int(ay)
            n_with_data += 1

        if n_with_data == 0:
            return {'card_form_total': 0, 'card_form_avg': 0}

        return {
            'card_form_total': cards,
            'card_form_avg': round(cards / n_with_data, 2),
        }

    def compute_detailed_stats_form(self, team, matches, before_date, n_matches=8):
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]

        # (sofascore field name, output name)
        STATS = [
            ('ballpossession', 'possession'),
            ('fouls', 'fouls'),
            ('totaltackle', 'tackles'),
            ('accuratecross', 'crosses'),
            ('totalshotsinsidebox', 'shots_in_box'),
            ('totalclearance', 'clearances'),
            ('fouledfinalthird', 'fouls_final_third'),
            ('finalthirdentries', 'final_third_entries'),
        ]

        defaults = {}
        for _, out_name in STATS:
            defaults[f'stats_{out_name}_for'] = 0
            defaults[f'stats_{out_name}_against'] = 0

        if not team_matches:
            return defaults

        accum = {k: 0 for k in defaults}
        n_with_data = 0

        for m in team_matches:
            has_stats = m.get('home_fouls') is not None or m.get('home_ballpossession') is not None
            if not has_stats:
                continue
            n_with_data += 1
            is_home = m.get('home_team') == team

            for raw_name, out_name in STATS:
                h_val = m.get(f'home_{raw_name}')
                a_val = m.get(f'away_{raw_name}')
                if h_val is None or a_val is None:
                    continue
                h_val, a_val = float(h_val), float(a_val)
                if is_home:
                    accum[f'stats_{out_name}_for'] += h_val
                    accum[f'stats_{out_name}_against'] += a_val
                else:
                    accum[f'stats_{out_name}_for'] += a_val
                    accum[f'stats_{out_name}_against'] += h_val

        if n_with_data == 0:
            return defaults

        result = {}
        for k, total in accum.items():
            result[k] = round(total / n_with_data, 2)
        return result

    def compute_weighted_form(self, team, matches, before_date, n_matches=10, decay=0.85):
        """Form with exponential decay - recent matches weigh more."""
        team_matches = self._get_team_matches(team, matches, before_date)
        team_matches = sorted(team_matches, key=lambda x: x.get('date') or '', reverse=True)[:n_matches]

        if not team_matches:
            return {
                'wform_ppg': 0, 'wform_goals_for': 0, 'wform_goals_against': 0,
                'wform_xg_diff': 0, 'wform_clean_sheets': 0,
            }

        w_points, w_gf, w_ga, w_xg_f, w_xg_a, w_cs = 0, 0, 0, 0, 0, 0
        total_w = 0

        for i, m in enumerate(team_matches):
            w = decay ** i
            total_w += w
            is_home = m.get('home_team') == team
            hs, as_ = m.get('home_score') or 0, m.get('away_score') or 0

            if is_home:
                w_gf += hs * w
                w_ga += as_ * w
                w_xg_f += self._safe_get(m, 'home_xg') * w
                w_xg_a += self._safe_get(m, 'away_xg') * w
                if as_ == 0: w_cs += w
                if hs > as_: w_points += 3 * w
                elif hs == as_: w_points += w
            else:
                w_gf += as_ * w
                w_ga += hs * w
                w_xg_f += self._safe_get(m, 'away_xg') * w
                w_xg_a += self._safe_get(m, 'home_xg') * w
                if hs == 0: w_cs += w
                if as_ > hs: w_points += 3 * w
                elif hs == as_: w_points += w

        return {
            'wform_ppg': round(w_points / total_w, 2),
            'wform_goals_for': round(w_gf / total_w, 2),
            'wform_goals_against': round(w_ga / total_w, 2),
            'wform_xg_diff': round((w_xg_f - w_xg_a) / total_w, 2),
            'wform_clean_sheets': round(w_cs / total_w, 2),
        }

    def _compute_elo_table(self, matches):
        """Precompute ELO for all matches. Returns {event_id: (home_elo, away_elo)}."""
        sorted_matches = sorted(matches, key=lambda x: x.get('date') or '')

        elo = {}
        match_elos = {}

        K = 32
        HOME_ADV = 50

        for m in sorted_matches:
            home = m.get('home_team')
            away = m.get('away_team')
            eid = m.get('event_id')

            if not home or not away or not eid:
                continue

            elo.setdefault(home, 1500)
            elo.setdefault(away, 1500)

            match_elos[eid] = (round(elo[home], 1), round(elo[away], 1))

            hs = m.get('home_score')
            as_ = m.get('away_score')
            if hs is None or as_ is None:
                continue

            elo_h = elo[home] + HOME_ADV
            elo_a = elo[away]
            exp_home = 1 / (1 + 10 ** ((elo_a - elo_h) / 400))
            exp_away = 1 - exp_home

            if hs > as_:
                s_home, s_away = 1, 0
            elif hs < as_:
                s_home, s_away = 0, 1
            else:
                s_home, s_away = 0.5, 0.5

            elo[home] += K * (s_home - exp_home)
            elo[away] += K * (s_away - exp_away)

        return match_elos

    def compute_player_features(self, team, player_stats, before_date, n_matches=5):
        default = {
            'avg_player_rating': 6.5,
            'top_scorer_goals': 0,
            'total_team_goals': 0,
            'total_team_assists': 0,
            'avg_minutes_starters': 90,
            'squad_avg_age': 26,
        }
        
        if not player_stats:
            return default
        
        team_stats = [
            ps for ps in player_stats
            if ps.get('team') == team and 
               (ps.get('date') or '') < before_date
        ]
        
        if not team_stats:
            return default
        
        match_dates = sorted(set(ps.get('date') for ps in team_stats if ps.get('date')), reverse=True)[:n_matches]
        recent_stats = [ps for ps in team_stats if ps.get('date') in match_dates]
        
        if not recent_stats:
            return default
        
        ratings = [ps.get('rating', 0) for ps in recent_stats if ps.get('rating')]
        avg_rating = sum(ratings) / len(ratings) if ratings else 6.5
        
        player_goals = {}
        player_assists = {}
        for ps in team_stats:  # all time, not just recent
            pid = ps.get('player_id')
            if pid:
                player_goals[pid] = player_goals.get(pid, 0) + (ps.get('goals', 0) or 0)
                player_assists[pid] = player_assists.get(pid, 0) + (ps.get('assists', 0) or 0)
        
        top_scorer_goals = max(player_goals.values()) if player_goals else 0
        total_goals = sum(ps.get('goals', 0) or 0 for ps in recent_stats)
        total_assists = sum(ps.get('assists', 0) or 0 for ps in recent_stats)
        
        starters = [ps for ps in recent_stats if ps.get('is_starter')]
        avg_minutes = sum(ps.get('minutes_played', 0) or 0 for ps in starters) / len(starters) if starters else 90
        
        ages = []
        for ps in recent_stats:
            dob = ps.get('date_of_birth')
            if dob and before_date:
                try:
                    birth = datetime.strptime(dob, '%Y-%m-%d')
                    ref = datetime.strptime(before_date, '%Y-%m-%d')
                    age = (ref - birth).days / 365.25
                    if 15 < age < 50:  # sanity check
                        ages.append(age)
                except:
                    pass
        avg_age = round(sum(ages) / len(ages), 1) if ages else 26
        
        return {
            'avg_player_rating': round(avg_rating, 2),
            'top_scorer_goals': top_scorer_goals,
            'total_team_goals': total_goals,
            'total_team_assists': total_assists,
            'avg_minutes_starters': round(avg_minutes, 1),
            'squad_avg_age': avg_age,
        }
    
    def generate_match_features(self, match, all_matches, player_stats=None, elo_table=None):
        home_team = match.get('home_team')
        away_team = match.get('away_team')
        match_date = match.get('date')
        
        features = {
            'event_id': match.get('event_id'),
            'date': match_date,
            'round': match.get('round'),
            'home_team': home_team,
            'away_team': away_team,
        }
        
        home_rest = self.compute_rest_days(home_team, all_matches, match_date)
        features['home_rest_days'] = home_rest['rest_days']
        features['home_is_congested'] = home_rest['is_congested']
        
        away_rest = self.compute_rest_days(away_team, all_matches, match_date)
        features['away_rest_days'] = away_rest['rest_days']
        features['away_is_congested'] = away_rest['is_congested']
        
        features['rest_days_diff'] = home_rest['rest_days'] - away_rest['rest_days']
        
        home_form = self.compute_form(home_team, all_matches, match_date, n_matches=5)
        for k, v in home_form.items():
            features[f'home_{k}'] = v
        
        away_form = self.compute_form(away_team, all_matches, match_date, n_matches=5)
        for k, v in away_form.items():
            features[f'away_{k}'] = v
        
        home_form10 = self.compute_form(home_team, all_matches, match_date, n_matches=10)
        for k, v in home_form10.items():
            new_key = k.replace('form_', 'form10_')
            features[f'home_{new_key}'] = v
        
        away_form10 = self.compute_form(away_team, all_matches, match_date, n_matches=10)
        for k, v in away_form10.items():
            new_key = k.replace('form_', 'form10_')
            features[f'away_{new_key}'] = v
        
        features['form10_points_diff'] = features.get('home_form10_points', 0) - features.get('away_form10_points', 0)

        home_pos = self.compute_table_position(home_team, all_matches, match_date)
        for k, v in home_pos.items():
            features[f'home_{k}'] = v
        
        away_pos = self.compute_table_position(away_team, all_matches, match_date)
        for k, v in away_pos.items():
            features[f'away_{k}'] = v
        
        features['position_diff'] = features['home_table_position'] - features['away_table_position']
        features['points_diff'] = features['home_table_points'] - features['away_table_points']
        features['form_points_diff'] = features['home_form_points'] - features['away_form_points']
        features['ppg_diff'] = features['home_table_ppg'] - features['away_table_ppg']
        features['xg_form_diff'] = features['home_form_xg_for'] - features['away_form_xg_for']
        
        h2h = self.get_h2h_stats(home_team, away_team, all_matches, match_date)
        features.update(h2h)

        home_momentum = self.compute_momentum(home_team, all_matches, match_date)
        for k, v in home_momentum.items():
            features[f'home_{k}'] = v
        
        away_momentum = self.compute_momentum(away_team, all_matches, match_date)
        for k, v in away_momentum.items():
            features[f'away_{k}'] = v
        
        features['momentum_diff'] = features['home_momentum_points'] - features['away_momentum_points']
        
        home_venue_form = self.compute_home_away_form(home_team, all_matches, match_date, is_home=True)
        for k, v in home_venue_form.items():
            features[f'home_{k}'] = v
        
        away_venue_form = self.compute_home_away_form(away_team, all_matches, match_date, is_home=False)
        for k, v in away_venue_form.items():
            features[f'away_{k}'] = v
        
        features['venue_ppg_diff'] = features['home_venue_form_ppg'] - features['away_venue_form_ppg']
        
        home_fatigue = self.compute_fatigue(home_team, all_matches, match_date)
        for k, v in home_fatigue.items():
            features[f'home_{k}'] = v
        
        away_fatigue = self.compute_fatigue(away_team, all_matches, match_date)
        for k, v in away_fatigue.items():
            features[f'away_{k}'] = v
        
        features['fatigue_diff'] = features['home_fatigue_matches'] - features['away_fatigue_matches']
        
        home_sos = self.compute_strength_of_schedule(home_team, all_matches, match_date)
        for k, v in home_sos.items():
            features[f'home_{k}'] = v
        
        away_sos = self.compute_strength_of_schedule(away_team, all_matches, match_date)
        for k, v in away_sos.items():
            features[f'away_{k}'] = v
        
        features['sos_diff'] = features['home_sos_avg_position'] - features['away_sos_avg_position']
        
        home_patterns = self.compute_scoring_patterns(home_team, all_matches, match_date)
        for k, v in home_patterns.items():
            features[f'home_{k}'] = v
        
        away_patterns = self.compute_scoring_patterns(away_team, all_matches, match_date)
        for k, v in away_patterns.items():
            features[f'away_{k}'] = v
        
        home_corner_form = self.compute_corner_form(home_team, all_matches, match_date)
        for k, v in home_corner_form.items():
            features[f'home_{k}'] = v

        away_corner_form = self.compute_corner_form(away_team, all_matches, match_date)
        for k, v in away_corner_form.items():
            features[f'away_{k}'] = v

        features['corner_form_avg_total'] = (
            features.get('home_corner_form_avg_for', 0) +
            features.get('away_corner_form_avg_for', 0)
        )

        home_card_form = self.compute_card_form(home_team, all_matches, match_date)
        for k, v in home_card_form.items():
            features[f'home_{k}'] = v

        away_card_form = self.compute_card_form(away_team, all_matches, match_date)
        for k, v in away_card_form.items():
            features[f'away_{k}'] = v

        features['card_form_avg_total'] = (
            features.get('home_card_form_avg', 0) +
            features.get('away_card_form_avg', 0)
        )

        home_stats = self.compute_detailed_stats_form(home_team, all_matches, match_date)
        for k, v in home_stats.items():
            features[f'home_{k}'] = v

        away_stats = self.compute_detailed_stats_form(away_team, all_matches, match_date)
        for k, v in away_stats.items():
            features[f'away_{k}'] = v

        features['stats_fouls_total'] = (
            features.get('home_stats_fouls_for', 0) + features.get('away_stats_fouls_for', 0)
        )
        features['stats_tackles_total'] = (
            features.get('home_stats_tackles_for', 0) + features.get('away_stats_tackles_for', 0)
        )
        features['stats_possession_diff'] = (
            features.get('home_stats_possession_for', 0) - features.get('away_stats_possession_for', 0)
        )
        features['stats_crosses_total'] = (
            features.get('home_stats_crosses_for', 0) + features.get('away_stats_crosses_for', 0)
        )
        features['stats_shots_in_box_total'] = (
            features.get('home_stats_shots_in_box_for', 0) + features.get('away_stats_shots_in_box_for', 0)
        )
        features['stats_clearances_total'] = (
            features.get('home_stats_clearances_for', 0) + features.get('away_stats_clearances_for', 0)
        )
        features['stats_final_third_entries_total'] = (
            features.get('home_stats_final_third_entries_for', 0) +
            features.get('away_stats_final_third_entries_for', 0)
        )

        if elo_table and match.get('event_id') in elo_table:
            home_elo, away_elo = elo_table[match['event_id']]
        else:
            home_elo, away_elo = 1500, 1500

        features['home_elo'] = home_elo
        features['away_elo'] = away_elo
        features['elo_diff'] = round(home_elo - away_elo, 1)

        home_wform = self.compute_weighted_form(home_team, all_matches, match_date)
        for k, v in home_wform.items():
            features[f'home_{k}'] = v

        away_wform = self.compute_weighted_form(away_team, all_matches, match_date)
        for k, v in away_wform.items():
            features[f'away_{k}'] = v

        features['wform_ppg_diff'] = features['home_wform_ppg'] - features['away_wform_ppg']
        features['wform_xg_diff'] = features['home_wform_xg_diff'] - features['away_wform_xg_diff']

        if player_stats:
            home_player_feats = self.compute_player_features(home_team, player_stats, match_date)
            for k, v in home_player_feats.items():
                features[f'home_{k}'] = v
            
            away_player_feats = self.compute_player_features(away_team, player_stats, match_date)
            for k, v in away_player_feats.items():
                features[f'away_{k}'] = v
            
            features['player_rating_diff'] = features.get('home_avg_player_rating', 6.5) - features.get('away_avg_player_rating', 6.5)
        else:
            for side in ['home', 'away']:
                features[f'{side}_avg_player_rating'] = 6.5
                features[f'{side}_top_scorer_goals'] = 0
                features[f'{side}_total_team_goals'] = 0
                features[f'{side}_total_team_assists'] = 0
                features[f'{side}_avg_minutes_starters'] = 90
                features[f'{side}_squad_avg_age'] = 26
            features['player_rating_diff'] = 0
        
        odds_home = match.get('odds_home_win')
        odds_draw = match.get('odds_draw')
        odds_away = match.get('odds_away_win')

        if odds_home and odds_draw and odds_away:
            features['odds_home_win'] = odds_home
            features['odds_draw'] = odds_draw
            features['odds_away_win'] = odds_away
            features['odds_home_prob'] = round(1 / odds_home, 4)
            features['odds_draw_prob'] = round(1 / odds_draw, 4)
            features['odds_away_prob'] = round(1 / odds_away, 4)
            features['odds_overround'] = round(1/odds_home + 1/odds_draw + 1/odds_away, 4)
        else:
            features['odds_home_win'] = 0
            features['odds_draw'] = 0
            features['odds_away_win'] = 0
            features['odds_home_prob'] = 0
            features['odds_draw_prob'] = 0
            features['odds_away_prob'] = 0
            features['odds_overround'] = 0

        odds_over = match.get('odds_over_2_5')
        odds_under = match.get('odds_under_2_5')
        if odds_over and odds_under:
            features['odds_over_2_5'] = odds_over
            features['odds_under_2_5'] = odds_under
            features['odds_over_2_5_prob'] = round(1 / odds_over, 4)
        else:
            features['odds_over_2_5'] = 0
            features['odds_under_2_5'] = 0
            features['odds_over_2_5_prob'] = 0

        odds_btts_yes = match.get('odds_btts_yes')
        odds_btts_no = match.get('odds_btts_no')
        if odds_btts_yes and odds_btts_no:
            features['odds_btts_yes'] = odds_btts_yes
            features['odds_btts_no'] = odds_btts_no
            features['odds_btts_prob'] = round(1 / odds_btts_yes, 4)
        else:
            features['odds_btts_yes'] = 0
            features['odds_btts_no'] = 0
            features['odds_btts_prob'] = 0

        home_score = match.get('home_score') or 0
        away_score = match.get('away_score') or 0
        
        features['label_home_goals'] = home_score
        features['label_away_goals'] = away_score
        features['label_total_goals'] = home_score + away_score
        
        if home_score > away_score:
            features['label_result'] = 'H'
            features['label_result_int'] = 0
        elif home_score < away_score:
            features['label_result'] = 'A'
            features['label_result_int'] = 2
        else:
            features['label_result'] = 'D'
            features['label_result_int'] = 1
        
        features['label_btts'] = 1 if home_score > 0 and away_score > 0 else 0
        features['label_over_2_5'] = 1 if (home_score + away_score) > 2.5 else 0
        features['label_over_1_5'] = 1 if (home_score + away_score) > 1.5 else 0

        home_corners = match.get('home_cornerkicks')
        away_corners = match.get('away_cornerkicks')
        if home_corners is not None and away_corners is not None:
            total_corners = int(home_corners) + int(away_corners)
            features['label_total_corners'] = total_corners
            features['label_corners_over_8_5'] = 1 if total_corners > 8 else 0
            features['label_corners_over_10_5'] = 1 if total_corners > 10 else 0
        else:
            features['label_total_corners'] = None
            features['label_corners_over_8_5'] = None
            features['label_corners_over_10_5'] = None

        home_yellows = match.get('home_yellow_cards_calc') or match.get('home_yellowcards')
        away_yellows = match.get('away_yellow_cards_calc') or match.get('away_yellowcards')
        if home_yellows is not None and away_yellows is not None:
            total_cards = int(home_yellows) + int(away_yellows)
            features['label_total_cards'] = total_cards
            features['label_cards_over_3_5'] = 1 if total_cards > 3 else 0
            features['label_cards_over_4_5'] = 1 if total_cards > 4 else 0
        else:
            features['label_total_cards'] = None
            features['label_cards_over_3_5'] = None
            features['label_cards_over_4_5'] = None

        return features
    
    def generate_dataset(self, matches_data, min_round=5):
        """Generate ML dataset from matches (skips first N rounds - no history)"""
        sorted_matches = sorted(matches_data, key=lambda x: (x.get('date') or '', x.get('round') or 0))

        elo_table = self._compute_elo_table(sorted_matches)

        dataset = []
        for match in sorted_matches:
            if match.get('round', 0) and match.get('round') < min_round:
                continue
            features = self.generate_match_features(match, sorted_matches, elo_table=elo_table)
            dataset.append(features)

        return dataset
