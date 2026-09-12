import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import pandas as pd

import predict_today
from backfill_snapshot_odds import enrich_sample_card_outcome, extract_card_outcome
from sofascore.card_settlement import (
    CARD_PROFILE_FIELD, LEGACY_CARD_PROFILE, PL_CARD_PROFILE, card_labels, settle_match_cards,
)
from sofascore.features import MLFeatureGenerator
from sofascore.incidents import normalize_match_incidents
from sofascore.predictor import UniversalPredictor
from sofascore.model_promotion import _copy_target
from sofascore.training_report import build_training_comparison


def card(identity, kind='yellow', player=1, minute=20, **extra):
    return {'id': str(identity), 'type': 'card', 'source_class': kind,
            'player': {'id': player}, 'is_home': True, 'minute': minute,
            'added_time': None, 'period': '1H' if minute < 46 else '2H',
            'on_pitch': True, **extra}


def match(*events, **extra):
    return {'event_id': 100, 'home_team': 'A', 'away_team': 'B', 'date': '2026-04-01',
            'home_score': 1, 'away_score': 0, 'status': 'finished',
            'match_events': list(events), 'match_events_collected': True, **extra}


class CardSettlementTests(unittest.TestCase):
    def test_yellow_direct_red_and_yellow_then_direct_red(self):
        for events, expected in [([card(1)], 1), ([card(1, 'red')], 2),
                                 ([card(1), card(2, 'red', minute=50)], 3)]:
            with self.subTest(expected=expected):
                self.assertEqual(settle_match_cards(match(*events))['total'], expected)

    def test_second_yellow_and_duplicate_feed_representations_count_three(self):
        events = [card(1), card(2, 'yellowred', minute=70),
                  card(3, 'yellow', minute=70), card(4, 'red', minute=70)]
        self.assertEqual(settle_match_cards(match(*reversed(events)))['total'], 3)
        self.assertEqual(settle_match_cards(match(card(1), card(2, 'secondYellow', minute=70)))['total'], 3)

    def test_aggregate_yellows_are_not_a_pl_target(self):
        source = {'home_yellow_cards_calc': 2, 'away_yellowcards': 1}
        self.assertIsNone(settle_match_cards(source)['total'])
        self.assertEqual(settle_match_cards(source, LEGACY_CARD_PROFILE)['total'], 3)

    def test_missing_and_confirmed_zero_are_distinct(self):
        self.assertEqual(settle_match_cards(match())['total'], 0)
        self.assertIsNone(settle_match_cards(match(match_events_collected=False))['total'])
        self.assertIsNone(settle_match_cards(match(home_yellowcards=1))['total'])
        self.assertIsNone(settle_match_cards(match(status='inprogress'))['total'])
        self.assertIsNone(card_labels(settle_match_cards({}))['label_cards_over_3_5'])

    def test_excludes_extra_time_post_match_staff_bench_and_rescinded(self):
        events = [card(1), card(2, 'red', player=2, minute=105, period='ET'),
                  card(3, player=3, is_post_match=True), card(4, player=4, is_coach=True),
                  card(5, player=5, is_bench=True), card(6, player=6, rescinded=True)]
        self.assertEqual(settle_match_cards(match(*events))['total'], 1)

    def test_stoppage_time_requires_clear_period(self):
        event = card(1, minute=90, added_time=6)
        self.assertEqual(settle_match_cards(match(event))['total'], 1)
        event['period'] = None
        self.assertIsNone(settle_match_cards(match(event))['total'])

    def test_ambiguous_sequence_is_not_clamped_into_a_valid_label(self):
        for events in ([card(1, 'yellowred')], [card(1), card(2, minute=30)],
                       [card(1, 'red'), card(2, minute=30)]):
            self.assertIsNone(settle_match_cards(match(*events))['total'])

    def test_exact_duplicate_is_ignored_conflicting_duplicate_is_unknown(self):
        event = card(1)
        self.assertEqual(settle_match_cards(match(event, copy.deepcopy(event)))['total'], 1)
        self.assertIsNone(settle_match_cards(match(event, card(1, 'red')))['total'])

    def test_lineup_and_substitution_eligibility(self):
        lineup = {'home': {'starters': [{'id': n} for n in range(1, 12)],
                           'substitutes': [{'id': 12}]}}
        substitution = {'type': 'substitution', 'is_home': True, 'minute': 60,
                        'player_in': {'id': 12}, 'player_out': {'id': 1}}
        events = [card(1, on_pitch=None), card(2, minute=70, on_pitch=None),
                  card(3, player=12, minute=70, on_pitch=None), substitution]
        self.assertEqual(settle_match_cards(match(*events, match_lineups=lineup))['total'], 2)
        self.assertIsNone(settle_match_cards(match(card(1, on_pitch=None)))['total'])
        self.assertIsNone(settle_match_cards(match(card(1, minute=60, on_pitch=None),
                                                 substitution, match_lineups=lineup))['total'])

    def test_normalizer_preserves_scope_flags_and_missing_added_time_is_zero(self):
        events = normalize_match_incidents([{'id': 1, 'incidentType': 'card',
            'incidentClass': 'yellow', 'isHome': True, 'time': 20,
            'player': {'id': 1, 'name': 'A'}, 'isOnPitch': True}])
        self.assertEqual(settle_match_cards(match(*events))['total'], 1)

    def test_invalid_payload_or_synthetic_identity_does_not_become_zero(self):
        self.assertFalse(predict_today._apply_match_incidents({}, [None]))
        events = normalize_match_incidents([{'incidentType': 'card', 'incidentClass': 'red',
            'isHome': True, 'time': 20, 'player': {'id': 1, 'name': 'A'}, 'isOnPitch': True}])
        self.assertIsNone(settle_match_cards(match(*events))['total'])

    def test_features_use_selected_profile_and_history_only(self):
        past = match(card(1, 'red'), home_yellow_cards_calc=0, away_yellow_cards_calc=0)
        current = match(card(2), card(3, 'yellowred', minute=70), date='2026-04-02')
        fg = MLFeatureGenerator()
        features = fg.generate_match_features(current, [past, current])
        self.assertEqual(features['label_total_cards'], 3)
        self.assertEqual(features[CARD_PROFILE_FIELD], PL_CARD_PROFILE)
        self.assertEqual(fg.compute_card_form('A', [past, current], '2026-04-02')['card_form_total'], 2)
        old = MLFeatureGenerator(card_settlement_profile=LEGACY_CARD_PROFILE)
        self.assertEqual(old.compute_card_form('A', [past], '2026-04-02')['card_form_total'], 0)

    def test_reports_keep_both_definitions_without_changing_predictions(self):
        raw = match(card(1, 'red'), home_yellow_cards_calc=0, away_yellow_cards_calc=0)
        source = predict_today._raw_match_to_match_data(raw, 'league', 'x', 'y')
        entry = {'market_predictions': {'total_cards': {'prediction': 0}}}
        before = copy.deepcopy(entry['market_predictions'])
        predict_today._apply_actual_fields_to_report_match(entry, source)
        self.assertEqual(entry['actual_cards'], 2)
        self.assertEqual(entry['actual_cards_profile'], PL_CARD_PROFILE)
        self.assertEqual(entry['actual_cards_by_profile'][LEGACY_CARD_PROFILE], 0)
        self.assertEqual(entry['market_predictions'], before)
        predict_today._apply_actual_fields_to_report_match(entry, {'status': 'postponed'})
        self.assertIsNone(entry['actual_cards_by_profile'])

    def test_backfill_requires_same_profile_even_with_overwrite(self):
        sample = {CARD_PROFILE_FIELD: PL_CARD_PROFILE, 'label_total_cards': None}
        self.assertEqual(enrich_sample_card_outcome(sample, {}), set())
        with self.assertRaisesRegex(ValueError, 'settlement profiles'):
            enrich_sample_card_outcome(sample, {'label_total_cards': 2}, overwrite=True)
        self.assertIsNone(sample['label_total_cards'])
        outcome = extract_card_outcome(None, match=match(card(1, 'red')), profile=PL_CARD_PROFILE)
        enrich_sample_card_outcome(sample, outcome)
        self.assertEqual(sample['label_total_cards'], 2)
        self.assertEqual(extract_card_outcome([], profile=PL_CARD_PROFILE), {})


