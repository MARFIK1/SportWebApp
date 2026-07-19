import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Optional


MODEL_ARTIFACT_SCHEMA_VERSION = 3
MODEL_RELEASE_SCHEMA_VERSION = 1
PREDICTION_CONTRACT_SCHEMA_VERSION = 1


def _canonical_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def stable_hash(value) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_json(path: Path, payload: Mapping) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as target:
            json.dump(payload, target, ensure_ascii=False, indent=2)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary_path, path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def atomic_copy_file(source: Path, destination: Path) -> None:
    source = Path(source)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.",
        suffix=".tmp",
        dir=destination.parent,
    )
    os.close(handle)
    temporary_path = Path(temporary_name)
    try:
        shutil.copy2(source, temporary_path)
        os.replace(temporary_path, destination)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def finalize_artifact_manifest(manifest: Mapping) -> dict:
    result = dict(manifest)
    identity_payload = {
        key: value
        for key, value in result.items()
        if key not in {"artifact", "artifact_id", "artifact_sha256"}
    }
    result["artifact_id"] = f"model-{stable_hash(identity_payload)[:20]}"
    return result


def artifact_contract_from_manifest(
    manifest: Optional[Mapping],
    artifact_path: Optional[Path] = None,
) -> dict:
    manifest = dict(manifest or {})
    metadata = manifest.get("metadata", {}) or {}
    training = metadata.get("training", {}) or {}
    promotion = metadata.get("promotion", {}) or {}
    release = metadata.get("release", {}) or {}

    artifact_id = manifest.get("artifact_id")
    if not artifact_id:
        legacy_payload = {
            "created_at": manifest.get("created_at"),
            "dataset_hash": manifest.get("dataset_hash"),
            "code_hash": manifest.get("code_hash"),
            "targets": manifest.get("targets", []),
            "metadata": metadata,
        }
        if any(value for value in legacy_payload.values()):
            artifact_id = f"legacy-{stable_hash(legacy_payload)[:20]}"
        elif artifact_path and Path(artifact_path).exists():
            artifact_id = f"legacy-file-{file_sha256(Path(artifact_path))[:16]}"

    reproducibility = manifest.get("reproducibility", {}) or {}
    return {
        "schema_version": MODEL_RELEASE_SCHEMA_VERSION,
        "artifact_id": artifact_id,
        "release_id": release.get("release_id") or promotion.get("release_id"),
        "variant": training.get("variant") or promotion.get("variant"),
        "created_at": manifest.get("created_at"),
        "manifest_version": manifest.get("version"),
        "dataset_hash": manifest.get("dataset_hash"),
        "code_hash": manifest.get("code_hash"),
        "source_commit": reproducibility.get("git_commit"),
    }


def predictor_artifact_contract(predictor) -> dict:
    return artifact_contract_from_manifest(
        getattr(predictor, "artifact_manifest", None),
        Path(getattr(predictor, "artifact_path", ""))
        if getattr(predictor, "artifact_path", None)
        else None,
    )


def create_release_id(variant: str, promotion: Mapping) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = stable_hash({"variant": variant, "promotion": promotion})[:10]
    return f"{variant}-{timestamp}-{suffix}"


def active_pointer_name(variant: str) -> str:
    return f"active_{variant}.json"


def build_active_pointer(
    variant: str,
    release_id: str,
    artifact_path: Path,
    manifest: Mapping,
    models_dir: Path,
) -> dict:
    contract = artifact_contract_from_manifest(manifest, artifact_path)
    relative_path = os.path.relpath(Path(artifact_path), Path(models_dir)).replace("\\", "/")
    return {
        "schema_version": MODEL_RELEASE_SCHEMA_VERSION,
        "activated_at": datetime.now(timezone.utc).isoformat(),
        "variant": variant,
        "release_id": release_id,
        "artifact_id": contract.get("artifact_id"),
        "artifact": relative_path,
        "manifest": f"{relative_path}.manifest.json",
    }


def resolve_active_artifact(models_dir: Path, variant: str, fallback_name: str) -> Path:
    models_dir = Path(models_dir)
    fallback_path = models_dir / fallback_name
    pointer_path = models_dir / active_pointer_name(variant)
    if not pointer_path.exists():
        return fallback_path

    try:
        pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
        if pointer.get("variant") != variant:
            return fallback_path

        relative_artifact = pointer.get("artifact")
        relative_manifest = pointer.get("manifest")
        if not isinstance(relative_artifact, str) or not relative_artifact:
            return fallback_path
        if not isinstance(relative_manifest, str) or not relative_manifest:
            return fallback_path

        resolved_models_dir = models_dir.resolve()
        candidate = (models_dir / relative_artifact).resolve()
        manifest_path = (models_dir / relative_manifest).resolve()
        if not candidate.is_relative_to(resolved_models_dir):
            return fallback_path
        if not manifest_path.is_relative_to(resolved_models_dir):
            return fallback_path
        if not candidate.is_file() or not manifest_path.is_file():
            return fallback_path

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        pointer_artifact_id = pointer.get("artifact_id")
        if not pointer_artifact_id or manifest.get("artifact_id") != pointer_artifact_id:
            return fallback_path
        expected_sha256 = manifest.get("artifact_sha256")
        if expected_sha256 and file_sha256(candidate) != expected_sha256:
            return fallback_path
        return candidate
    except (OSError, ValueError, TypeError):
        return fallback_path
