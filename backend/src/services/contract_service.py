import json
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path


ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "contracts" / "artifacts" / "src"
GENERATED_ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "contracts" / "artifacts" / "generated"
ARTIFACT_PATHS = {
    "MainWalletRegistry": ARTIFACTS_DIR / "MainWalletRegistry.sol" / "MainWalletRegistry.json",
    "SubWalletRegistry": ARTIFACTS_DIR / "SubWalletRegistry.sol" / "SubWalletRegistry.json",
    "TokenConfigRegistry": ARTIFACTS_DIR / "TokenConfigRegistry.sol" / "TokenConfigRegistry.json",
    "ManagedTokenDistributor": ARTIFACTS_DIR / "ManagedTokenDistributor.sol" / "ManagedTokenDistributor.json",
    "BatchTreasuryDistributor": ARTIFACTS_DIR / "BatchTreasuryDistributor.sol" / "BatchTreasuryDistributor.json",
}


@lru_cache(maxsize=None)
def load_contract_artifact(contract_name: str) -> dict:
    artifact_path = ARTIFACT_PATHS.get(contract_name)
    if artifact_path is None:
        raise ValueError(f"Unsupported contract artifact: {contract_name}")
    if contract_name in {"ManagedTokenDistributor", "BatchTreasuryDistributor"}:
        generated_artifact_path = GENERATED_ARTIFACTS_DIR / f"{contract_name}.json"
        if generated_artifact_path.exists():
            artifact_path = generated_artifact_path
    if not artifact_path.exists():
        raise RuntimeError(f"Contract artifact not found: {artifact_path}")

    payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    abi = payload.get("abi")
    if not isinstance(abi, list):
        raise RuntimeError(f"Invalid ABI in contract artifact: {artifact_path}")

    return {
        "contract_name": payload.get("contractName") or contract_name,
        "artifact_path": str(artifact_path),
        "abi": abi,
        "constructor_inputs": (
            payload["abi"][0].get("inputs", [])
            if payload.get("abi")
            and isinstance(payload["abi"], list)
            and payload["abi"]
            and payload["abi"][0].get("type") == "constructor"
            else []
        ),
    }


def _artifact_available(contract_name: str) -> bool:
    try:
        load_contract_artifact(contract_name)
        return True
    except Exception:
        return False


def _join_message_parts(parts: list[str]) -> str:
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"
    return ", ".join(parts[:-1]) + f", and {parts[-1]}"


def _is_positive_amount(value) -> bool:
    try:
        return Decimal(str(value or "0")) > 0
    except (InvalidOperation, TypeError):
        return False


def get_registry_integration_status():
    main_enabled = _artifact_available("MainWalletRegistry")
    sub_enabled = _artifact_available("SubWalletRegistry")
    token_enabled = _artifact_available("TokenConfigRegistry")
    distributor_enabled = _artifact_available("BatchTreasuryDistributor")
    enabled = main_enabled or sub_enabled or token_enabled or distributor_enabled

    if enabled:
        message = (
            "Imported contract data is derived from the existing wallet and template records. "
            "No separate main-wallet or subwallet registry source is needed."
        )
    else:
        message = "No imported contract artifacts are available."

    return {
        "enabled": enabled,
        "main_wallet_registry_enabled": main_enabled,
        "sub_wallet_registry_enabled": sub_enabled,
        "token_config_registry_enabled": token_enabled,
        "managed_token_distributor_enabled": distributor_enabled,
        "message": message,
    }


