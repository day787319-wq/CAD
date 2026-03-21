# Treasury V2 Backend (FastAPI - Pure Python)

FastAPI backend for importing main wallets via seed phrase and batch-creating multiple HD sub-wallets (e.g., input 10 to generate 10 subs with balances fetched). WETH balances included.

## Setup (Fresh Start)

1. **Clean Directory** (if any old files remain):
   In PowerShell:
   ```
   cd "C:\Users\Administrator\.openclaw\workspace\airdrop-bot\Multi-Chain-Wallet-Asset-Transaction-Automation-Platform\treasury-v2\backend"
   Remove-Item -Recurse -Force package.json node_modules src venv .env -ErrorAction SilentlyContinue
   ```

2. **Install Dependencies**:
   ```
   python -m venv venv
   venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. **Configure**:
   Copy `.env.example` to `.env` and set:
   - `MASTER_PASSPHRASE`: Strong password (20+ chars).
   - `WALLET_ACCESS_PASSPHRASE`: Separate strong password (20+ chars) used only when exporting encrypted subwallet keystores.
   - `ETHEREUM_RPC_URL`: Ethereum RPC (e.g., Infura: https://mainnet.infura.io/v3/YOUR_PROJECT_ID).
   - Optional timeout tuning: `ETH_TRANSACTION_RECEIPT_TIMEOUT_SECONDS`, `TOKEN_APPROVAL_POST_TIMEOUT_GRACE_SECONDS`, `TOKEN_SWAP_POST_TIMEOUT_GRACE_SECONDS`, `MANAGED_TOKEN_DISTRIBUTOR_DEPLOY_POST_TIMEOUT_GRACE_SECONDS`, and `FINAL_TIMEOUT_RECONCILIATION_GRACE_SECONDS` all default to `500`.

4. **Start ScyllaDB** (Local):
   - Docker: `docker run --name scylla -d -p 9042:9042 scylladb/scylla --developer-mode=1`

5. **Run Server**:
   ```
   uvicorn main:app --reload --host 0.0.0.0 --port 8006
   ```
   - Docs: http://localhost:8006/docs

## Features
- **POST /api/wallets/main/import**: Import main wallet via BIP39 seed phrase. Derives root address, fetches WETH balance + address. Encrypts/stores mnemonic.
  - Body: `{"seed_phrase": "word1 word2 ... word12"}` (12/24 English words).
  - Response: `{"id": "...", "address": "...", "weth_balance": 1.234, "weth_address": "0xC02aa..."}`

- **POST /api/wallets/sub**: Batch-create multiple HD sub-wallets from main (e.g., 10 subs at indices 0-9). Fetches WETH balance for each sub-address.
  - Body: `{"main_id": "...", "count": 10}` (count=1-100; default 1).
  - Derives subs via `m/44'/60'/0'/0/${index}`, stores encrypted child private keys with parent_id.
  - Response: `{"sub_wallets": [{"id": "...", "address": "...", "weth_balance": 0.0, "weth_address": "...", "index": 0}, ...]}`

- **GET /api/wallets/{id}**: Get single wallet info (address, type, parent_id, etc.; no keys).

- **POST /api/wallets/runs**: Creates subwallets, submits the funding transfers, and records the imported contract data using the existing saved main-wallet, subwallet, and template records.

## Security Warnings
- **Seed Phrase Input**: Extremely sensitive—use test phrases only. Prod: Implement secure upload or wallet connect.
- Encrypted storage (mnemonics/private keys) with PBKDF2-derived Fernet keys and a per-wallet random salt.
- Subwallet access uses encrypted keystore export only. Raw private keys are not returned to the browser.
- RPC: Use your own key; rate-limited.

## Notes
- **Batch Subs**: Generates sequential HD children (e.g., count=10 → indices 0-9). Each gets individual WETH balance fetch (sequential; for speed, could batch RPC).
- **Balances**: WETH on mainnet; 0 for new/unfunded addresses. For testnet, update RPC/WETH address.
- **Limits**: Max 100 subs per request to avoid overload.
- **Storage**: Mains store encrypted mnemonic; subs store encrypted child private key (for independence if main deleted).
- **Imported Contracts**: The `backend/contracts/artifacts` folder is mapped onto the existing wallet/template data model. Main wallet addresses already come from the saved wallet store, and subwallet addresses are attached when a run creates them.
- Test: Use /docs—generate a mnemonic, import, then batch subs (balances=0 initially).
