import copy
import unittest
from unittest.mock import patch

import predict_today

from predict_today import (
    _report_has_refreshable_odds_variants,
    _report_match_prediction_locked,
    refresh_report_odds_variants,
    update_report_with_results,
)

REPORT_DATE = '2999-01-01'
NOW = 1000


def _saved_prediction_fields(prediction='HOME'):
    consensus = {
        'prediction': prediction,
        'agreement': '2/2',
        'agreement_pct': 100,
        'avg_probabilities': {'HOME': 61, 'DRAW': 24, 'AWAY': 15},
    }
    return {
        'predictions': {'model_x': {'prediction': prediction}},
        'consensus': consensus,
        'default_prediction_variant': 'without_odds',
        'market_predictions': {
            'btts': {'consensus': {'prediction': 'YES'}},
        },
        'prediction_variants': {
            'without_odds': {
                'predictions': {'model_x': {'prediction': prediction}},
                'consensus': dict(consensus),
                'odds_used': False,
                'artifact': {'schema_version': 1, 'artifact_id': 'model-a', 'variant': 'without_odds'},
                'model_context_by_target': {'result': 'baseline'},
                'lineup_model_used': False,
            },
            'with_odds': {
                'predictions': {},
                'consensus': {'prediction': prediction},
                'odds_used': True,
                'source_odds': {'odds_home_win': 2.0, 'odds_draw': 3.4, 'odds_away_win': 3.9},
            },
        },
    }


def _report_entry(event_id, status, start_timestamp, **extra):
    entry = {
        'event_id': event_id,
        'league': 'england/premier_league',
        'comp_type': 'league',
        'home_team': f'Home{event_id}',
        'away_team': f'Away{event_id}',
        'status': status,
        'start_timestamp': start_timestamp,
    }
    entry.update(_saved_prediction_fields())
    entry.update(extra)
    return entry


def _report(matches):
    return {
        'date': REPORT_DATE,
        'status': 'unfinished',
        'summary': {},
        'matches': matches,
    }


def _source_match(event_id, status, start_timestamp, **extra):
    match = {
        'event_id': event_id,
        'country': 'england',
        'league': 'premier_league',
        'comp_type': 'league',
        'home': f'Home{event_id}',
        'away': f'Away{event_id}',
        'date': REPORT_DATE,
        'status': status,
        'start_timestamp': start_timestamp,
    }
    match.update(extra)
    return match


def _fresh_result(source_match, prediction='AWAY'):
    consensus = {
        'prediction': prediction,
        'agreement': '2/2',
        'agreement_pct': 100,
        'avg_probabilities': {'HOME': 10, 'DRAW': 20, 'AWAY': 70},
    }
    return {
        'match': source_match,
        'default_prediction_variant': 'without_odds',
        'predictions': {'consensus': consensus, 'model_x': {'prediction': prediction}},
        'market_predictions': {},
        'prediction_variants': {
            'without_odds': {
                'predictions': {'consensus': dict(consensus)},
                'market_predictions': {},
                'odds_used': False,
                'artifact': {'schema_version': 1, 'artifact_id': 'model-new', 'variant': 'without_odds'},
                'model_context_by_target': {'result': 'confirmed_lineup'},
                'lineup_model_used': True,
            },
        },
    }


def _run_update(report, results, now_timestamp=NOW):
    with (
        patch.object(predict_today, '_build_canonical_raw_event_index', return_value={}),
        patch.object(predict_today, '_report_match_included_in_daily', return_value=True),
    ):
        return update_report_with_results(report, results, now_timestamp=now_timestamp)


