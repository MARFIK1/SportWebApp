import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import regenerate_all_features


class RegenerationDiscoveryTests(unittest.TestCase):
    def test_keeps_same_competition_name_for_different_countries(self):
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary)
            (data_dir / "league" / "austria" / "bundesliga" / "raw").mkdir(parents=True)
            (data_dir / "league" / "germany" / "bundesliga" / "raw").mkdir(parents=True)

            with patch.object(regenerate_all_features, "DEFAULT_DATA_DIR", str(data_dir)):
                competitions = regenerate_all_features.discover_competitions("league")

            self.assertEqual(
                competitions,
                [("austria", "bundesliga"), ("germany", "bundesliga")],
            )


if __name__ == "__main__":
    unittest.main()