class CardProfileContractTests(unittest.TestCase):
    def test_mixed_or_missing_profile_is_rejected(self):
        predictor = UniversalPredictor('.')
        for values in ([PL_CARD_PROFILE, LEGACY_CARD_PROFILE], [PL_CARD_PROFILE, None]):
            with self.assertRaises(ValueError):
                predictor._frame_card_profile(pd.DataFrame({CARD_PROFILE_FIELD: values}))
        self.assertEqual(predictor._frame_card_profile(pd.DataFrame({'x': [1]})), LEGACY_CARD_PROFILE)

    def test_inference_rejects_profile_mismatch_before_model_call(self):
        predictor = UniversalPredictor('.')
        model = Mock()
        predictor.models = {'total_cards': {'test': {'model': model}}}
        predictor.trained = True
        with self.assertRaisesRegex(ValueError, 'profile mismatch'):
            predictor.predict_match({CARD_PROFILE_FIELD: PL_CARD_PROFILE}, 'test', 'total_cards')
        model.predict.assert_not_called()
        with self.assertRaisesRegex(ValueError, 'profile mismatch'):
            predictor.predict_consensus_batch(pd.DataFrame({CARD_PROFILE_FIELD: [PL_CARD_PROFILE]}), 'total_cards')

    def test_profile_survives_model_save_load_without_training(self):
        predictor = UniversalPredictor('.')
        predictor.trained = True
        predictor.models = {'total_cards': {}}
        predictor.artifact_metadata['card_settlement_profiles'] = {'total_cards': PL_CARD_PROFILE}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'model.pkl'
            predictor.save_models(str(path))
            loaded = UniversalPredictor('.')
            loaded.load_models(str(path))
            self.assertEqual(loaded.get_card_settlement_profile('total_cards'), PL_CARD_PROFILE)

    def test_serialized_markets_keep_profile(self):
        bundle = predict_today._serialize_prediction_bundle({}, {'total_cards': {
            'consensus': {'prediction': 3, CARD_PROFILE_FIELD: PL_CARD_PROFILE}}}, None)
        self.assertEqual(bundle['market_predictions']['total_cards']['consensus'][CARD_PROFILE_FIELD], PL_CARD_PROFILE)

    def test_promotion_copies_target_profile(self):
        baseline, candidate = UniversalPredictor('.'), UniversalPredictor('.')
        candidate.models['total_cards'] = {}
        candidate.scalers['total_cards'] = None
        candidate.feature_columns_by_target['total_cards'] = ['home_card_form_avg']
        candidate.training_stats['total_cards'] = {}
        candidate.artifact_metadata['card_settlement_profiles'] = {'total_cards': PL_CARD_PROFILE}
        _copy_target(baseline, candidate, 'total_cards')
        self.assertEqual(baseline.get_card_settlement_profile('total_cards'), PL_CARD_PROFILE)

    def test_training_comparison_marks_incompatible_card_targets(self):
        report = build_training_comparison({'total_cards': {
            CARD_PROFILE_FIELD: PL_CARD_PROFILE, 'detailed_metrics': {}}},
            {'metrics_by_target': {'total_cards': {}}}, 'without_odds', {})
        self.assertFalse(report['targets']['total_cards']['card_settlement_comparable'])


if __name__ == '__main__':
    unittest.main()
