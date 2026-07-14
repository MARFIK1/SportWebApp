import json
import tempfile
import unittest
from pathlib import Path

from sofascore.data_layout import competition_features_path, discover_feature_competitions


class DataLayoutTests(unittest.TestCase):
    def _write_feature_file(self, root: Path, relative_dir: str) -> None:
        features_dir = root / relative_dir / "features"
        features_dir.mkdir(parents=True)
        (features_dir / "features_all_seasons.json").write_text(
            json.dumps({"samples": []}),
            encoding="utf-8",
        )

    def test_discovers_flat_international_competitions_with_registry_country(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            self._write_feature_file(data_dir, "international/world_cup")
            registry = {"international": {"fifa": {"world_cup": {}}}}

            discovered = discover_feature_competitions(
                data_dir,
                ["international"],
                registry,
            )

            self.assertEqual(discovered, {"international": {"fifa": ["world_cup"]}})

    def test_discovers_nested_league_competitions(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            self._write_feature_file(data_dir, "league/england/premier_league")

            discovered = discover_feature_competitions(data_dir, ["league"])

            self.assertEqual(
                discovered,
                {"league": {"england": ["premier_league"]}},
            )

    def test_resolves_flat_and_nested_feature_paths(self):
        data_dir = Path("data")

        self.assertEqual(
            competition_features_path(data_dir, "international", "fifa", "world_cup"),
            data_dir / "international" / "world_cup" / "features",
        )
        self.assertEqual(
            competition_features_path(data_dir, "league", "england", "premier_league"),
            data_dir / "league" / "england" / "premier_league" / "features",
        )


if __name__ == "__main__":
    unittest.main()
