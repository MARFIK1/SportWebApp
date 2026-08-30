import json
import tempfile
import unittest
from pathlib import Path

import regenerate_all_features
from sofascore.dataset_builder import DATASET_BUILDER_VERSION


class FeatureCacheFingerprintTests(unittest.TestCase):
    def _fixture(self, temporary):
        base = Path(temporary) / "league" / "england" / "premier_league"
        raw_dir = base / "raw"
        features_dir = base / "features"
        raw_dir.mkdir(parents=True)
        features_dir.mkdir()
        raw_file = raw_dir / "premier_league_25_26.json"
        raw_file.write_text('{"matches": []}', encoding="utf-8")
        return base, raw_dir, features_dir, raw_file

    def test_sidecar_change_changes_source_fingerprint(self):
        with tempfile.TemporaryDirectory() as temporary:
            base, _, _, raw_file = self._fixture(temporary)
            code = {"digest": "fixed-code", "files": 3}
            original = regenerate_all_features.build_season_source_fingerprint(
                base,
                [raw_file],
                code_fingerprint=code,
            )

            lineups_dir = base / "lineups"
            lineups_dir.mkdir()
            (lineups_dir / "lineups_premier_league_25_26.json").write_text(
                '{"lineups": [{"event_id": 1}]}',
                encoding="utf-8",
            )
            updated = regenerate_all_features.build_season_source_fingerprint(
                base,
                [raw_file],
                code_fingerprint=code,
            )

            self.assertNotEqual(original["digest"], updated["digest"])
            self.assertEqual(updated["lineup_files"], 1)

    def test_cache_requires_matching_source_fingerprint(self):
        with tempfile.TemporaryDirectory() as temporary:
            base, raw_dir, features_dir, raw_file = self._fixture(temporary)
            fingerprint = regenerate_all_features.build_season_source_fingerprint(
                base,
                [raw_file],
                code_fingerprint={"digest": "fixed-code", "files": 3},
            )
            feature_file = features_dir / "features_premier_league_25_26.json"
            feature_file.write_text(
                json.dumps({
                    "metadata": {
                        "dataset_builder_version": DATASET_BUILDER_VERSION,
                        "source_fingerprint": fingerprint,
                    },
                    "samples": [],
                }),
                encoding="utf-8",
            )

            self.assertFalse(regenerate_all_features.is_season_stale(
                str(raw_dir),
                str(features_dir),
                raw_file.name,
                "premier_league",
                "25_26",
                expected_source_fingerprint=fingerprint,
            ))

            changed = dict(fingerprint, digest="different")
            self.assertTrue(regenerate_all_features.is_season_stale(
                str(raw_dir),
                str(features_dir),
                raw_file.name,
                "premier_league",
                "25_26",
                expected_source_fingerprint=changed,
            ))

    def test_legacy_cache_without_fingerprint_is_stale(self):
        with tempfile.TemporaryDirectory() as temporary:
            base, raw_dir, features_dir, raw_file = self._fixture(temporary)
            feature_file = features_dir / "features_premier_league_25_26.json"
            feature_file.write_text(
                json.dumps({
                    "metadata": {
                        "dataset_builder_version": DATASET_BUILDER_VERSION,
                    },
                    "samples": [],
                }),
                encoding="utf-8",
            )
            expected = regenerate_all_features.build_season_source_fingerprint(
                base,
                [raw_file],
                code_fingerprint={"digest": "fixed-code", "files": 3},
            )

            self.assertTrue(regenerate_all_features.is_season_stale(
                str(raw_dir),
                str(features_dir),
                raw_file.name,
                "premier_league",
                "25_26",
                expected_source_fingerprint=expected,
            ))


if __name__ == "__main__":
    unittest.main()
