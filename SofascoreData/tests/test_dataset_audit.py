import json
import tempfile
import unittest
from pathlib import Path

from sofascore.dataset_audit import audit_feature_datasets, read_json_metadata


class DatasetAuditTests(unittest.TestCase):
    def _write_dataset(self, root: Path, version):
        competition = root / "league" / "poland" / "test_league"
        (competition / "raw").mkdir(parents=True)
        features = competition / "features"
        features.mkdir(parents=True)
        path = features / "features_all_seasons.json"
        path.write_text(json.dumps({
            "metadata": {
                "dataset_builder_version": version,
                "total_samples": 3,
            },
            "samples": [{"event_id": 1}, {"event_id": 2}, {"event_id": 3}],
        }), encoding="utf-8")
        return path

    def test_reads_metadata_without_loading_samples_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self._write_dataset(Path(temporary), 2)

            metadata = read_json_metadata(path)

            self.assertEqual(metadata["dataset_builder_version"], 2)
            self.assertEqual(metadata["total_samples"], 3)

    def test_accepts_expected_builder_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._write_dataset(root, 2)

            audit = audit_feature_datasets(root, 2, ["league"])

            self.assertTrue(audit["valid"])
            self.assertEqual(audit["dataset_count"], 1)
            self.assertEqual(audit["total_samples"], 3)

    def test_rejects_missing_combined_dataset(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "league" / "poland" / "missing" / "raw").mkdir(parents=True)

            audit = audit_feature_datasets(root, 2, ["league"])

            self.assertFalse(audit["valid"])
            self.assertEqual(audit["issues"][0]["status"], "missing_combined_dataset")

    def test_rejects_mixed_builder_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._write_dataset(root, "mixed")

            audit = audit_feature_datasets(root, 2, ["league"])

            self.assertFalse(audit["valid"])
            self.assertEqual(audit["issues"][0]["status"], "stale")


if __name__ == "__main__":
    unittest.main()
