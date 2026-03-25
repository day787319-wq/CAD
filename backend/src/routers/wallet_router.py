from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
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
    export_wallet_keystore as export_wallet_keystore_service,
    list_saved_wallets as list_saved_wallets_service,
    list_wallet_runs as list_wallet_runs_service,
    quote_wallet_batch_swap as quote_wallet_batch_swap_service,
    quote_uniswap_swap as quote_uniswap_swap_service,
    run_wallet_run_job as run_wallet_run_job_service,
    store_wallet,
)

router = APIRouter(prefix="/api/wallets", tags=["wallets"])

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
    fee_tier: int | None = None
    slippage_percent: str | None = None

class BatchSwapQuoteRequest(BaseModel):
    wallet_id: str
    token_out: str
    fee_tier: int | None = None
    slippage_percent: str | None = None


class WalletRunRequest(BaseModel):
    main_id: str
    template_id: str
    count: int = 1


class WalletKeystoreExportRequest(BaseModel):
    access_passphrase: str
    export_passphrase: str

@router.post("/main/import")
async def import_main_wallet_endpoint(request: ImportMainWalletRequest):
    try:
        wallet_data = import_main_wallet_service(request.seed_phrase)
        wallet_id = f"imported_main_{int(datetime.now().timestamp())}"
        store_wallet(wallet_id, wallet_data, 'main')
        # Return without private key or encrypted data
        safe_response = {
            "id": wallet_id,
            "address": wallet_data["address"],
            "chain": wallet_data["chain"],
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
async def generate_main_wallet_endpoint():
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
            "native_symbol": wallet_data["native_symbol"],
            "wrapped_native_symbol": wallet_data["wrapped_native_symbol"],
            "eth_balance": wallet_data["eth_balance"],
            "weth_balance": wallet_data["weth_balance"],
            "weth_address": wallet_data["weth_address"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/private-key/import")
async def import_private_key_wallet_endpoint(request: ImportPrivateKeyWalletRequest):
    try:
        wallet_data = import_private_key_wallet_service(request.private_key)
        wallet_id = f"imported_pk_{int(datetime.now().timestamp())}"
        store_wallet(wallet_id, wallet_data, 'imported_private_key')
        return {
            "id": wallet_id,
            "address": wallet_data["address"],
            "chain": wallet_data["chain"],
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
async def create_sub_wallets(request: SubWalletRequest):
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
async def execute_wallet_run_endpoint(request: WalletRunRequest, background_tasks: BackgroundTasks):
    try:
        run_record = create_wallet_run_service(request.main_id, request.template_id, request.count)
        background_tasks.add_task(
            run_wallet_run_job_service,
            run_record,
            request.main_id,
            request.template_id,
            request.count,
        )
        return run_record
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=503, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs")
async def list_wallet_runs_endpoint(main_wallet_id: str | None = None):
    try:
        return {"runs": list_wallet_runs_service(main_wallet_id=main_wallet_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/runs/{run_id}")
async def delete_wallet_run_endpoint(run_id: str):
    try:
        return delete_wallet_run_service(run_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def list_wallets_endpoint():
    try:
        return {"wallets": list_saved_wallets_service()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{wallet_id}")
async def delete_wallet_endpoint(wallet_id: str):
    try:
        return delete_wallet_service(wallet_id)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{wallet_id}/keystore")
async def export_wallet_keystore_endpoint(wallet_id: str, request: WalletKeystoreExportRequest):
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
async def get_swap_tokens_endpoint():
    try:
        return {"tokens": get_supported_tokens_service()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/swap/quote")
async def get_swap_quote_endpoint(request: SwapQuoteRequest):
    try:
        quote = quote_uniswap_swap_service(
            request.token_in,
            request.token_out,
            request.amount_in,
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
async def get_batch_swap_quote_endpoint(request: BatchSwapQuoteRequest):
    try:
        quote = quote_wallet_batch_swap_service(
            request.wallet_id,
            request.token_out,
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
async def get_wallet_details_endpoint(wallet_id: str, chain: str | None = Query(default=None)):
    try:
        wallet = get_wallet_details_service(wallet_id, chain=chain)
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
        return wallet
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{wallet_id}")
async def get_wallet_endpoint(wallet_id: str):
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