class PredictionLockTests(unittest.TestCase):
    def test_started_statuses_lock_prediction(self):
        for status in ('inprogress', 'finished', 'unknown'):
            self.assertTrue(_report_match_prediction_locked(
                {'status': status}, None, REPORT_DATE, NOW,
            ))

    def test_source_status_locks_even_when_entry_is_upcoming(self):
        self.assertTrue(_report_match_prediction_locked(
            {'status': 'upcoming', 'start_timestamp': 1100},
            {'status': 'inprogress', 'start_timestamp': 1100},
            REPORT_DATE,
            NOW,
        ))

    def test_past_kickoff_locks_despite_upcoming_status(self):
        self.assertTrue(_report_match_prediction_locked(
            {'status': 'upcoming', 'start_timestamp': 900},
            {'status': 'upcoming', 'start_timestamp': 900},
            REPORT_DATE,
            NOW,
        ))

    def test_future_kickoff_with_upcoming_status_is_unlocked(self):
        self.assertFalse(_report_match_prediction_locked(
            {'status': 'upcoming', 'start_timestamp': 1100},
            {'status': 'upcoming', 'start_timestamp': 1100},
            REPORT_DATE,
            NOW,
        ))


class UpdateReportImmutabilityTests(unittest.TestCase):
    def test_finished_rerun_updates_results_but_keeps_prediction(self):
        entry = _report_entry(1, 'upcoming', 900)
        saved = copy.deepcopy(_saved_prediction_fields())
        report = _report([entry])

        source = _source_match(
            1, 'finished', 900,
            result='H',
            score='2-1',
            total_cards=5,
            total_corners=9,
            referee_name='Ref Eree',
        )
        _run_update(report, [_fresh_result(source)])

        self.assertEqual(entry['status'], 'finished')
        self.assertEqual(entry['actual_result'], 'HOME')
        self.assertEqual(entry['actual_score'], '2-1')
        self.assertEqual(entry['actual_cards'], 5)
        self.assertEqual(entry['actual_corners'], 9)
        self.assertEqual(entry['referee_name'], 'Ref Eree')

        self.assertEqual(entry['consensus']['prediction'], 'HOME')
        self.assertEqual(
            entry['consensus']['avg_probabilities'],
            saved['consensus']['avg_probabilities'],
        )
        self.assertEqual(entry['default_prediction_variant'], 'without_odds')
        self.assertEqual(entry['market_predictions'], saved['market_predictions'])
        without_odds = entry['prediction_variants']['without_odds']
        self.assertEqual(without_odds['artifact']['artifact_id'], 'model-a')
        self.assertEqual(without_odds['model_context_by_target'], {'result': 'baseline'})
        self.assertFalse(without_odds['lineup_model_used'])
        self.assertEqual(
            entry['prediction_variants']['with_odds']['source_odds'],
            saved['prediction_variants']['with_odds']['source_odds'],
        )

        self.assertTrue(entry['consensus']['correct'])
        self.assertTrue(entry['predictions']['model_x']['correct'])
        self.assertTrue(without_odds['consensus']['correct'])

    def test_inprogress_match_keeps_prekickoff_prediction(self):
        entry = _report_entry(2, 'inprogress', 900)
        original_predictions = entry['predictions']
        original_consensus = entry['consensus']
        report = _report([entry])

        source = _source_match(2, 'inprogress', 900)
        _run_update(report, [_fresh_result(source)])

        self.assertIs(entry['predictions'], original_predictions)
        self.assertIs(entry['consensus'], original_consensus)
        self.assertEqual(entry['consensus']['prediction'], 'HOME')
        self.assertEqual(entry['status'], 'inprogress')

    def test_stale_upcoming_status_with_past_kickoff_keeps_prediction(self):
        entry = _report_entry(3, 'upcoming', 900)
        original_predictions = entry['predictions']
        report = _report([entry])

        source = _source_match(3, 'upcoming', 900)
        _run_update(report, [_fresh_result(source)])

        self.assertIs(entry['predictions'], original_predictions)
        self.assertEqual(entry['consensus']['prediction'], 'HOME')
        self.assertEqual(
            entry['prediction_variants']['without_odds']['artifact']['artifact_id'],
            'model-a',
        )

    def test_prekickoff_match_still_gets_refreshed_prediction(self):
        entry = _report_entry(4, 'upcoming', 1100)
        report = _report([entry])

        source = _source_match(4, 'upcoming', 1100)
        _run_update(report, [_fresh_result(source)])

        self.assertEqual(entry['consensus']['prediction'], 'AWAY')
        self.assertEqual(
            entry['prediction_variants']['without_odds']['artifact']['artifact_id'],
            'model-new',
        )


