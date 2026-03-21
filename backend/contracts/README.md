# Imported Contracts

This folder contains the Solidity artifacts imported from the other project.

Current integration in this app:
- `MainWalletRegistry`: mapped to the saved main-wallet records already stored by the app
- `SubWalletRegistry`: mapped to the subwallet batch created during each run
- `TokenConfigRegistry`: mapped to the selected template's stablecoin token list
- `ManagedTokenDistributor`: artifact kept available, but not yet mapped to a deployable payload in this project

How this project uses the artifacts:
- The backend loads the ABI and bytecode directly from `artifacts/src/.../*.json`
- The plan tab still shows the fast local funding preview
- The review step shows how the imported contract data maps onto the saved main wallet, future subwallet batch, and template token config
- The final `Run` call stores that imported-contract snapshot alongside the funded run
