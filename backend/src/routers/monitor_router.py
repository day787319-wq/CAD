from fastapi import APIRouter, HTTPException, Query

from src.services.monitor_service import (
    get_address_asset_monitoring,
    get_asset_monitoring_overview,
    get_wallet_asset_monitoring,
)

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/overview")
async def get_asset_monitoring_overview_endpoint(
    sync: bool = Query(False),
    limit: int = Query(20, ge=0, le=200),
    chain: str | None = Query(default=None),
):
    try:
        return get_asset_monitoring_overview(sync=sync, limit=limit, chain=chain)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wallet/{wallet_id}")
async def get_wallet_asset_monitoring_endpoint(
    wallet_id: str,
    sync: bool = Query(True),
    limit: int = Query(20, ge=0, le=200),
    chain: str | None = Query(default=None),
):
    try:
        return get_wallet_asset_monitoring(wallet_id, sync=sync, limit=limit, chain=chain)
    except ValueError as ve:
        status_code = 404 if str(ve) == "Wallet not found" else 400
        raise HTTPException(status_code=status_code, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/address/{address}")
async def get_address_asset_monitoring_endpoint(
    address: str,
    sync: bool = Query(True),
    limit: int = Query(20, ge=0, le=200),
    chain: str | None = Query(default=None),
):
    try:
        return get_address_asset_monitoring(address, sync=sync, limit=limit, chain=chain)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