BASE_ODDS = {'odds_home_win': 2.1, 'odds_draw': 3.3, 'odds_away_win': 3.6}


class OddsVariantKickoffGuardTests(unittest.TestCase):
    @staticmethod
    def _entry_without_with_odds(event_id, status, start_timestamp):
        entry = _report_entry(event_id, status, start_timestamp)
        entry['prediction_variants'].pop('with_odds')
        return entry

    def test_with_odds_variant_is_not_created_after_kickoff(self):
        finished = self._entry_without_with_odds(1, 'finished', 800)
        inprogress = self._entry_without_with_odds(2, 'inprogress', 900)
        stale_upcoming = self._entry_without_with_odds(3, 'upcoming', 950)
        future = self._entry_without_with_odds(4, 'upcoming', 1100)
        report = _report([finished, inprogress, stale_upcoming, future])

        sources = [
            _source_match(1, 'finished', 800, **BASE_ODDS),
            _source_match(2, 'inprogress', 900, **BASE_ODDS),
            _source_match(3, 'upcoming', 950, **BASE_ODDS),
            _source_match(4, 'upcoming', 1100, **BASE_ODDS),
        ]
        variant_payload = {
            'predictions': {'consensus': {'prediction': 'HOME'}},
            'market_predictions': {},
            'odds_used': True,
        }

        with patch.object(
            predict_today,
            '_predict_variant_for_matches',
            return_value={'event:4': variant_payload},
        ) as predict_variant:
            updated = refresh_report_odds_variants(
                report,
                sources,
                predictor=object(),
                now_timestamp=NOW,
            )

        self.assertEqual(updated, 1)
        predict_variant.assert_called_once()
        self.assertEqual(
            [m['event_id'] for m in predict_variant.call_args.args[0]],
            [4],
        )
        for entry in (finished, inprogress, stale_upcoming):
            self.assertNotIn('with_odds', entry['prediction_variants'])
        with_odds = future['prediction_variants']['with_odds']
        self.assertTrue(with_odds['odds_used'])
        self.assertEqual(with_odds['source_odds'], BASE_ODDS)

    def test_existing_with_odds_variant_is_not_recomputed_after_kickoff(self):
        entry = _report_entry(5, 'finished', 800)
        original_variant = entry['prediction_variants']['with_odds']
        report = _report([entry])
        changed_odds = {'odds_home_win': 5.0, 'odds_draw': 5.0, 'odds_away_win': 5.0}
        sources = [_source_match(5, 'finished', 800, **changed_odds)]

        with patch.object(predict_today, '_predict_variant_for_matches') as predict_variant:
            updated = refresh_report_odds_variants(
                report,
                sources,
                predictor=object(),
                refresh_existing=True,
                now_timestamp=NOW,
            )

        self.assertEqual(updated, 0)
        predict_variant.assert_not_called()
        self.assertIs(entry['prediction_variants']['with_odds'], original_variant)

    def test_refreshable_gate_ignores_started_matches(self):
        started = self._entry_without_with_odds(6, 'upcoming', 900)
        report = _report([started])
        sources = [_source_match(6, 'upcoming', 900, **BASE_ODDS)]

        self.assertFalse(_report_has_refreshable_odds_variants(
            report,
            sources,
            now_timestamp=NOW,
        ))

        future = self._entry_without_with_odds(7, 'upcoming', 1100)
        report = _report([future])
        sources = [_source_match(7, 'upcoming', 1100, **BASE_ODDS)]

        self.assertTrue(_report_has_refreshable_odds_variants(
            report,
            sources,
            now_timestamp=NOW,
        ))


if __name__ == '__main__':
    unittest.main()