def build_registry_sync_preview(main_wallet_address: str, contract_count: int, stablecoin_allocations: list[dict] | None = None):
    status = get_registry_integration_status()
    stablecoin_allocations = stablecoin_allocations or []
    token_config_count = len(stablecoin_allocations) if status["token_config_registry_enabled"] else 0
    expected_action_count = (
        (1 if status["main_wallet_registry_enabled"] and main_wallet_address else 0)
        + (contract_count if status["sub_wallet_registry_enabled"] else 0)
        + token_config_count
    )

    message_parts = []
    if status["main_wallet_registry_enabled"] and main_wallet_address:
        message_parts.append("the saved main wallet address")
    if status["sub_wallet_registry_enabled"] and contract_count > 0:
        message_parts.append(
            f"{contract_count} new subwallet{'s' if contract_count != 1 else ''}"
        )
    if token_config_count > 0:
        message_parts.append(
            f"{token_config_count} template token config entr{'ies' if token_config_count != 1 else 'y'}"
        )

    if message_parts:
        message = f"Imported contract records will be assembled from {_join_message_parts(message_parts)}."
    else:
        message = status["message"]

    return {
        **status,
        "main_wallet_registration_required": bool(status["main_wallet_registry_enabled"] and main_wallet_address),
        "expected_action_count": expected_action_count,
        "token_config_count": token_config_count,
        "gas_units": 0,
        "gas_price_wei": None,
        "gas_price_gwei": None,
        "fee_wei": 0,
        "fee_eth": "0",
        "message": message,
    }


