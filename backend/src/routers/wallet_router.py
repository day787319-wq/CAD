from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime

from src.services.wallet_service import (
    create_wallet_run as create_wallet_run_service,
    delete_wallet as delete_wallet_service,
    delete_wallet_run as delete_wallet_run_service,
    generate_sub_wallets as generate_sub_wallets_service,
    generate_main_wallet as generate_main_wallet_service,
    get_wallet_details as get_wallet_details_service,
    get_supported_tokens as get_supported_tokens_service,
    get_wallet as get_wallet_service,
    import_main_wallet as import_main_wallet_service,
    import_private_key_wallet as import_private_key_wallet_service,
    manual_sweep_subwallet_leftovers as manual_sweep_subwallet_leftovers_service,
    export_wallet_keystore as export_wallet_keystore_service,
    list_saved_wallets as list_saved_wallets_service,
    list_wallet_runs as list_wallet_runs_service,
    quote_wallet_batch_swap as quote_wallet_batch_swap_service,
    quote_uniswap_swap as quote_uniswap_swap_service,
    run_wallet_run_job as run_wallet_run_job_service,
    store_wallet,
    withdraw_subwallet_linked_treasury_contract as withdraw_subwallet_linked_treasury_contract_service,
)
from src.services.solidity_service import get_contract_source as get_contract_source_service

router = APIRouter(prefix="/api/wallets", tags=["wallets"])


def _normalize_wallet_action_message(message: str | None) -> str | None:
    normalized = str(message or "").strip()
    if not normalized or normalized.casefold() == "internal server error":
        return None
    return normalized


def _build_wallet_action_error_payload(
    message: str | None,
    *,
    code: str,
    title: str,
    summary: str,
    hint: str,
) -> dict:
    normalized_message = _normalize_wallet_action_message(message)
    lowered = (normalized_message or "").casefold()

    if "rpc is unavailable" in lowered or "rpc is not configured" in lowered:
        return {
            "code": "rpc_unavailable",
            "title": "Chain RPC unavailable",
            "summary": normalized_message or "The selected chain RPC is unavailable for this action.",
            "details": [normalized_message] if normalized_message else [],
            "hint": "Retry after the chain RPC recovers.",
        }

    if "needs at least" in lowered or "headroom check failed" in lowered:
        return {
            "code": "insufficient_native_gas",
            "title": "Not enough native gas",
            "summary": normalized_message or "The wallet does not have enough native gas to complete this action.",
            "details": [normalized_message] if normalized_message else [],
            "hint": "Top up the wallet with more native gas, then retry the action.",
        }

    if "no return wallet is configured" in lowered:
        return {
            "code": "missing_return_wallet",
            "title": "Return wallet not configured",
            "summary": normalized_message or "This subwallet does not have a return wallet configured.",
            "details": [normalized_message] if normalized_message else [],
            "hint": "Set a valid return wallet on the template or originating run before retrying the sweep.",
        }

    if "matches the subwallet address" in lowered:
        return {
            "code": "invalid_return_wallet",
            "title": "Return wallet configuration error",
            "summary": normalized_message or "The configured return wallet matches the subwallet address.",
            "details": [normalized_message] if normalized_message else [],
            "hint": "Choose a different return wallet address before retrying the sweep.",
        }

    fallback_summary = normalized_message or summary
    return {
        "code": code,
        "title": title,
        "summary": fallback_summary,
        "details": [normalized_message] if normalized_message else [summary],
        "hint": hint,
    }

class ImportMainWalletRequest(BaseModel):
    seed_phrase: str

class ImportPrivateKeyWalletRequest(BaseModel):
    private_key: str

class SubWalletRequest(BaseModel):
    main_id: str
    count: int = 1  # Number of sub-wallets to create (e.g., 10)
    template: dict | None = None

class SwapQuoteRequest(BaseModel):
    token_in: str
    token_out: str
    amount_in: str
    chain: str | None = None
    fee_tier: int | None = None
    slippage_percent: str | None = None

class BatchSwapQuoteRequest(BaseModel):
    wallet_id: str
    token_out: str
    chain: str | None = None
    fee_tier: int | None = None
    slippage_percent: str | None = None


class WalletRunRequest(BaseModel):
    main_id: str
    template_id: str
    count: int = 1
    preview: dict | None = None


class WalletKeystoreExportRequest(BaseModel):
    access_passphrase: str
    export_passphrase: str


class WalletContractWithdrawRequest(BaseModel):
    chain: str | None = None


class WalletSubwalletSweepRequest(BaseModel):
    chain: str | None = None

