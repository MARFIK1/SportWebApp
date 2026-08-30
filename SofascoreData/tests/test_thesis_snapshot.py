import json
import tempfile
import unittest
from pathlib import Path

from sofascore.thesis_snapshot import (
    audit_snapshot_source,
    create_snapshot,
    load_snapshot_config,
)


class ThesisSnapshotTests(unittest.TestCase):
    def _config(self):
        return {
            "schema_version": 1,
            "snapshot_id": "test-snapshot",
            "analysis_start": "2026-04-01",
            "analysis_end": "2026-07-19",
            "data_cutoff": "2026-07-19",
            "required_dataset_builder_version": 5,
            "required_source_fingerprint_version": 1,
        }

    def _write_source(self, root: Path, builder_version=5):
        for report_date in ("2026-03-31", "2026-04-01", "2026-07-19", "2026-07-20"):
            report_dir = root / "reports" / report_date
            report_dir.mkdir(parents=True)
            (report_dir / "predictions_finished.json").write_text(
                json.dumps({"date": report_date, "matches": []}),
                encoding="utf-8",
            )

        feature_path = (
            root
            / "data"
            / "league"
            / "england"
            / "premier_league"
            / "features"
            / "features_all_seasons.json"
        )
        feature_path.parent.mkdir(parents=True)
        feature_path.write_text(
            json.dumps({
                "metadata": {
                    "dataset_builder_version": builder_version,
                    "source_fingerprint_schema_version": 1,
                    "source_fingerprint_complete": True,
                },
                "samples": [
                    {"event_id": 1, "date": "2026-03-31"},
                    {"event_id": 2, "date": "2026-07-19"},
                    {"event_id": 3, "date": "2026-07-20"},
                ],
            }),
            encoding="utf-8",
        )

    def test_audit_rejects_stale_feature_builder(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source"
            self._write_source(source, builder_version=4)

            audit = audit_snapshot_source(source, self._config())

            self.assertFalse(audit["valid"])
            self.assertIn("stale builder version", audit["issues"][0])

    def test_snapshot_filters_reports_and_future_feature_rows(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            output = root / "snapshot"
            self._write_source(source)

            manifest = create_snapshot(source, output, self._config(), root)

            report_dates = sorted(path.name for path in (output / "reports").iterdir())
            self.assertEqual(report_dates, ["2026-04-01", "2026-07-19"])
            feature_path = next((output / "data").rglob("features_all_seasons.json"))
            payload = json.loads(feature_path.read_text(encoding="utf-8"))
            self.assertEqual(
                [sample["event_id"] for sample in payload["samples"]],
                [1, 2],
            )
            self.assertEqual(payload["metadata"]["snapshot_removed_after_cutoff"], 1)
            self.assertEqual(manifest["dataset"]["feature_date_max"], "2026-07-19")
            self.assertEqual(manifest["source"]["name"], "source")
            self.assertNotIn("root", manifest["source"])
            self.assertNotIn("source_root", manifest["dataset"])
            self.assertNotIn(str(root), json.dumps(manifest))
            self.assertTrue((output / "snapshot_manifest.json").exists())
            self.assertTrue((output / "checksums.sha256").exists())

    def test_audit_warns_when_reports_start_after_analysis_window(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source"
            self._write_source(source)
            first_report = source / "reports" / "2026-04-01"
            for path in first_report.iterdir():
                path.unlink()
            first_report.rmdir()

            audit = audit_snapshot_source(source, self._config())

            self.assertTrue(audit["valid"])
            self.assertIn("first available report date", audit["warnings"][0])

    def test_audit_rejects_incomplete_source_fingerprints(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source"
            self._write_source(source)
            feature_path = next((source / "data").rglob("features_all_seasons.json"))
            payload = json.loads(feature_path.read_text(encoding="utf-8"))
            payload["metadata"]["source_fingerprint_complete"] = False
            feature_path.write_text(json.dumps(payload), encoding="utf-8")

            audit = audit_snapshot_source(source, self._config())

            self.assertFalse(audit["valid"])
            self.assertTrue(any(
                "incomplete source fingerprint" in issue
                for issue in audit["issues"]
            ))

    def test_config_rejects_analysis_after_cutoff(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "config.json"
            config = self._config()
            config["analysis_end"] = "2026-07-20"
            path.write_text(json.dumps(config), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "later than data cutoff"):
                load_snapshot_config(path)


if __name__ == "__main__":
    unittest.main()
