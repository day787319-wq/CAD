import json
import os
import shutil
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


def resolve_local_store_path(env_name: str, default_path: Path, legacy_path: Path) -> Path:
    configured_path = os.getenv(env_name)
    path = Path(configured_path) if configured_path else default_path

    if not configured_path and not path.exists() and legacy_path.exists():
        ensure_private_directory(path.parent)
        shutil.copy2(legacy_path, path)

    ensure_private_file(path)
    return path


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
            wallet_id, wallet_type, address, encrypted_key, parent_id, created_at = params
            payload = self._read()
            payload[wallet_id] = {
                "id": wallet_id,
                "type": wallet_type,
                "address": address,
                "encrypted_key": encrypted_key,
                "parent_id": parent_id,
                "created_at": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
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
        self.run_storage_path = resolve_local_store_path(
            "LOCAL_WALLET_RUN_STORE",
            Path(__file__).resolve().parents[2] / "runtime" / "wallet_run_store.json",
            Path(__file__).resolve().parents[2] / "data" / "wallet_run_store.json",
        )

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
        ensure_private_file(self.run_storage_path)
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
                created_at timestamp
            )
        """
        )
        self.session.execute(
            """
            CREATE TABLE IF NOT EXISTS templates (
                id text PRIMARY KEY,
                name text,
                target_token_symbol text,
                target_token_address text,
                weth_per_subwallet text,
                slippage_percent text,
                fee_tier int,
                auto_wrap_eth boolean,
                gas_reserve_eth_per_subwallet text,
                contract_budget_eth_per_subwallet text,
                notes text,
                is_active boolean,
                source text,
                created_at timestamp,
                template_version text,
                gas_reserve_eth_per_contract text,
                swap_budget_eth_per_contract text,
                direct_contract_eth_per_contract text,
                direct_contract_weth_per_contract text,
                auto_wrap_eth_to_weth boolean,
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
        if self.mode == "scylla":
            template_alter_statements = [
                "ALTER TABLE templates ADD template_version text",
                "ALTER TABLE templates ADD gas_reserve_eth_per_contract text",
                "ALTER TABLE templates ADD swap_budget_eth_per_contract text",
                "ALTER TABLE templates ADD direct_contract_eth_per_contract text",
                "ALTER TABLE templates ADD direct_contract_weth_per_contract text",
                "ALTER TABLE templates ADD auto_wrap_eth_to_weth boolean",
                "ALTER TABLE templates ADD stablecoin_distribution_mode text",
                "ALTER TABLE templates ADD stablecoin_allocations text",
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

    def _read_local_runs(self) -> dict:
        ensure_private_file(self.run_storage_path)
        return json.loads(self.run_storage_path.read_text(encoding="utf-8"))

    def _write_local_runs(self, payload: dict):
        self.run_storage_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _serialize_template_record(self, record: dict | None):
        if record is None:
            return None

        payload = dict(record)
        created_at = payload.get("created_at")
        if isinstance(created_at, datetime):
            payload["created_at"] = created_at.isoformat()
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
            "target_token_symbol": template["target_token_symbol"],
            "target_token_address": template["target_token_address"],
            "weth_per_subwallet": template["weth_per_subwallet"],
            "slippage_percent": template["slippage_percent"],
            "fee_tier": template.get("fee_tier"),
            "auto_wrap_eth": bool(template.get("auto_wrap_eth", True)),
            "gas_reserve_eth_per_subwallet": template["gas_reserve_eth_per_subwallet"],
            "contract_budget_eth_per_subwallet": template["contract_budget_eth_per_subwallet"],
            "notes": template.get("notes"),
            "is_active": bool(template.get("is_active", True)),
            "source": template.get("source", "library"),
            "created_at": created_at,
            "template_version": template.get("template_version"),
            "gas_reserve_eth_per_contract": template.get("gas_reserve_eth_per_contract"),
            "swap_budget_eth_per_contract": template.get("swap_budget_eth_per_contract"),
            "direct_contract_eth_per_contract": template.get("direct_contract_eth_per_contract"),
            "direct_contract_weth_per_contract": template.get("direct_contract_weth_per_contract"),
            "auto_wrap_eth_to_weth": template.get("auto_wrap_eth_to_weth"),
            "stablecoin_distribution_mode": template.get("stablecoin_distribution_mode"),
            "stablecoin_allocations": template.get("stablecoin_allocations"),
        }

        if self.mode == "scylla":
            query = """
                INSERT INTO templates (
                    id,
                    name,
                    target_token_symbol,
                    target_token_address,
                    weth_per_subwallet,
                    slippage_percent,
                    fee_tier,
                    auto_wrap_eth,
                    gas_reserve_eth_per_subwallet,
                    contract_budget_eth_per_subwallet,
                    notes,
                    is_active,
                    source,
                    created_at,
                    template_version,
                    gas_reserve_eth_per_contract,
                    swap_budget_eth_per_contract,
                    direct_contract_eth_per_contract,
                    direct_contract_weth_per_contract,
                    auto_wrap_eth_to_weth,
                    stablecoin_distribution_mode,
                    stablecoin_allocations
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            self.session.execute(
                query,
                (
                    payload["id"],
                    payload["name"],
                    payload["target_token_symbol"],
                    payload["target_token_address"],
                    payload["weth_per_subwallet"],
                    payload["slippage_percent"],
                    payload["fee_tier"],
                    payload["auto_wrap_eth"],
                    payload["gas_reserve_eth_per_subwallet"],
                    payload["contract_budget_eth_per_subwallet"],
                    payload["notes"],
                    payload["is_active"],
                    payload["source"],
                    payload["created_at"],
                    payload["template_version"],
                    payload["gas_reserve_eth_per_contract"],
                    payload["swap_budget_eth_per_contract"],
                    payload["direct_contract_eth_per_contract"],
                    payload["direct_contract_weth_per_contract"],
                    payload["auto_wrap_eth_to_weth"],
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


db = ScyllaDB()
