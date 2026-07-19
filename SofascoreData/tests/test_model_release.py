import json
import tempfile
import unittest
from pathlib import Path

from sofascore.model_release import (
    active_pointer_name,
    artifact_contract_from_manifest,
    atomic_write_json,
    build_active_pointer,
    file_sha256,
    finalize_artifact_manifest,
    resolve_active_artifact,
)


class ModelReleaseTests(unittest.TestCase):
    def test_artifact_identity_does_not_depend_on_output_path(self):
        base = {
            "version": 3,
            "created_at": "2026-07-17T10:00:00+00:00",
            "dataset_hash": "dataset",
            "code_hash": "code",
            "targets": ["result"],
        }
        first = finalize_artifact_manifest({**base, "artifact": "first.pkl"})
        second = finalize_artifact_manifest({**base, "artifact": "another.pkl"})

        self.assertEqual(first["artifact_id"], second["artifact_id"])
        self.assertTrue(first["artifact_id"].startswith("model-"))

    def test_contract_preserves_release_and_reproducibility_identity(self):
        manifest = finalize_artifact_manifest({
            "version": 3,
            "created_at": "2026-07-17T10:00:00+00:00",
            "dataset_hash": "dataset",
            "code_hash": "code",
            "targets": ["result"],
            "reproducibility": {"git_commit": "abc123"},
            "metadata": {
                "training": {"variant": "without_odds"},
                "release": {"release_id": "release-1"},
            },
        })

        contract = artifact_contract_from_manifest(manifest)

        self.assertEqual(contract["release_id"], "release-1")
        self.assertEqual(contract["variant"], "without_odds")
        self.assertEqual(contract["source_commit"], "abc123")

    def test_active_pointer_resolves_only_inside_models_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            models_dir = Path(temporary) / "models"
            artifact = models_dir / "releases" / "release-1" / "model.pkl"
            artifact.parent.mkdir(parents=True)
            artifact.write_bytes(b"model")
            manifest = finalize_artifact_manifest({
                "version": 3,
                "created_at": "2026-07-17T10:00:00+00:00",
                "targets": ["result"],
                "metadata": {"training": {"variant": "without_odds"}},
            })
            manifest["artifact_sha256"] = file_sha256(artifact)
            atomic_write_json(Path(f"{artifact}.manifest.json"), manifest)
            pointer = build_active_pointer(
                "without_odds",
                "release-1",
                artifact,
                manifest,
                models_dir,
            )
            atomic_write_json(models_dir / active_pointer_name("without_odds"), pointer)

            resolved = resolve_active_artifact(
                models_dir,
                "without_odds",
                "fallback.pkl",
            )
            self.assertEqual(resolved, artifact.resolve())

            malicious = {**pointer, "artifact": "../../outside.pkl"}
            (Path(temporary) / "outside.pkl").write_bytes(b"outside")
            atomic_write_json(models_dir / active_pointer_name("without_odds"), malicious)
            fallback = resolve_active_artifact(
                models_dir,
                "without_odds",
                "fallback.pkl",
            )
            self.assertEqual(fallback, models_dir / "fallback.pkl")

            atomic_write_json(models_dir / active_pointer_name("without_odds"), pointer)
            manifest_path = Path(f"{artifact}.manifest.json")
            atomic_write_json(manifest_path, {**manifest, "artifact_id": "another-model"})
            mismatched = resolve_active_artifact(
                models_dir,
                "without_odds",
                "fallback.pkl",
            )
            self.assertEqual(mismatched, models_dir / "fallback.pkl")

            atomic_write_json(manifest_path, manifest)
            artifact.write_bytes(b"corrupted")
            corrupted = resolve_active_artifact(
                models_dir,
                "without_odds",
                "fallback.pkl",
            )
            self.assertEqual(corrupted, models_dir / "fallback.pkl")

    def test_atomic_json_write_replaces_complete_document(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "state.json"
            atomic_write_json(output, {"version": 1})
            atomic_write_json(output, {"version": 2, "ready": True})

            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8")),
                {"version": 2, "ready": True},
            )


if __name__ == "__main__":
    unittest.main()