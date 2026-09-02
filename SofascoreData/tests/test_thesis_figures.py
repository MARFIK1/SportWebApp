import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from sofascore.thesis_figures import generate_thesis_figures


class ThesisFiguresTests(unittest.TestCase):
    @staticmethod
    def _write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

    def _write_results(self, root: Path) -> Path:
        results = root / "results"
        results.mkdir()
        evaluation_rows = []
        for variant, shift in (("without_odds", 0.0), ("with_odds", 0.02)):
            for target, score in (("result", 0.45), ("btts", 0.54)):
                evaluation_rows.append({
                    "variant": variant,
                    "target": target,
                    "task": "classification",
                    "feature_set": (
                        "odds_available" if variant == "with_odds" else "pre_match_safe"
                    ),
                    "gate_candidate": "Consensus Policy",
                    "gate_candidate_score": score + shift,
                    "gate_baseline": 0.30,
                    "brier_score": 0.48 - shift,
                    "log_loss": 0.68 - shift,
                    "ece": 0.03 - shift / 2,
                })
            evaluation_rows.append({
                "variant": variant,
                "target": "total_goals",
                "task": "regression",
                "feature_set": "pre_match_safe",
                "gate_candidate": "Random Forest",
                "gate_candidate_score": 1.30 - shift,
                "gate_baseline": 1.36,
            })
        self._write_csv(
            results / "evaluation_summary.csv",
            list(evaluation_rows[0]),
            evaluation_rows,
        )

        model_rows = [
            {"variant": variant, "target": "result", "model": model, "macro_f1": score}
            for variant, shift in (("without_odds", 0.0), ("with_odds", 0.02))
            for model, score in (("Random Forest", 0.43 + shift), ("Consensus Policy", 0.45 + shift))
        ]
        self._write_csv(results / "model_metrics.csv", list(model_rows[0]), model_rows)

        promotion_rows = [
            {"variant": variant, "target": target, "accepted": accepted, "fallback": not accepted}
            for variant in ("without_odds", "with_odds")
            for target, accepted in (("result", True), ("btts", False))
        ]
        self._write_csv(
            results / "promotion_summary.csv",
            list(promotion_rows[0]),
            promotion_rows,
        )

        confusion_rows = []
        for variant in ("without_odds", "with_odds"):
            for target, classes, matrix in (
                ("result", ("HOME", "DRAW", "AWAY"), ((8, 1, 1), (2, 6, 2), (1, 2, 7))),
                ("btts", ("NO", "YES"), ((8, 2), (3, 7))),
            ):
                for actual_index, actual in enumerate(classes):
                    for predicted_index, predicted in enumerate(classes):
                        confusion_rows.append({
                            "variant": variant,
                            "target": target,
                            "model": "Consensus Policy",
                            "actual_class": actual,
                            "predicted_class": predicted,
                            "count": matrix[actual_index][predicted_index],
                        })
        self._write_csv(
            results / "confusion_matrices.csv",
            list(confusion_rows[0]),
            confusion_rows,
        )
        (results / "results_manifest.json").write_text(json.dumps({
            "schema_version": 1,
            "data_cutoff": "2026-07-19",
            "test_start_date": "2026-04-01",
        }), encoding="utf-8")
        return results

    def test_generates_versioned_png_and_svg_figures_without_private_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            results = self._write_results(root)
            output = root / "figures"

            manifest = generate_thesis_figures(results, output)

            self.assertEqual(len(manifest["figures"]), 7)
            self.assertEqual(
                manifest["comparison_scope"]["odds_enabled_targets"],
                ["result", "btts"],
            )
            images = sorted([
                *output.glob("*.png"),
                *output.glob("*.svg"),
            ])
            self.assertEqual(len(images), 14)
            self.assertTrue(all(path.stat().st_size > 1000 for path in images))
            manifest_text = (output / "figures_manifest.json").read_text(encoding="utf-8")
            self.assertNotIn(str(root), manifest_text)

            for line in (output / "checksums.sha256").read_text(encoding="utf-8").splitlines():
                expected, filename = line.split("  ", 1)
                actual = hashlib.sha256((output / filename).read_bytes()).hexdigest()
                self.assertEqual(actual, expected)

    def test_rejects_missing_result_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.mkdir(exist_ok=True)
            with self.assertRaisesRegex(FileNotFoundError, "Missing thesis result inputs"):
                generate_thesis_figures(root, root / "figures")


if __name__ == "__main__":
    unittest.main()
