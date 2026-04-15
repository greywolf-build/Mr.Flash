# Mr. Flash

An MEV bot and terminal-style dashboard that scans Ethereum and major L2s for DEX arbitrage and NFT-liquidation opportunities, then executes them atomically using Aave V3 flash loans.

> **Status:** Educational / portfolio project demonstrating end-to-end MEV infrastructure. Deployed to Ethereum mainnet; live testing confirmed the well-documented reality that public-aggregator DEX arbitrage on major pairs is no longer profitable against professional searchers and aggregator-internal solvers (Paraswap, 1inch, CowSwap, etc.). The value of this repo is the *architecture and engineering*, not a revenue stream.

## What it does

- **Multi-chain scanning** across Ethereum, Base, Arbitrum, Optimism, and Polygon using on-chain Multicall3 batched reads — no third-party rate limits on the hot path.
- **DEX arbitrage** detection across Uniswap V2/V3, Sushiswap, Curve, and Paraswap-aggregated routes.
- **NFT liquidation** monitoring for distressed collateral positions.
- **Atomic execution** via a custom Aave V3 flash-loan receiver contract — the trade reverts if it isn't profitable.
- **Flashbots relay** submission on mainnet to avoid mempool exposure and sandwich attacks.
- **Auto-executor** with cooldowns, daily caps, and pre-flight re-quoting to kill trades whose edge has evaporated.
- **Live terminal UI** (React + WebSocket) showing opportunities, gas, wallet balance, and P&L in real time.

## Architecture

```
Mr.Flash/
├── contracts/    Solidity (Hardhat) — Aave V3 flash-loan receiver
├── backend/      Node.js + Express + WS — scanner, executor, gas/price services
└── frontend/     React + Vite + Redux — terminal-themed dashboard
```

### Contract — `GreywolfFlashLoan.sol`
Aave V3 `IFlashLoanSimpleReceiver` with two execution modes:
- `OP_DEX_ARB` — multi-hop swaps across whitelisted routers, profit captured on repay.
- `OP_NFT_LIQ` — liquidate position, sell collateral NFT, capture spread.

Ownable, with router and liquidation-target whitelists. Reverts if the flash-loan debt plus premium isn't covered by the trade proceeds.

### Backend services (`backend/services`)
| Service | Role |
|---|---|
| `MultiChainScanner` | Orchestrates per-chain scans in parallel via Multicall3 |
| `OnChainPriceReader` | Decodes V2 reserves, V3 `sqrtPriceX96`, and Curve `get_dy()` |
| `ParaswapClient` | Builds execution calldata from the Paraswap Aggregation API |
| `GasTracker` | Per-block gas price polling |
| `AutoExecutor` | Headless bot with cooldown, daily cap, and profitability gates |
| `NftMonitor` | Detects liquidation-eligible NFT positions |
| `CctpBridge` | Tracks USDC cross-chain bridge costs |

### Frontend (`frontend/src`)
Redux-managed terminal UI: `Landing` (typewriter boot), `DexArbitrage` (opportunity table), `NftLiquidations`, `GasOptimizer`, `PnLTracker`, `ChainToggleBar`.

## Getting started

### Prerequisites
- Node.js ≥ 18
- An Alchemy or Infura key for each chain you want to scan
- A funded wallet (for gas; flash loans supply the trade capital)

### Install
```bash
git clone <repo-url> Mr.Flash
cd Mr.Flash
npm install
```

### Configure
```bash
cp .env.example .env
# Fill in RPC URLs, PRIVATE_KEY, CONTRACT_ADDRESS
```

Key variables:
- `RPC_URL_ETHEREUM`, `RPC_URL_BASE`, `RPC_URL_ARBITRUM`, `RPC_URL_OPTIMISM`, `RPC_URL_POLYGON`
- `PRIVATE_KEY` — signer for execution
- `CONTRACT_ADDRESS` — deployed `GreywolfFlashLoan` address
- `FLASHBOTS_RELAY_URL` — defaults to `https://relay.flashbots.net`
- `DEX_SCAN_INTERVAL` — scan frequency in ms (default 5000)

### Compile & test the contract
```bash
npm run compile
npm run test:contracts
```

### Deploy the contract
From `contracts/`, configure Hardhat network and run the deploy script (wires up Uniswap V3, Sushiswap, and Paraswap router approvals). Set `CONTRACT_ADDRESS` in `.env` to the deployed address.

### Run the app
```bash
npm run dev
```
- Backend API: `http://localhost:3001`
- WebSocket: `ws://localhost:3002`
- Frontend: `http://localhost:5173`

## API

| Route | Description |
|---|---|
| `GET  /api/opportunities` | Current DEX arbitrage opportunities |
| `GET  /api/gas` | Per-chain gas prices |
| `POST /api/execute` | Manually execute a specific opportunity |

WebSocket channels broadcast: `gas`, `dex_opportunities`, `nft_opportunities`, `auto_execute`, `wallet_balance`.

## Safety notes

- **Test on a fork first.** Use Hardhat's mainnet forking to simulate real execution before committing capital.
- **The private key in `.env` signs real transactions.** Use a burner wallet with just enough gas — not your main account.
- **Auto-execute is off by default.** Turn it on only after verifying profitability on fork tests.
- **Cross-chain arbitrage** requires pre-positioned inventory on each chain; CCTP bridging is tracked for cost, not executed inline.
- Whitelist new routers and liquidation targets explicitly — the contract refuses unknown ones.

## What I learned building this

- **Aave V3 flash loans** — implementing `IFlashLoanSimpleReceiver`, encoding multi-op params, handling premium repayment atomically.
- **Multicall3 batching** — decoding Uniswap V2 reserves, V3 `sqrtPriceX96`, and Curve `get_dy()` in a single RPC round-trip per chain.
- **Flashbots relay** — bundle submission, private mempool, sandwich-attack mitigation.
- **Multi-chain orchestration** — parallel scanners across 5 EVM networks with independent gas tracking and RPC isolation.
- **Real-time systems** — WebSocket broadcasting, cooldown + daily-cap rate limiting, pre-flight profitability re-quoting.
- **Solidity gas optimization** — inline assembly for hot paths, router/target whitelisting, `viaIR` compilation.
- **The economic reality of MEV in 2026** — why public-aggregator arbitrage is saturated, and where retail searchers still find edges (long-tail tokens, liquidations, MEV-Share backruns, JIT liquidity).

## Possible extensions

- Pivot to liquidations (Aave, Compound, Morpho) — the contract already has scaffolding.
- MEV-Share integration for private-orderflow backruns.
- Long-tail token / new-pool sniping on chains aggregators underserve.
- Inline CCTP bridging for true cross-chain arbitrage.
- Prometheus metrics + alerting.

## License

MIT. No warranty — MEV strategies can lose money. You are responsible for your own funds and for complying with the laws of your jurisdiction.
