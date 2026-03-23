from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.template_service import (
    create_template as create_template_service,
    get_template_editor_market_snapshot as get_template_editor_market_snapshot_service,
    get_template as get_template_service,
    get_template_options as get_template_options_service,
    list_templates as list_templates_service,
    market_check_template as market_check_template_service,
    preview_template as preview_template_service,
    soft_delete_template as soft_delete_template_service,
    update_template as update_template_service,
)


router = APIRouter(prefix="/api/templates", tags=["templates"])


class StablecoinAllocationRequest(BaseModel):
    token_symbol: str | None = None
    token_address: str
    percent: str | None = None
    weth_amount_per_contract: str | None = None


class TemplateUpsertRequest(BaseModel):
    name: str
    chain: str = "ethereum_mainnet"
    template_version: str = "v2"
    recipient_address: str | None = None
    return_wallet_address: str | None = None
    test_auto_execute_after_funding: bool = False
    gas_reserve_eth_per_contract: str = "0"
    swap_budget_eth_per_contract: str = "0"
    direct_contract_eth_per_contract: str = "0"
    direct_contract_native_eth_per_contract: str = "0"
    direct_contract_weth_per_contract: str = "0"
    auto_top_up_enabled: bool = False
    auto_top_up_threshold_eth: str = "0"
    auto_top_up_target_eth: str = "0"
    slippage_percent: str = "0.5"
    fee_tier: int | None = None
    auto_wrap_eth_to_weth: bool = True
    stablecoin_distribution_mode: str = "none"
    stablecoin_allocations: list[StablecoinAllocationRequest] = []
    notes: str | None = None


class TemplatePreviewRequest(BaseModel):
    wallet_id: str
    template_id: str
    contract_count: int


@router.get("/options")
async def get_template_options_endpoint(chain: str | None = None):
    try:
        return get_template_options_service(chain)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/market-snapshot")
async def get_template_editor_market_snapshot_endpoint(chain: str | None = None):
    try:
        return get_template_editor_market_snapshot_service(chain)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("")
async def list_templates_endpoint():
    try:
        return {"templates": list_templates_service()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("")
async def create_template_endpoint(request: TemplateUpsertRequest):
    try:
        return create_template_service(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{template_id}")
async def update_template_endpoint(template_id: str, request: TemplateUpsertRequest):
    try:
        return update_template_service(template_id, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{template_id}")
async def delete_template_endpoint(template_id: str):
    try:
        return soft_delete_template_service(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{template_id}")
async def get_template_endpoint(template_id: str):
    try:
        template = get_template_service(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{template_id}/market-check")
async def market_check_template_endpoint(template_id: str, contract_count: int = 1):
    try:
        return market_check_template_service(template_id, contract_count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/preview")
async def preview_template_endpoint(request: TemplatePreviewRequest):
    try:
        return preview_template_service(
            request.wallet_id,
            request.template_id,
            request.contract_count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