def build_contract_execution_snapshot(*, main_wallet: dict, template: dict, sub_wallets: list[dict]):
    status = get_registry_integration_status()
    stablecoin_allocations = template.get("stablecoin_allocations") or []
    distribution_mode = template.get("stablecoin_distribution_mode") or "none"
    distributor_native_eth_amount = template.get("direct_contract_native_eth_per_contract") or "0"
    distributor_amount = template.get("direct_contract_weth_per_contract") or "0"
    swap_budget = template.get("swap_budget_eth_per_contract") or "0"
    distributor_recipient = template.get("testing_recipient_address") or template.get("recipient_address")
    return_wallet_address = template.get("return_wallet_address")
    test_auto_execute_after_funding = bool(
        template.get("test_auto_batch_send_after_funding", template.get("test_auto_execute_after_funding", False))
    )
    distributor_native_eth_amount_configured = _is_positive_amount(distributor_native_eth_amount)
    distributor_amount_configured = _is_positive_amount(distributor_amount)
    has_swap_routes = (
        distribution_mode != "none"
        and len(stablecoin_allocations) > 0
        and _is_positive_amount(swap_budget)
    )
    distributor_flow_configured = has_swap_routes or distributor_native_eth_amount_configured or distributor_amount_configured

    main_wallet_registry = {
        "contract_name": "MainWalletRegistry",
        "artifact_path": load_contract_artifact("MainWalletRegistry")["artifact_path"] if status["main_wallet_registry_enabled"] else None,
        "wallet_id": main_wallet.get("id"),
        "wallet_address": main_wallet.get("address"),
        "status": "mapped" if status["main_wallet_registry_enabled"] else "unavailable",
    }
    sub_wallet_registry = {
        "contract_name": "SubWalletRegistry",
        "artifact_path": load_contract_artifact("SubWalletRegistry")["artifact_path"] if status["sub_wallet_registry_enabled"] else None,
        "main_wallet_address": main_wallet.get("address"),
        "sub_wallet_count": len(sub_wallets),
        "sub_wallets": [
            {
                "wallet_id": sub_wallet.get("id"),
                "address": sub_wallet.get("address"),
                "index": sub_wallet.get("index"),
            }
            for sub_wallet in sub_wallets
        ],
        "status": "mapped" if status["sub_wallet_registry_enabled"] else "unavailable",
    }
    token_config_registry = {
        "contract_name": "TokenConfigRegistry",
        "artifact_path": load_contract_artifact("TokenConfigRegistry")["artifact_path"] if status["token_config_registry_enabled"] else None,
        "token_count": len(stablecoin_allocations),
        "tokens": [
            {
                "token_symbol": allocation.get("token_symbol"),
                "token_address": allocation.get("token_address"),
            }
            for allocation in stablecoin_allocations
        ],
        "status": "mapped" if status["token_config_registry_enabled"] else "unavailable",
    }
    managed_token_distributor = {
        "contract_name": "BatchTreasuryDistributor",
        "artifact_path": load_contract_artifact("BatchTreasuryDistributor")["artifact_path"] if status["managed_token_distributor_enabled"] else None,
        "status": (
            "deployment_configured"
            if status["managed_token_distributor_enabled"] and distributor_recipient and distributor_flow_configured
            else "recipient_required"
            if status["managed_token_distributor_enabled"] and distributor_flow_configured and not distributor_recipient
            else "amount_required"
            if status["managed_token_distributor_enabled"] and distributor_recipient and not distributor_flow_configured
            else "not_configured"
            if status["managed_token_distributor_enabled"]
            else "unavailable"
        ),
        "message": (
            "BatchTreasuryDistributor testing deployment is ready. Each sub-wallet will deploy one contract after any local wrap and configured swap outputs are available, then fund all successful assets into that contract."
            if status["managed_token_distributor_enabled"] and distributor_recipient and distributor_flow_configured
            else "Set testing_recipient_address to enable BatchTreasuryDistributor testing deployment."
            if status["managed_token_distributor_enabled"] and distributor_flow_configured and not distributor_recipient
            else "This template only funds sub-wallet gas right now. Add a positive token swap budget with allocations or set direct contract native/wrapped funding above 0 to enable BatchTreasuryDistributor testing deployment."
            if status["managed_token_distributor_enabled"] and distributor_recipient and not distributor_flow_configured
            else "Set testing_recipient_address and add either a positive token swap budget with allocations or direct contract native/wrapped funding above 0 to enable BatchTreasuryDistributor testing deployment."
            if status["managed_token_distributor_enabled"]
            else "BatchTreasuryDistributor artifact unavailable."
        ),
        "recipient_address": distributor_recipient,
        "testing_recipient_address": distributor_recipient,
        "return_wallet_address": return_wallet_address,
        "test_auto_execute_after_funding": test_auto_execute_after_funding,
        "test_auto_batch_send_after_funding": test_auto_execute_after_funding,
        "native_eth_amount": distributor_native_eth_amount,
        "amount": distributor_amount,
        "has_swap_routes": has_swap_routes,
    }

    enabled_registry_count = sum(
        1
        for flag in (
            status["main_wallet_registry_enabled"],
            status["sub_wallet_registry_enabled"],
            status["token_config_registry_enabled"],
            status["managed_token_distributor_enabled"],
        )
        if flag
    )

    return {
        "status": "recorded" if status["enabled"] else "disabled",
        "message": (
            "Imported contract data was assembled from the saved main wallet, the created subwallet batch, "
            "and the selected template."
            if status["enabled"]
            else status["message"]
        ),
        "enabled": status["enabled"],
        "expected_action_count": (
            (1 if status["main_wallet_registry_enabled"] else 0)
            + (len(sub_wallets) if status["sub_wallet_registry_enabled"] else 0)
            + (len(stablecoin_allocations) if status["token_config_registry_enabled"] else 0)
        ),
        "submitted_transaction_count": 0,
        "registry_count": enabled_registry_count,
        "main_wallet_registry_enabled": status["main_wallet_registry_enabled"],
        "sub_wallet_registry_enabled": status["sub_wallet_registry_enabled"],
        "token_config_registry_enabled": status["token_config_registry_enabled"],
        "managed_token_distributor_enabled": status["managed_token_distributor_enabled"],
        "main_wallet_registry": main_wallet_registry,
        "sub_wallet_registry": sub_wallet_registry,
        "token_config_registry": token_config_registry,
        "managed_token_distributor": managed_token_distributor,
        "records": [
            item
            for item in (
                main_wallet_registry,
                sub_wallet_registry,
                token_config_registry,
                managed_token_distributor,
            )
            if item.get("artifact_path")
        ],
        "error": None,
    }
