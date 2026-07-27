import json
import tempfile
import unittest
from pathlib import Path

import predict_today
from sofascore.incidents import normalize_match_incidents


class MatchIncidentNormalizationTests(unittest.TestCase):
    def test_normalizes_and_orders_supported_incidents(self):
        incidents = [
            {
                "id": 4,
                "incidentType": "substitution",
                "time": 72,
                "isHome": False,
                "playerIn": {"id": 21, "name": "Player In"},
                "playerOut": {"id": 9, "name": "Player Out"},
            },
            {
                "id": 2,
                "incidentType": "card",
                "incidentClass": "yellow",
                "time": 31,
                "isHome": False,
                "player": {"id": 8, "name": "Booked Player"},
                "reason": "Foul",
            },
            {
                "id": 1,
                "incidentType": "period",
                "time": 45,
                "text": "HT",
            },
            {
                "id": 3,
                "incidentType": "goal",
                "incidentClass": "regular",
                "time": 61,
                "addedTime": 2,
                "isHome": True,
                "homeScore": 1,
                "awayScore": 0,
                "player": {"id": 10, "name": "Goal Scorer", "shortName": "G. Scorer"},
                "assist1": {"id": 11, "name": "Assistant"},
            },
        ]

        result = normalize_match_incidents(incidents)

        self.assertEqual([event["type"] for event in result], ["card", "period", "goal", "substitution"])
        self.assertEqual(result[2]["minute"], 61)
        self.assertEqual(result[2]["added_time"], 2)
        self.assertEqual(result[2]["player"]["name"], "Goal Scorer")
        self.assertEqual(result[2]["assist"]["name"], "Assistant")
        self.assertEqual(result[3]["player_in"]["name"], "Player In")
        self.assertEqual(result[3]["player_out"]["name"], "Player Out")

    def test_preserves_unknown_incidents_and_missing_home_side(self):
        result = normalize_match_incidents([
            {
                "incidentType": "coolingBreak",
                "time": 30,
                "description": "Cooling break",
            }
        ])

        self.assertEqual(result[0]["type"], "unknown")
        self.assertEqual(result[0]["source_type"], "coolingBreak")
        self.assertEqual(result[0]["text"], "Cooling break")
        self.assertNotIn("is_home", result[0])

    def test_does_not_assign_away_side_when_is_home_is_null(self):
        result = normalize_match_incidents([
            {"incidentType": "period", "time": 45, "isHome": None}
        ])

        self.assertNotIn("is_home", result[0])

    def test_normalizes_var_shootout_and_injury_time_types(self):
        result = normalize_match_incidents([
            {"incidentType": "varDecision", "time": 15},
            {"incidentType": "penaltyShootout", "time": 120},
            {"incidentType": "injuryTime", "time": 90, "length": 5},
        ])

        self.assertEqual(
            [event["type"] for event in result],
            ["var", "injury_time", "shootout"],
        )
        self.assertEqual(result[1]["length"], 5)


class MatchEventSidecarTests(unittest.TestCase):
    def test_save_report_separates_events_and_load_restores_them(self):
        report = {
            "date": "2026-07-25",
            "status": "finished",
            "updated_at": "2026-07-26 00:10:00",
            "matches": [
                {
                    "event_id": 16316943,
                    "home_team": "Jagiellonia Bialystok",
                    "away_team": "MKS Korona Kielce",
                    "status": "finished",
                    "match_events": [{"id": "1", "type": "goal", "source_type": "goal", "minute": 89}],
                    "match_events_collected": True,
                }
            ],
        }

        original_reports_dir = predict_today.REPORTS_DIR
        try:
            with tempfile.TemporaryDirectory() as temp_dir:
                predict_today.REPORTS_DIR = Path(temp_dir)
                report_path = predict_today.save_report(report, report["date"])
                stored_report = json.loads(report_path.read_text(encoding="utf-8"))
                sidecar_path = report_path.parent / predict_today.MATCH_EVENTS_FILENAME
                sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))

                self.assertNotIn("match_events", stored_report["matches"][0])
                self.assertEqual(sidecar["schema_version"], 1)
                self.assertEqual(
                    sidecar["matches"]["16316943"]["events"][0]["minute"],
                    89,
                )

                loaded = predict_today.load_existing_report(report["date"])
                self.assertEqual(loaded["matches"][0]["match_events"][0]["type"], "goal")
        finally:
            predict_today.REPORTS_DIR = original_reports_dir


if __name__ == "__main__":
    unittest.main()
