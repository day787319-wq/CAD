import json
import os
import shutil
import threading
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_PATH)


def ensure_private_directory(path: Path):
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass


def ensure_private_file(path: Path, default_contents: str = "{}"):
    ensure_private_directory(path.parent)
    if not path.exists():
        path.write_text(default_contents, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _path_exists(path: Path) -> bool:
    try:
        return path.exists()
    except OSError:
        return False


def prepare_private_file(path: Path, default_contents: str = "{}") -> bool:
    try:
        ensure_private_directory(path.parent)
        if _path_exists(path):
            with path.open("r+", encoding="utf-8"):
                pass
        else:
            path.write_text(default_contents, encoding="utf-8")
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        return True
    except OSError:
        return False


def resolve_local_store_path(env_name: str, default_path: Path, legacy_path: Path) -> Path:
    configured_path = os.getenv(env_name)
    path = Path(configured_path) if configured_path else default_path
    fallback_path = Path(__file__).resolve().parents[2] / ".local" / path.name

    if configured_path:
        if prepare_private_file(path):
            return path
        raise PermissionError(f"Unable to access configured store path for {env_name}: {path}")

    path_previously_existed = _path_exists(path)
    if prepare_private_file(path):
        if not path_previously_existed and legacy_path != path and _path_exists(legacy_path):
            try:
                shutil.copy2(legacy_path, path)
                try:
                    os.chmod(path, 0o600)
                except OSError:
                    pass
            except OSError:
                pass
        return path

    if legacy_path != path and _path_exists(legacy_path) and prepare_private_file(legacy_path):
        return legacy_path

    if prepare_private_file(fallback_path):
        return fallback_path

    raise PermissionError(
        f"Unable to access local store paths for {env_name}: {path}, {legacy_path}, or {fallback_path}"
    )


class LocalRow:
    def __init__(self, data: dict):
        self._data = data

    def _asdict(self):
        return dict(self._data)


class LocalResult:
    def __init__(self, row: dict | None = None, rows: list[dict] | None = None):
        self._row = row
        self._rows = rows or []

    def one(self):
        return LocalRow(self._row) if self._row is not None else None

    def all(self):
        return [LocalRow(row) for row in self._rows]


class LocalSession:
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        ensure_private_file(self.storage_path)

    def set_keyspace(self, _keyspace: str):
        return None

    def execute(self, query: str, params=None):
        normalized = " ".join(query.strip().split()).upper()
        params = params or ()

        if (
            normalized.startswith("CREATE KEYSPACE")
            or normalized.startswith("CREATE TABLE")
            or normalized.startswith("ALTER TABLE")
        ):
            return LocalResult()

        if normalized.startswith("INSERT INTO WALLETS"):
            wallet_id, wallet_type, address, encrypted_key, parent_id, created_at, derivation_index = params
            payload = self._read()
            payload[wallet_id] = {
                "id": wallet_id,
                "type": wallet_type,
                "address": address,
                "encrypted_key": encrypted_key,
                "parent_id": parent_id,
                "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
                "derivation_index": derivation_index,
            }
            self._write(payload)
            return LocalResult()

        if normalized.startswith("SELECT * FROM WALLETS WHERE ID = %S"):
            wallet_id = params[0]
            payload = self._read()
            return LocalResult(payload.get(wallet_id))

        if normalized.startswith("SELECT * FROM WALLETS WHERE PARENT_ID = %S"):
            parent_id = params[0]
            payload = self._read()
            rows = [row for row in payload.values() if row.get("parent_id") == parent_id]
            rows.sort(key=lambda row: row.get("created_at", ""))
            return LocalResult(rows=rows)

        if normalized.startswith("SELECT * FROM WALLETS"):
            payload = self._read()
            rows = list(payload.values())
            rows.sort(key=lambda row: row.get("created_at", ""), reverse=True)
            return LocalResult(rows=rows)

        if normalized.startswith("DELETE FROM WALLETS WHERE ID = %S"):
            wallet_id = params[0]
            payload = self._read()
            payload.pop(wallet_id, None)
            self._write(payload)
            return LocalResult()

        raise NotImplementedError(f"Unsupported local query: {query}")

    def _read(self) -> dict:
        return json.loads(self.storage_path.read_text(encoding="utf-8"))

    def _write(self, payload: dict):
        self.storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


class ScyllaDB:
    def __init__(self):
        self.contact_points = os.getenv("SCYLLA_CONTACT_POINTS", "127.0.0.1").split(",")
        self.port = int(os.getenv("SCYLLA_PORT", 9042))
        self.keyspace = os.getenv("SCYLLA_KEYSPACE", "treasury")
        self.cluster = None
        self.session = None
        self._keyspace_ready = False
        self.mode = "uninitialized"
        self.storage_path = resolve_local_store_path(
            "LOCAL_WALLET_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "wallet_store.json",
            Path(__file__).resolve().parents[2] / "data" / "wallet_store.json",
        )
        self.template_storage_path = resolve_local_store_path(
            "LOCAL_TEMPLATE_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "template_store.json",
            Path(__file__).resolve().parents[2] / "data" / "template_store.json",
        )
        self.template_token_storage_path = resolve_local_store_path(
            "LOCAL_TEMPLATE_TOKEN_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "template_token_store.json",
            Path(__file__).resolve().parents[2] / "data" / "template_token_store.json",
        )
        self.run_storage_path = resolve_local_store_path(
            "LOCAL_WALLET_RUN_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "wallet_run_store.json",
            Path(__file__).resolve().parents[2] / "data" / "wallet_run_store.json",
        )
        self.asset_monitor_storage_path = resolve_local_store_path(
            "LOCAL_ASSET_MONITOR_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "asset_monitor_store.json",
            Path(__file__).resolve().parents[2] / "data" / "asset_monitor_store.json",
        )
        self.balance_rule_storage_path = resolve_local_store_path(
            "LOCAL_BALANCE_RULE_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "balance_rule_store.json",
            Path(__file__).resolve().parents[2] / "data" / "balance_rule_store.json",
        )
        self._asset_monitor_lock = threading.RLock()
        self._balance_rule_lock = threading.RLock()

    def _ensure_session(self):
        if self.session is not None:
            return

        try:
            from cassandra.cluster import Cluster
            from cassandra.io.asyncioreactor import AsyncioConnection

            self.cluster = Cluster(
                contact_points=self.contact_points,
                port=self.port,
                connection_class=AsyncioConnection,
            )
            self.session = self.cluster.connect()
            self.mode = "scylla"
        except Exception as exc:
            self.session = LocalSession(self.storage_path)
            self.mode = "local"
            print(f"Scylla unavailable, using local wallet store at {self.storage_path}. Reason: {exc}")

    def connect_keyspace(self):
        if self._keyspace_ready and self.session is not None:
            return

        self._ensure_session()
        ensure_private_file(self.template_storage_path)
        ensure_private_file(self.template_token_storage_path)
        ensure_private_file(self.run_storage_path)
        ensure_private_file(self.asset_monitor_storage_path, default_contents='{"snapshots": {}, "events": []}')
        ensure_private_file(self.balance_rule_storage_path, default_contents='{"rules": {}, "events": []}')
        self.session.execute(
            f"""
            CREATE KEYSPACE IF NOT EXISTS {self.keyspace}
            WITH replication = {{ 'class': 'SimpleStrategy', 'replication_factor': 1 }}
        """
        )
        self.session.set_keyspace(self.keyspace)
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS wallets (
                id text PRIMARY KEY,
                type text,
                address text,
                encrypted_key text,
                parent_id text,
                created_at timestamp,
                derivation_index int
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS templates (
                id text PRIMARY KEY,
                name text,
                chain text,
                target_token_symbol text,
                target_token_address text,
                weth_per_subwallet text,
                slippage_percent text,
                fee_tier int,
                auto_wrap_eth boolean,
                gas_reserve_eth_per_subwallet text,
                contract_budget_eth_per_subwallet text,
                notes text,
                recipient_address text,
                testing_recipient_address text,
                return_wallet_address text,
                test_auto_execute_after_funding boolean,
                test_auto_batch_send_after_funding boolean,
                is_active boolean,
                source text,
                created_at timestamp,
                template_version text,
                gas_reserve_eth_per_contract text,
                swap_budget_eth_per_contract text,
                direct_contract_eth_per_contract text,
                direct_contract_native_eth_per_contract text,
                direct_contract_weth_per_contract text,
                auto_top_up_enabled boolean,
                auto_top_up_threshold_eth text,
                auto_top_up_target_eth text,
                auto_wrap_eth_to_weth boolean,
                swap_source_mode text,
                swap_source_token_symbol text,
                swap_source_token_address text,
                stablecoin_distribution_mode text,
                stablecoin_allocations text
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS wallet_runs (
                id text PRIMARY KEY,
                main_wallet_id text,
                main_wallet_address text,
                template_id text,
                template_name text,
                contract_count int,
                status text,
                payload_json text,
                created_at timestamp
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS asset_monitor_snapshots (
                address text PRIMARY KEY,
                updated_at timestamp,
                payload_json text
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS asset_monitor_events (
                id text PRIMARY KEY,
                address text,
                observed_at timestamp,
                payload_json text
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS balance_rules (
                id text PRIMARY KEY,
                enabled boolean,
                target_address text,
                target_wallet_id text,
                address_role text,
                mode text,
                payload_json text,
                created_at timestamp,
                updated_at timestamp
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS balance_rule_events (
                id text PRIMARY KEY,
                rule_id text,
                observed_at timestamp,
                payload_json text
            )
        """
        )
        if self.mode == "scylla":
            wallet_alter_statements = [
                "ALTER TABLE wallets ADD derivation_index int",
            ]
            for statement in wallet_alter_statements:
                try:
                    self.session.execute(statement)
                except Exception:
                    pass
            template_alter_statements = [
                "ALTER TABLE templates ADD template_version text",
                "ALTER TABLE templates ADD chain text",
                "ALTER TABLE templates ADD gas_reserve_eth_per_contract text",
                "ALTER TABLE templates ADD swap_budget_eth_per_contract text",
                "ALTER TABLE templates ADD direct_contract_eth_per_contract text",
                "ALTER TABLE templates ADD direct_contract_native_eth_per_contract text",
                "ALTER TABLE templates ADD direct_contract_weth_per_contract text",
                "ALTER TABLE templates ADD auto_top_up_enabled boolean",
                "ALTER TABLE templates ADD auto_top_up_threshold_eth text",
                "ALTER TABLE templates ADD auto_top_up_target_eth text",
                "ALTER TABLE templates ADD auto_wrap_eth_to_weth boolean",
                "ALTER TABLE templates ADD swap_source_mode text",
                "ALTER TABLE templates ADD swap_source_token_symbol text",
                "ALTER TABLE templates ADD swap_source_token_address text",
                "ALTER TABLE templates ADD stablecoin_distribution_mode text",
                "ALTER TABLE templates ADD stablecoin_allocations text",
                "ALTER TABLE templates ADD recipient_address text",
                "ALTER TABLE templates ADD testing_recipient_address text",
                "ALTER TABLE templates ADD return_wallet_address text",
                "ALTER TABLE templates ADD test_auto_execute_after_funding boolean",
                "ALTER TABLE templates ADD test_auto_batch_send_after_funding boolean",
            ]
            for statement in template_alter_statements:
                try:
                    self.session.execute(statement)
                except Exception:
                    pass
        self._keyspace_ready = True
        if self.mode == "scylla":
            print("Connected to ScyllaDB and schema created.")
        else:
            print("Local wallet store ready.")

    def _read_local_templates(self) -> dict:
        ensure_private_file(self.template_storage_path)
        return json.loads(self.template_storage_path.read_text(encoding="utf-8"))

    def _write_local_templates(self, payload: dict):
        self.template_storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _read_local_template_tokens(self) -> dict:
        ensure_private_file(self.template_token_storage_path)
        payload = json.loads(self.template_token_storage_path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}

    def _write_local_template_tokens(self, payload: dict):
        self.template_token_storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _read_local_runs(self) -> dict:
        ensure_private_file(self.run_storage_path)
        return json.loads(self.run_storage_path.read_text(encoding="utf-8"))

    def _write_local_runs(self, payload: dict):
        self.run_storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _read_local_asset_monitor_payload(self) -> dict:
        ensure_private_file(self.asset_monitor_storage_path, default_contents='{"snapshots": {}, "events": []}')
        payload = json.loads(self.asset_monitor_storage_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            payload = {}
        payload.setdefault("snapshots", {})
        payload.setdefault("events", [])
        return payload

    def _write_local_asset_monitor_payload(self, payload: dict):
        normalized = {
            "snapshots": payload.get("snapshots") or {},
            "events": payload.get("events") or [],
        }
        self.asset_monitor_storage_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")

    def _read_local_balance_rule_payload(self) -> dict:
        ensure_private_file(self.balance_rule_storage_path, default_contents='{"rules": {}, "events": []}')
        payload = json.loads(self.balance_rule_storage_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            payload = {}
        payload.setdefault("rules", {})
        payload.setdefault("events", [])
        return payload

    def _write_local_balance_rule_payload(self, payload: dict):
        normalized = {
            "rules": payload.get("rules") or {},
            "events": payload.get("events") or [],
        }
        self.balance_rule_storage_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")

    def _serialize_template_record(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        created_at = payload.get("created_at")
        if isinstance(created_at, datetime):
            payload["created_at"] = created_at.isoformat()
        return payload

    def _serialize_template_token_record(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        updated_at = payload.get("updated_at")
        if isinstance(updated_at, datetime):
            payload["updated_at"] = updated_at.isoformat()
        return payload

    def _serialize_wallet_run_record(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        created_at = payload.get("created_at")
        if isinstance(created_at, datetime):
            payload["created_at"] = created_at.isoformat()

        payload_json = payload.get("payload_json")
        if isinstance(payload_json, str):
            try:
                parsed = json.loads(payload_json)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                payload.update(parsed)
        payload.pop("payload_json", None)
        return payload

    def _serialize_asset_monitor_record(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        for field in ("updated_at", "observed_at"):
            value = payload.get(field)
            if isinstance(value, datetime):
                payload[field] = value.isoformat()

        payload_json = payload.get("payload_json")
        if isinstance(payload_json, str):
            try:
                parsed = json.loads(payload_json)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                payload.update(parsed)
        payload.pop("payload_json", None)
        return payload

    def _asset_monitor_snapshot_storage_key(self, address: str | None, chain: str | None) -> str | None:
        normalized_address = (address or "").strip().lower()
        if not normalized_address:
            return None
        normalized_chain = (chain or "ethereum_mainnet").strip().lower()
        return f"{normalized_chain}:{normalized_address}"

    def _serialize_balance_rule_record(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        for field in ("created_at", "updated_at", "last_evaluated_at", "last_triggered_at", "last_action_at"):
            value = payload.get(field)
            if isinstance(value, datetime):
                payload[field] = value.isoformat()

        payload_json = payload.get("payload_json")
        if isinstance(payload_json, str):
            try:
                parsed = json.loads(payload_json)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                payload.update(parsed)
        payload.pop("payload_json", None)
        return payload

    def _serialize_balance_rule_event(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        observed_at = payload.get("observed_at")
        if isinstance(observed_at, datetime):
            payload["observed_at"] = observed_at.isoformat()

        payload_json = payload.get("payload_json")
        if isinstance(payload_json, str):
            try:
                parsed = json.loads(payload_json)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                payload.update(parsed)
        payload.pop("payload_json", None)
        return payload

    def upsert_template(self, template: dict):
        self.connect_keyspace()
        created_at = template.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        if created_at is None:
            created_at = datetime.utcnow()

        payload = {
            "id": template["id"],
            "name": template["name"],
            "chain": template.get("chain"),
            "target_token_symbol": template["target_token_symbol"],
            "target_token_address": template["target_token_address"],
            "weth_per_subwallet": template["weth_per_subwallet"],
            "slippage_percent": template["slippage_percent"],
            "fee_tier": template.get("fee_tier"),
            "auto_wrap_eth": bool(template.get("auto_wrap_eth", True)),
            "gas_reserve_eth_per_subwallet": template["gas_reserve_eth_per_subwallet"],
            "contract_budget_eth_per_subwallet": template["contract_budget_eth_per_subwallet"],
            "notes": template.get("notes"),
            "recipient_address": template.get("recipient_address"),
            "testing_recipient_address": template.get("testing_recipient_address"),
            "return_wallet_address": template.get("return_wallet_address"),
            "test_auto_execute_after_funding": bool(template.get("test_auto_execute_after_funding", False)),
            "test_auto_batch_send_after_funding": bool(template.get("test_auto_batch_send_after_funding", False)),
            "is_active": bool(template.get("is_active", True)),
            "source": template.get("source", "library"),
            "created_at": created_at,
            "template_version": template.get("template_version"),
            "gas_reserve_eth_per_contract": template.get("gas_reserve_eth_per_contract"),
            "swap_budget_eth_per_contract": template.get("swap_budget_eth_per_contract"),
            "direct_contract_eth_per_contract": template.get("direct_contract_eth_per_contract"),
            "direct_contract_native_eth_per_contract": template.get("direct_contract_native_eth_per_contract"),
            "direct_contract_weth_per_contract": template.get("direct_contract_weth_per_contract"),
            "auto_top_up_enabled": bool(template.get("auto_top_up_enabled", False)),
            "auto_top_up_threshold_eth": template.get("auto_top_up_threshold_eth"),
            "auto_top_up_target_eth": template.get("auto_top_up_target_eth"),
            "auto_wrap_eth_to_weth": template.get("auto_wrap_eth_to_weth"),
            "swap_source_mode": template.get("swap_source_mode"),
            "swap_source_token_symbol": template.get("swap_source_token_symbol"),
            "swap_source_token_address": template.get("swap_source_token_address"),
            "stablecoin_distribution_mode": template.get("stablecoin_distribution_mode"),
            "stablecoin_allocations": template.get("stablecoin_allocations"),
        }

        if self.mode == "scylla":
            query = """
                INSERT INTO templates (
                    id,
                    name,
                    chain,
                    target_token_symbol,
                    target_token_address,
                    weth_per_subwallet,
                    slippage_percent,
                    fee_tier,
                    auto_wrap_eth,
                    gas_reserve_eth_per_subwallet,
                    contract_budget_eth_per_subwallet,
                    notes,
                    recipient_address,
                    testing_recipient_address,
                    return_wallet_address,
                    test_auto_execute_after_funding,
                    test_auto_batch_send_after_funding,
                    is_active,
                    source,
                    created_at,
                    template_version,
                    gas_reserve_eth_per_contract,
                    swap_budget_eth_per_contract,
                    direct_contract_eth_per_contract,
                    direct_contract_native_eth_per_contract,
                    direct_contract_weth_per_contract,
                    auto_top_up_enabled,
                    auto_top_up_threshold_eth,
                    auto_top_up_target_eth,
                    auto_wrap_eth_to_weth,
                    swap_source_mode,
                    swap_source_token_symbol,
                    swap_source_token_address,
                    stablecoin_distribution_mode,
                    stablecoin_allocations
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            self.session.execute(
                query,
                (
                    payload["id"],
                    payload["name"],
                    payload["chain"],
                    payload["target_token_symbol"],
                    payload["target_token_address"],
                    payload["weth_per_subwallet"],
                    payload["slippage_percent"],
                    payload["fee_tier"],
                    payload["auto_wrap_eth"],
                    payload["gas_reserve_eth_per_subwallet"],
                    payload["contract_budget_eth_per_subwallet"],
                    payload["notes"],
                    payload["recipient_address"],
                    payload["testing_recipient_address"],
                    payload["return_wallet_address"],
                    payload["test_auto_execute_after_funding"],
                    payload["test_auto_batch_send_after_funding"],
                    payload["is_active"],
                    payload["source"],
                    payload["created_at"],
                    payload["template_version"],
                    payload["gas_reserve_eth_per_contract"],
                    payload["swap_budget_eth_per_contract"],
                    payload["direct_contract_eth_per_contract"],
                    payload["direct_contract_native_eth_per_contract"],
                    payload["direct_contract_weth_per_contract"],
                    payload["auto_top_up_enabled"],
                    payload["auto_top_up_threshold_eth"],
                    payload["auto_top_up_target_eth"],
                    payload["auto_wrap_eth_to_weth"],
                    payload["swap_source_mode"],
                    payload["swap_source_token_symbol"],
                    payload["swap_source_token_address"],
                    payload["stablecoin_distribution_mode"],
                    payload["stablecoin_allocations"],
                ),
            )
            return self._serialize_template_record(payload)

        local_payload = self._read_local_templates()
        local_payload[payload["id"]] = {
            **payload,
            "created_at": payload["created_at"].isoformat(),
        }
        self._write_local_templates(local_payload)
        return self._serialize_template_record(local_payload[payload["id"]])

    def get_template(self, template_id: str):
        self.connect_keyspace()

        if self.mode == "scylla":
            query = "SELECT * FROM templates WHERE id = %s"
            rows = self.session.execute(query, (template_id,))
            row = rows.one()
            return self._serialize_template_record(dict(row._asdict())) if row else None

        payload = self._read_local_templates()
        return self._serialize_template_record(payload.get(template_id))

    def list_templates(self):
        self.connect_keyspace()

        if self.mode == "scylla":
            rows = self.session.execute("SELECT * FROM templates")
            templates = [self._serialize_template_record(dict(row._asdict())) for row in rows.all()]
        else:
            payload = self._read_local_templates()
            templates = [self._serialize_template_record(record) for record in payload.values()]

        templates.sort(key=lambda item: item.get("created_at") or "", reverse=True)
        return templates

    def get_template_token(self, chain: str, address: str):
        self.connect_keyspace()
        normalized_chain = (chain or "").strip().lower()
        normalized_address = (address or "").strip().lower()
        if not normalized_chain or not normalized_address:
            return None

        payload = self._read_local_template_tokens()
        chain_payload = payload.get(normalized_chain) or {}
        return self._serialize_template_token_record(chain_payload.get(normalized_address))

    def upsert_template_token(self, token_record: dict):
        self.connect_keyspace()
        normalized_chain = (token_record.get("chain") or "").strip().lower()
        normalized_address = (token_record.get("address") or "").strip().lower()
        if not normalized_chain or not normalized_address:
            raise ValueError("Template token chain and address are required")

        updated_at = token_record.get("updated_at")
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        if updated_at is None:
            updated_at = datetime.utcnow()

        payload = self._read_local_template_tokens()
        chain_payload = payload.setdefault(normalized_chain, {})
        existing = chain_payload.get(normalized_address) or {}
        chain_payload[normalized_address] = {
            **existing,
            **token_record,
            "chain": normalized_chain,
            "address": token_record.get("address"),
            "is_custom": bool(token_record.get("is_custom", existing.get("is_custom", False))),
            "updated_at": updated_at.isoformat(),
        }
        self._write_local_template_tokens(payload)
        return self._serialize_template_token_record(chain_payload[normalized_address])

    def list_template_tokens(self, chain: str | None = None):
        self.connect_keyspace()
        payload = self._read_local_template_tokens()
        normalized_chain = (chain or "").strip().lower()

        if normalized_chain:
            chain_payload = payload.get(normalized_chain) or {}
            return [self._serialize_template_token_record(record) for record in chain_payload.values()]

        tokens = []
        for chain_payload in payload.values():
            tokens.extend(self._serialize_template_token_record(record) for record in chain_payload.values())
        return tokens

    def delete_template_token(self, chain: str, address: str):
        self.connect_keyspace()
        normalized_chain = (chain or "").strip().lower()
        normalized_address = (address or "").strip().lower()
        if not normalized_chain or not normalized_address:
            return None

        payload = self._read_local_template_tokens()
        chain_payload = payload.get(normalized_chain) or {}
        record = chain_payload.pop(normalized_address, None)
        if record is None:
            return None
        if not chain_payload and normalized_chain in payload:
            payload.pop(normalized_chain, None)
        self._write_local_template_tokens(payload)
        return self._serialize_template_token_record(record)

    def upsert_wallet_run(self, run_record: dict):
        self.connect_keyspace()
        created_at = run_record.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        if created_at is None:
            created_at = datetime.utcnow()

        payload = {
            **run_record,
            "created_at": created_at,
        }

        if self.mode == "scylla":
            query = """
                INSERT INTO wallet_runs (
                    id,
                    main_wallet_id,
                    main_wallet_address,
                    template_id,
                    template_name,
                    contract_count,
                    status,
                    payload_json,
                    created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            self.session.execute(
                query,
                (
                    payload["id"],
                    payload.get("main_wallet_id"),
                    payload.get("main_wallet_address"),
                    payload.get("template_id"),
                    payload.get("template_name"),
                    payload.get("contract_count"),
                    payload.get("status"),
                    json.dumps({**payload, "created_at": created_at.isoformat()}),
                    created_at,
                ),
            )
            return self._serialize_wallet_run_record(payload)

        local_payload = self._read_local_runs()
        local_payload[payload["id"]] = {
            **payload,
            "created_at": created_at.isoformat(),
        }
        self._write_local_runs(local_payload)
        return self._serialize_wallet_run_record(local_payload[payload["id"]])

    def list_wallet_runs(self, main_wallet_id: str | None = None):
        self.connect_keyspace()

        if self.mode == "scylla":
            if main_wallet_id:
                rows = self.session.execute(
                    "SELECT * FROM wallet_runs WHERE main_wallet_id = %s ALLOW FILTERING",
                    (main_wallet_id,),
                )
            else:
                rows = self.session.execute("SELECT * FROM wallet_runs")
            run_records = [self._serialize_wallet_run_record(dict(row._asdict())) for row in rows.all()]
        else:
            payload = self._read_local_runs()
            run_records = [self._serialize_wallet_run_record(record) for record in payload.values()]
            if main_wallet_id:
                run_records = [record for record in run_records if record.get("main_wallet_id") == main_wallet_id]

        run_records.sort(key=lambda item: item.get("created_at") or "", reverse=True)
        return run_records

    def delete_wallet_run(self, run_id: str):
        self.connect_keyspace()

        if self.mode == "scylla":
            row = self.session.execute("SELECT * FROM wallet_runs WHERE id = %s", (run_id,)).one()
            if row is None:
                return None
            record = self._serialize_wallet_run_record(dict(row._asdict()))
            self.session.execute("DELETE FROM wallet_runs WHERE id = %s", (run_id,))
            return record

        payload = self._read_local_runs()
        record = payload.pop(run_id, None)
        if record is None:
            return None
        self._write_local_runs(payload)
        return self._serialize_wallet_run_record(record)

    def delete_wallet_runs_for_main(self, main_wallet_id: str):
        self.connect_keyspace()
        runs = self.list_wallet_runs(main_wallet_id=main_wallet_id)
        if self.mode == "scylla":
            for run in runs:
                self.session.execute("DELETE FROM wallet_runs WHERE id = %s", (run["id"],))
            return len(runs)

        payload = self._read_local_runs()
        deleted = 0
        for run in runs:
            if payload.pop(run["id"], None) is not None:
                deleted += 1
        self._write_local_runs(payload)
        return deleted

    def upsert_asset_monitor_snapshot(self, snapshot: dict):
        self.connect_keyspace()
        payload = dict(snapshot)
        updated_at = payload.get("updated_at")
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        if updated_at is None:
            updated_at = datetime.utcnow()
        payload["updated_at"] = updated_at
        storage_key = self._asset_monitor_snapshot_storage_key(payload.get("address"), payload.get("chain"))
        if not storage_key:
            raise ValueError("Snapshot address is required")

        if self.mode == "scylla":
            self.session.execute(
                """
                    INSERT INTO asset_monitor_snapshots (address, updated_at, payload_json)
                    VALUES (%s, %s, %s)
                """,
                (
                    storage_key,
                    updated_at,
                    json.dumps({**payload, "updated_at": updated_at.isoformat()}),
                ),
            )
            return self._serialize_asset_monitor_record(payload)

        with self._asset_monitor_lock:
            local_payload = self._read_local_asset_monitor_payload()
            local_payload["snapshots"][storage_key] = {
                **payload,
                "updated_at": updated_at.isoformat(),
            }
            self._write_local_asset_monitor_payload(local_payload)
            return self._serialize_asset_monitor_record(local_payload["snapshots"][storage_key])

    def list_asset_monitor_snapshots(self, addresses: list[str] | None = None, chain: str | None = None):
        self.connect_keyspace()
        normalized_addresses = {address.lower() for address in (addresses or []) if address}
        normalized_chain = (chain or "").strip().lower()

        if self.mode == "scylla":
            rows = self.session.execute("SELECT * FROM asset_monitor_snapshots")
            snapshots = [self._serialize_asset_monitor_record(dict(row._asdict())) for row in rows.all()]
        else:
            with self._asset_monitor_lock:
                payload = self._read_local_asset_monitor_payload()
            snapshots = [self._serialize_asset_monitor_record(record) for record in payload.get("snapshots", {}).values()]

        if normalized_chain:
            snapshots = [snapshot for snapshot in snapshots if str(snapshot.get("chain") or "").strip().lower() == normalized_chain]
        if normalized_addresses:
            snapshots = [snapshot for snapshot in snapshots if (snapshot.get("address") or "").lower() in normalized_addresses]

        deduped_snapshots: dict[str, dict] = {}
        for snapshot in snapshots:
            dedupe_key = self._asset_monitor_snapshot_storage_key(snapshot.get("address"), snapshot.get("chain"))
            if not dedupe_key:
                continue
            current = deduped_snapshots.get(dedupe_key)
            current_updated_at = str(current.get("updated_at") or "") if current else ""
            candidate_updated_at = str(snapshot.get("updated_at") or "")
            if current is None or candidate_updated_at >= current_updated_at:
                deduped_snapshots[dedupe_key] = snapshot

        snapshots = list(deduped_snapshots.values())
        snapshots.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        return snapshots

    def append_asset_monitor_event(self, event: dict):
        self.connect_keyspace()
        payload = dict(event)
        observed_at = payload.get("observed_at")
        if isinstance(observed_at, str):
            observed_at = datetime.fromisoformat(observed_at)
        if observed_at is None:
            observed_at = datetime.utcnow()
        payload["observed_at"] = observed_at

        if self.mode == "scylla":
            self.session.execute(
                """
                    INSERT INTO asset_monitor_events (id, address, observed_at, payload_json)
                    VALUES (%s, %s, %s, %s)
                """,
                (
                    payload["id"],
                    payload["address"],
                    observed_at,
                    json.dumps({**payload, "observed_at": observed_at.isoformat()}),
                ),
            )
            return self._serialize_asset_monitor_record(payload)

        with self._asset_monitor_lock:
            local_payload = self._read_local_asset_monitor_payload()
            local_payload.setdefault("events", []).append(
                {
                    **payload,
                    "observed_at": observed_at.isoformat(),
                }
            )
            local_payload["events"] = sorted(
                local_payload["events"],
                key=lambda item: item.get("observed_at") or "",
                reverse=True,
            )[:1000]
            self._write_local_asset_monitor_payload(local_payload)
            return self._serialize_asset_monitor_record(local_payload["events"][0])

    def list_asset_monitor_events(self, addresses: list[str] | None = None, limit: int = 100, chain: str | None = None):
        self.connect_keyspace()
        normalized_addresses = {address.lower() for address in (addresses or []) if address}
        normalized_chain = (chain or "").strip().lower()

        if self.mode == "scylla":
            rows = self.session.execute("SELECT * FROM asset_monitor_events")
            events = [self._serialize_asset_monitor_record(dict(row._asdict())) for row in rows.all()]
        else:
            with self._asset_monitor_lock:
                payload = self._read_local_asset_monitor_payload()
            events = [self._serialize_asset_monitor_record(record) for record in payload.get("events", [])]

        if normalized_chain:
            events = [event for event in events if str(event.get("chain") or "").strip().lower() == normalized_chain]
        if normalized_addresses:
            events = [event for event in events if (event.get("address") or "").lower() in normalized_addresses]
        events.sort(key=lambda item: item.get("observed_at") or "", reverse=True)
        return events[: max(int(limit), 0)]

    def upsert_balance_rule(self, rule: dict):
        self.connect_keyspace()
        created_at = rule.get("created_at")
        updated_at = rule.get("updated_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        if created_at is None:
            created_at = datetime.utcnow()
        if updated_at is None:
            updated_at = datetime.utcnow()

        payload = {
            **rule,
            "created_at": created_at,
            "updated_at": updated_at,
        }

        if self.mode == "scylla":
            self.session.execute(
                """
                    INSERT INTO balance_rules (
                        id,
                        enabled,
                        target_address,
                        target_wallet_id,
                        address_role,
                        mode,
                        payload_json,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    payload["id"],
                    bool(payload.get("enabled", True)),
                    payload.get("target_address"),
                    payload.get("target_wallet_id"),
                    payload.get("address_role"),
                    payload.get("mode"),
                    json.dumps(
                        {
                            **payload,
                            "created_at": created_at.isoformat(),
                            "updated_at": updated_at.isoformat(),
                        }
                    ),
                    created_at,
                    updated_at,
                ),
            )
            return self._serialize_balance_rule_record(payload)

        with self._balance_rule_lock:
            local_payload = self._read_local_balance_rule_payload()
            local_payload["rules"][payload["id"]] = {
                **payload,
                "created_at": created_at.isoformat(),
                "updated_at": updated_at.isoformat(),
            }
            self._write_local_balance_rule_payload(local_payload)
            return self._serialize_balance_rule_record(local_payload["rules"][payload["id"]])

    def get_balance_rule(self, rule_id: str):
        self.connect_keyspace()

        if self.mode == "scylla":
            rows = self.session.execute("SELECT * FROM balance_rules WHERE id = %s", (rule_id,))
            row = rows.one()
            return self._serialize_balance_rule_record(dict(row._asdict())) if row else None

        with self._balance_rule_lock:
            payload = self._read_local_balance_rule_payload()
        return self._serialize_balance_rule_record(payload["rules"].get(rule_id))

    def list_balance_rules(self):
        self.connect_keyspace()

        if self.mode == "scylla":
            rows = self.session.execute("SELECT * FROM balance_rules")
            rules = [self._serialize_balance_rule_record(dict(row._asdict())) for row in rows.all()]
        else:
            with self._balance_rule_lock:
                payload = self._read_local_balance_rule_payload()
            rules = [self._serialize_balance_rule_record(record) for record in payload.get("rules", {}).values()]

        rules.sort(
            key=lambda item: (
                item.get("updated_at") or item.get("created_at") or "",
                item.get("id") or "",
            ),
            reverse=True,
        )
        return rules

    def delete_balance_rule(self, rule_id: str):
        self.connect_keyspace()

        if self.mode == "scylla":
            existing = self.get_balance_rule(rule_id)
            if not existing:
                return None
            self.session.execute("DELETE FROM balance_rules WHERE id = %s", (rule_id,))
            return existing

        with self._balance_rule_lock:
            payload = self._read_local_balance_rule_payload()
            removed = payload["rules"].pop(rule_id, None)
            self._write_local_balance_rule_payload(payload)
        return self._serialize_balance_rule_record(removed)

    def append_balance_rule_event(self, event: dict):
        self.connect_keyspace()
        payload = dict(event)
        observed_at = payload.get("observed_at")
        if isinstance(observed_at, str):
            observed_at = datetime.fromisoformat(observed_at)
        if observed_at is None:
            observed_at = datetime.utcnow()
        payload["observed_at"] = observed_at

        if self.mode == "scylla":
            self.session.execute(
                """
                    INSERT INTO balance_rule_events (id, rule_id, observed_at, payload_json)
                    VALUES (%s, %s, %s, %s)
                """,
                (
                    payload["id"],
                    payload["rule_id"],
                    observed_at,
                    json.dumps({**payload, "observed_at": observed_at.isoformat()}),
                ),
            )
            return self._serialize_balance_rule_event(payload)

        with self._balance_rule_lock:
            local_payload = self._read_local_balance_rule_payload()
            local_payload.setdefault("events", []).append(
                {
                    **payload,
                    "observed_at": observed_at.isoformat(),
                }
            )
            local_payload["events"] = sorted(
                local_payload["events"],
                key=lambda item: item.get("observed_at") or "",
                reverse=True,
            )[:5000]
            self._write_local_balance_rule_payload(local_payload)
            return self._serialize_balance_rule_event(local_payload["events"][0])

    def list_balance_rule_events(self, rule_id: str | None = None, limit: int = 100):
        self.connect_keyspace()

        if self.mode == "scylla":
            rows = self.session.execute("SELECT * FROM balance_rule_events")
            events = [self._serialize_balance_rule_event(dict(row._asdict())) for row in rows.all()]
        else:
            with self._balance_rule_lock:
                payload = self._read_local_balance_rule_payload()
            events = [self._serialize_balance_rule_event(record) for record in payload.get("events", [])]

        if rule_id:
            events = [event for event in events if event.get("rule_id") == rule_id]
        events.sort(key=lambda item: item.get("observed_at") or "", reverse=True)
        return events[: max(int(limit), 0)]


db = ScyllaDB()
