from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from src.services.balance_rule_service import (
    create_balance_rule as create_balance_rule_service,
    delete_balance_rule as delete_balance_rule_service,
    evaluate_balance_rules as evaluate_balance_rules_service,
    get_balance_rule as get_balance_rule_service,
    list_balance_rule_events as list_balance_rule_events_service,
    list_balance_rules as list_balance_rules_service,
    update_balance_rule as update_balance_rule_service,
)


router = APIRouter(prefix="/api/balance-rules", tags=["balance-rules"])


class BalanceRuleUpsertRequest(BaseModel):
    name: str | None = None
    enabled: bool = True
    asset_symbol: str = "ETH"
    address_role: str
    mode: str = "monitor_only"
    target_wallet_id: str | None = None
    target_address: str | None = None
    min_balance: str
    target_balance: str | None = None
    source_wallet_id: str | None = None
    source_min_reserve: str = "0"
    cooldown_seconds: int = 900
    max_top_up_amount: str | None = None
    daily_top_up_cap: str | None = None
    pending_tx_lock: bool = True
    notes: str | None = None


@router.get("")
async def list_balance_rules_endpoint():
    try:
        return {"rules": list_balance_rules_service()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/evaluate")
async def evaluate_balance_rules_endpoint(sync: bool = Query(True)):
    try:
        return evaluate_balance_rules_service(sync_monitoring=sync)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("")
async def create_balance_rule_endpoint(request: BalanceRuleUpsertRequest):
    try:
        return create_balance_rule_service(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{rule_id}")
async def get_balance_rule_endpoint(rule_id: str):
    try:
        rule = get_balance_rule_service(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Balance rule not found")
        return rule
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/{rule_id}")
async def update_balance_rule_endpoint(rule_id: str, request: BalanceRuleUpsertRequest):
    try:
        return update_balance_rule_service(rule_id, request.model_dump())
    except ValueError as exc:
        status_code = 404 if str(exc) == "Balance rule not found" else 400
        raise HTTPException(status_code=status_code, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/{rule_id}")
async def delete_balance_rule_endpoint(rule_id: str):
    try:
        return delete_balance_rule_service(rule_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{rule_id}/events")
async def list_balance_rule_events_endpoint(
    rule_id: str,
    limit: int = Query(50, ge=0, le=200),
):
    try:
        rule = get_balance_rule_service(rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Balance rule not found")
        return {"events": list_balance_rule_events_service(rule_id, limit=limit)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
