import json
from functools import lru_cache
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACTS_SRC_DIR = REPO_ROOT / "contracts" / "src"
GENERATED_ARTIFACTS_DIR = REPO_ROOT / "contracts" / "artifacts" / "generated"
IMPORTED_ARTIFACTS_DIR = REPO_ROOT / "contracts" / "artifacts" / "src"
DEFAULT_SOLC_VERSION = "0.8.20"
CONTRACT_SPECS = {
    "ManagedTokenDistributor": {
        "source_path": CONTRACTS_SRC_DIR / "ManagedTokenDistributor.sol",
        "generated_artifact_path": GENERATED_ARTIFACTS_DIR / "ManagedTokenDistributor.json",
        "imported_artifact_path": IMPORTED_ARTIFACTS_DIR / "ManagedTokenDistributor.sol" / "ManagedTokenDistributor.json",
        "solc_version": "0.8.20",
    },
    "BatchTreasuryDistributor": {
        "source_path": CONTRACTS_SRC_DIR / "BatchTreasuryDistributor.sol",
        "generated_artifact_path": GENERATED_ARTIFACTS_DIR / "BatchTreasuryDistributor.json",
        "imported_artifact_path": IMPORTED_ARTIFACTS_DIR / "BatchTreasuryDistributor.sol" / "BatchTreasuryDistributor.json",
        "solc_version": "0.8.26",
    },
}


def _normalize_bytecode(value: str | None) -> str | None:
    if not value:
        return None
    return value if value.startswith("0x") else f"0x{value}"


def _load_artifact(path: Path, *, contract_name: str, source_path: Path) -> dict | None:
    if not path.exists():
        return None

    payload = json.loads(path.read_text(encoding="utf-8"))
    abi = payload.get("abi")
    bytecode = _normalize_bytecode(payload.get("bytecode") or payload.get("bin"))
    if not isinstance(abi, list) or not bytecode:
        return None

    return {
        "contract_name": payload.get("contract_name") or payload.get("contractName") or contract_name,
        "abi": abi,
        "bytecode": bytecode,
        "artifact_path": str(path),
        "source_path": payload.get("source_path") or str(source_path),
        "compiler_version": payload.get("compiler_version") or DEFAULT_SOLC_VERSION,
    }


def compile_contract(contract_name: str) -> dict:
    spec = CONTRACT_SPECS.get(contract_name)
    if spec is None:
        raise ValueError(f"Unsupported contract: {contract_name}")

    try:
        from solcx import compile_files, get_installed_solc_versions, install_solc
    except Exception as exc:
        raise RuntimeError("py-solc-x is not installed") from exc

    solc_version = spec["solc_version"]
    installed_versions = {str(version) for version in get_installed_solc_versions()}
    if solc_version not in installed_versions:
        install_solc(solc_version)

    compiled = compile_files(
        [str(spec["source_path"])],
        output_values=["abi", "bin"],
        solc_version=solc_version,
    )

    contract_key = next(
        (
            key
            for key in compiled
            if key.endswith(f":{contract_name}")
        ),
        None,
    )
    if contract_key is None:
        raise RuntimeError(f"{contract_name} compilation output not found")

    artifact = {
        "contract_name": contract_name,
        "abi": compiled[contract_key]["abi"],
        "bytecode": _normalize_bytecode(compiled[contract_key]["bin"]),
        "artifact_path": str(spec["generated_artifact_path"]),
        "source_path": str(spec["source_path"]),
        "compiler_version": solc_version,
    }

    GENERATED_ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    spec["generated_artifact_path"].write_text(
        json.dumps(artifact, indent=2),
        encoding="utf-8",
    )
    return artifact


@lru_cache(maxsize=None)
def get_contract_interface(contract_name: str) -> dict:
    spec = CONTRACT_SPECS.get(contract_name)
    if spec is None:
        raise ValueError(f"Unsupported contract: {contract_name}")

    compiled_artifact = _load_artifact(
        spec["generated_artifact_path"],
        contract_name=contract_name,
        source_path=spec["source_path"],
    )
    if compiled_artifact is not None:
        return compiled_artifact

    try:
        return compile_contract(contract_name)
    except Exception:
        imported_artifact = _load_artifact(
            spec["imported_artifact_path"],
            contract_name=contract_name,
            source_path=spec["source_path"],
        )
        if imported_artifact is not None:
            return imported_artifact
        raise


def get_managed_token_distributor_interface() -> dict:
    return get_contract_interface("ManagedTokenDistributor")


def get_batch_treasury_distributor_interface() -> dict:
    return get_contract_interface("BatchTreasuryDistributor")