@router.post("/main/import")
def import_main_wallet_endpoint(request: ImportMainWalletRequest):
    try:
        wallet_data = import_main_wallet_service(request.seed_phrase)
        wallet_id = f"imported_main_{int(datetime.now().timestamp())}"
        store_wallet(wallet_id, wallet_data, 'main')
        # Return without private key or encrypted data
        safe_response = {
            "id": wallet_id,
            "address": wallet_data["address"],
            "chain": wallet_data["chain"],
            "chain_label": wallet_data.get("chain_label"),
            "native_symbol": wallet_data["native_symbol"],
            "wrapped_native_symbol": wallet_data["wrapped_native_symbol"],
            "eth_balance": wallet_data["eth_balance"],
            "weth_balance": wallet_data["weth_balance"],
            "weth_address": wallet_data["weth_address"]
        }
        return safe_response
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/main/generate")
def generate_main_wallet_endpoint():
    try:
        wallet_data = generate_main_wallet_service()
        wallet_id = f"generated_main_{int(datetime.now().timestamp())}"
        seed_phrase = wallet_data.pop("seed_phrase")
        store_wallet(wallet_id, wallet_data, 'main')
        return {
            "id": wallet_id,
            "address": wallet_data["address"],
            "seed_phrase": seed_phrase,
            "chain": wallet_data["chain"],
            "chain_label": wallet_data.get("chain_label"),
            "native_symbol": wallet_data["native_symbol"],
            "wrapped_native_symbol": wallet_data["wrapped_native_symbol"],
            "eth_balance": wallet_data["eth_balance"],
            "weth_balance": wallet_data["weth_balance"],
            "weth_address": wallet_data["weth_address"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/private-key/import")
def import_private_key_wallet_endpoint(request: ImportPrivateKeyWalletRequest):
    try:
        wallet_data = import_private_key_wallet_service(request.private_key)
        wallet_id = f"imported_pk_{int(datetime.now().timestamp())}"
        store_wallet(wallet_id, wallet_data, 'imported_private_key')
        return {
            "id": wallet_id,
            "address": wallet_data["address"],
            "chain": wallet_data["chain"],
            "chain_label": wallet_data.get("chain_label"),
            "native_symbol": wallet_data["native_symbol"],
            "wrapped_native_symbol": wallet_data["wrapped_native_symbol"],
            "eth_balance": wallet_data["eth_balance"],
            "weth_balance": wallet_data["weth_balance"],
            "weth_address": wallet_data["weth_address"]
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sub")
def create_sub_wallets(request: SubWalletRequest):
    try:
        if request.count < 1 or request.count > 100:  # Limit to prevent abuse
            raise HTTPException(status_code=400, detail="Count must be between 1 and 100")

        sub_wallets = generate_sub_wallets_service(request.main_id, request.count)
        return {"sub_wallets": sub_wallets}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/runs")
def execute_wallet_run_endpoint(request: WalletRunRequest, background_tasks: BackgroundTasks):
    try:
        run_record = create_wallet_run_service(
            request.main_id,
            request.template_id,
            request.count,
            preview=request.preview,
        )
        background_tasks.add_task(
            run_wallet_run_job_service,
            run_record,
            request.main_id,
            request.template_id,
            request.count,
        )
        return run_record
    except ValueError as ve:
        error_payload = _build_wallet_action_error_payload(
            str(ve),
            code="run_execute_failed",
            title="Run failed",
            summary="Failed to execute the automation run.",
            hint="Review the preview warnings, chain RPC, and wallet funding, then retry the run.",
        )
        return JSONResponse(status_code=400, content={"detail": error_payload["summary"], "error": error_payload})
    except RuntimeError as re:
        error_payload = _build_wallet_action_error_payload(
            str(re),
            code="run_execute_failed",
            title="Run failed",
            summary="Failed to execute the automation run.",
            hint="Review the preview warnings, chain RPC, and wallet funding, then retry the run.",
        )
        return JSONResponse(status_code=503, content={"detail": error_payload["summary"], "error": error_payload})
    except Exception as e:
        error_payload = _build_wallet_action_error_payload(
            str(e),
            code="run_execute_failed",
            title="Run failed",
            summary="Failed to execute the automation run.",
            hint="Review the preview warnings, chain RPC, and wallet funding, then retry the run.",
        )
        return JSONResponse(status_code=500, content={"detail": error_payload["summary"], "error": error_payload})


@router.get("/runs")
def list_wallet_runs_endpoint(main_wallet_id: str | None = None):
    try:
        return {"runs": list_wallet_runs_service(main_wallet_id=main_wallet_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/runs/{run_id}")
def delete_wallet_run_endpoint(run_id: str):
    try:
        return delete_wallet_run_service(run_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
def list_wallets_endpoint(chain: str | None = Query(default=None)):
    try:
        return {"wallets": list_saved_wallets_service(chain=chain)}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{wallet_id}")
def delete_wallet_endpoint(wallet_id: str):
    try:
        return delete_wallet_service(wallet_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{wallet_id}/keystore")
def export_wallet_keystore_endpoint(wallet_id: str, request: WalletKeystoreExportRequest):
    try:
        return export_wallet_keystore_service(wallet_id, request.access_passphrase, request.export_passphrase)
    except ValueError as ve:
        status_code = 404 if str(ve) == "Wallet not found" else 400
        raise HTTPException(status_code=status_code, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=503, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/swap/tokens")
def get_swap_tokens_endpoint():
    try:
        return {"tokens": get_supported_tokens_service()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/swap/quote")
def get_swap_quote_endpoint(request: SwapQuoteRequest):
    try:
        quote = quote_uniswap_swap_service(
            request.token_in,
            request.token_out,
            request.amount_in,
            chain=request.chain,
            fee_tier=request.fee_tier,
            slippage_percent=request.slippage_percent,
        )
        return quote
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=503, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/swap/batch-quote")
def get_batch_swap_quote_endpoint(request: BatchSwapQuoteRequest):
    try:
        quote = quote_wallet_batch_swap_service(
            request.wallet_id,
            request.token_out,
            chain=request.chain,
            fee_tier=request.fee_tier,
            slippage_percent=request.slippage_percent,
        )
        return quote
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=503, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{wallet_id}/details")
def get_wallet_details_endpoint(
    wallet_id: str,
    chain: str | None = Query(default=None),
    live_balances: bool = Query(default=True),
    include_token_holdings: bool = Query(default=True),
    include_subwallets: bool = Query(default=True),
):
    try:
        wallet = get_wallet_details_service(
            wallet_id,
            chain=chain,
            live_balances=live_balances,
            include_token_holdings=include_token_holdings,
            include_subwallets=include_subwallets,
        )
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        return wallet
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{wallet_id}/contracts/{contract_address}/withdraw")
def withdraw_wallet_contract_endpoint(
    wallet_id: str,
    contract_address: str,
    request: WalletContractWithdrawRequest,
):
    try:
        return withdraw_subwallet_linked_treasury_contract_service(
            wallet_id,
            contract_address,
            chain=request.chain,
        )
    except ValueError as ve:
        message = str(ve)
        status_code = 404 if message == "Wallet not found" else 400
        error_payload = _build_wallet_action_error_payload(
            message,
            code="contract_withdraw_failed",
            title="Withdraw failed",
            summary="Failed to withdraw funds from the linked treasury contract.",
            hint="Check the subwallet gas, chain RPC, and contract ownership, then retry the withdraw action.",
        )
        return JSONResponse(status_code=status_code, content={"detail": error_payload["summary"], "error": error_payload})
    except RuntimeError as re:
        error_payload = _build_wallet_action_error_payload(
            str(re),
            code="contract_withdraw_failed",
            title="Withdraw failed",
            summary="Failed to withdraw funds from the linked treasury contract.",
            hint="Check the subwallet gas, chain RPC, and contract ownership, then retry the withdraw action.",
        )
        return JSONResponse(status_code=503, content={"detail": error_payload["summary"], "error": error_payload})
    except Exception as e:
        error_payload = _build_wallet_action_error_payload(
            str(e),
            code="contract_withdraw_failed",
            title="Withdraw failed",
            summary="Failed to withdraw funds from the linked treasury contract.",
            hint="Check the subwallet gas, chain RPC, and contract ownership, then retry the withdraw action.",
        )
        return JSONResponse(status_code=500, content={"detail": error_payload["summary"], "error": error_payload})


@router.post("/{wallet_id}/sweep")
def sweep_subwallet_leftovers_endpoint(
    wallet_id: str,
    request: WalletSubwalletSweepRequest,
):
    try:
        return manual_sweep_subwallet_leftovers_service(
            wallet_id,
            chain=request.chain,
        )
    except ValueError as ve:
        message = str(ve)
        status_code = 404 if message == "Wallet not found" else 400
        error_payload = _build_wallet_action_error_payload(
            message,
            code="subwallet_sweep_failed",
            title="Subwallet sweep failed",
            summary="Failed to sweep leftover assets from this subwallet.",
            hint="Check the return wallet, chain RPC, and remaining subwallet gas, then retry the sweep.",
        )
        return JSONResponse(status_code=status_code, content={"detail": error_payload["summary"], "error": error_payload})
    except RuntimeError as re:
        error_payload = _build_wallet_action_error_payload(
            str(re),
            code="subwallet_sweep_failed",
            title="Subwallet sweep failed",
            summary="Failed to sweep leftover assets from this subwallet.",
            hint="Check the return wallet, chain RPC, and remaining subwallet gas, then retry the sweep.",
        )
        return JSONResponse(status_code=503, content={"detail": error_payload["summary"], "error": error_payload})
    except Exception as e:
        error_payload = _build_wallet_action_error_payload(
            str(e),
            code="subwallet_sweep_failed",
            title="Subwallet sweep failed",
            summary="Failed to sweep leftover assets from this subwallet.",
            hint="Check the return wallet, chain RPC, and remaining subwallet gas, then retry the sweep.",
        )
        return JSONResponse(status_code=500, content={"detail": error_payload["summary"], "error": error_payload})


@router.get("/contracts/source")
def get_wallet_contract_source_endpoint(contract_name: str = Query(default="BatchTreasuryDistributor")):
    try:
        return get_contract_source_service(contract_name)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=404, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{wallet_id}")
def get_wallet_endpoint(wallet_id: str):
    try:
        wallet = get_wallet_service(wallet_id)
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        # Remove private_key for response
        safe_wallet = {k: v for k, v in wallet.items() if k != 'private_key'}
        return safe_wallet
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
