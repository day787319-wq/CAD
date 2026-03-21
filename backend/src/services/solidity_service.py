import json
from functools import lru_cache
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_SRC_DIR = REPO_ROOT / "contracts" / "src"
GENERATED_ARTIFACTS_DIR = REPO_ROOT / "contracts" / "artifacts" / "generated"
IMPORTED_ARTIFACTS_DIR = REPO_ROOT / "contracts" / "artifacts" / "src"
SOLC_VERSION = "0.8.20"

MANAGED_TOKEN_DISTRIBUTOR_SOURCE_PATH = CONTRACTS_SRC_DIR / "ManagedTokenDistributor.sol"
GENERATED_MANAGED_TOKEN_DISTRIBUTOR_ARTIFACT_PATH = GENERATED_ARTIFACTS_DIR / "ManagedTokenDistributor.json"
IMPORTED_MANAGED_TOKEN_DISTRIBUTOR_ARTIFACT_PATH = (
    IMPORTED_ARTIFACTS_DIR / "ManagedTokenDistributor.sol" / "ManagedTokenDistributor.json"
)


def _normalize_bytecode(value: str | None) -> str | None:
    if not value:
        return None
    return value if value.startswith("0x") else f"0x{value}"


def _load_artifact(path: Path) -> dict | None:
    if not path.exists():
        return None

    payload = json.loads(path.read_text(encoding="utf-8"))
    abi = payload.get("abi")
    bytecode = _normalize_bytecode(payload.get("bytecode") or payload.get("bin"))
    if not isinstance(abi, list) or not bytecode:
        return None

    return {
        "contract_name": payload.get("contract_name") or payload.get("contractName") or "ManagedTokenDistributor",
        "abi": abi,
        "bytecode": bytecode,
        "artifact_path": str(path),
        "source_path": payload.get("source_path") or str(MANAGED_TOKEN_DISTRIBUTOR_SOURCE_PATH),
        "compiler_version": payload.get("compiler_version") or SOLC_VERSION,
    }


def compile_managed_token_distributor() -> dict:
    try:
        from solcx import compile_files, get_installed_solc_versions, install_solc
    except Exception as exc:
        raise RuntimeError("py-solc-x is not installed") from exc

    installed_versions = {str(version) for version in get_installed_solc_versions()}
    if SOLC_VERSION not in installed_versions:
        install_solc(SOLC_VERSION)

    compiled = compile_files(
        [str(MANAGED_TOKEN_DISTRIBUTOR_SOURCE_PATH)],
        output_values=["abi", "bin"],
        solc_version=SOLC_VERSION,
    )

    contract_key = next(
        (
            key
            for key in compiled
            if key.endswith(":ManagedTokenDistributor")
        ),
        None,
    )
    if contract_key is None:
        raise RuntimeError("ManagedTokenDistributor compilation output not found")

    artifact = {
        "contract_name": "ManagedTokenDistributor",
        "abi": compiled[contract_key]["abi"],
        "bytecode": _normalize_bytecode(compiled[contract_key]["bin"]),
        "artifact_path": str(GENERATED_MANAGED_TOKEN_DISTRIBUTOR_ARTIFACT_PATH),
        "source_path": str(MANAGED_TOKEN_DISTRIBUTOR_SOURCE_PATH),
        "compiler_version": SOLC_VERSION,
    }

    GENERATED_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_MANAGED_TOKEN_DISTRIBUTOR_ARTIFACT_PATH.write_text(
        json.dumps(artifact, indent=2),
        encoding="utf-8",
    )
    return artifact


@lru_cache(maxsize=1)
def get_managed_token_distributor_interface() -> dict:
    compiled_artifact = _load_artifact(GENERATED_MANAGED_TOKEN_DISTRIBUTOR_ARTIFACT_PATH)
    if compiled_artifact is not None:
        return compiled_artifact

    try:
        return compile_managed_token_distributor()
    except Exception:
        imported_artifact = _load_artifact(IMPORTED_MANAGED_TOKEN_DISTRIBUTOR_ARTIFACT_PATH)
        if imported_artifact is not None:
            return imported_artifact
        raise
