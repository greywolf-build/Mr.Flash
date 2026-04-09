import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import http from "http";

import opportunitiesRouter from "./routes/opportunities.js";
import executeRouter from "./routes/execute.js";
import gasRouter from "./routes/gas.js";
import { DexScanner } from "./services/dexScanner.js";
import { NftMonitor } from "./services/nftMonitor.js";
import { GasTracker } from "./services/gasTracker.js";
import { ParaswapClient } from "./services/paraswapClient.js";
import { MultiChainScanner } from "./services/multiChainScanner.js";
import { CctpBridge } from "./services/cctpBridge.js";
import { AutoExecutor } from "./services/autoExecutor.js";
import { registerService } from "./services/registry.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// REST routes
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/execute", executeRouter);
app.use("/api/gas", gasRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// HTTP + WebSocket on same port
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Services
const gasTracker = new GasTracker();

const paraswapRate = parseInt(process.env.PARASWAP_RATE_LIMIT || "1", 10);
const dexScanInterval = parseInt(process.env.DEX_SCAN_INTERVAL || "5000", 10);

const paraswapClient = new ParaswapClient(paraswapRate);
const dexScanner = new DexScanner(paraswapClient);

const multiChainScanner = new MultiChainScanner();
const cctpBridge = new CctpBridge();
const autoExecutor = new AutoExecutor(multiChainScanner);

const nftMonitor = new NftMonitor();

// Register services so routes can access the same instances
registerService("gasTracker", gasTracker);
registerService("nftMonitor", nftMonitor);
registerService("dexScanner", dexScanner);
registerService("paraswapClient", paraswapClient);
registerService("multiChainScanner", multiChainScanner);
registerService("cctpBridge", cctpBridge);

// Broadcast helper
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

// Service loops
async function startServices() {
  console.log("[greywolf] Starting services...");

  // Gas price updates every 12s (each block)
  gasTracker.on("update", (gasData) => broadcast("gas", gasData));
  gasTracker.start(12_000);

  // Legacy DexScanner — NOT started; kept only so the REST endpoint
  // GET /api/opportunities/dex can still read dexScanner.latest.
  // The MultiChainScanner handles all scanning + WS broadcasting now.

  // Auto-executor events → WS
  autoExecutor.on("auto_execute", (data) => broadcast("auto_execute", data));

  // Multi-chain scanner — primary WS broadcast source
  multiChainScanner.on("opportunities", (opps) => broadcast("dex_opportunities", opps));
  multiChainScanner.on("gas", (gasData) => broadcast("multichain_gas", gasData));
  multiChainScanner.on("balances", (balData) => broadcast("wallet_balances", balData));
  await multiChainScanner.start(dexScanInterval);

  // NFT monitor every 15s
  nftMonitor.on("opportunities", (opps) => broadcast("nft_opportunities", opps));
  nftMonitor.start(15_000);

  console.log("[greywolf] All services running");
}

wss.on("connection", (ws) => {
  console.log("[ws] Client connected");
  // Send current state on connect
  ws.send(JSON.stringify({ type: "gas", data: gasTracker.latest, ts: Date.now() }));
  ws.send(JSON.stringify({ type: "dex_opportunities", data: multiChainScanner.latest, ts: Date.now() }));
  ws.send(JSON.stringify({ type: "nft_opportunities", data: nftMonitor.latest, ts: Date.now() }));
  ws.send(JSON.stringify({ type: "auto_execute_state", data: autoExecutor.getState(), ts: Date.now() }));

  // Bidirectional: handle incoming messages from frontend
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "set_active_chains":
          if (Array.isArray(msg.data)) {
            multiChainScanner.setActiveChains(msg.data.map(Number)).catch(
              (err) => console.warn("[ws] setActiveChains error:", err.message)
            );
          }
          break;
        case "set_auto_execute":
          autoExecutor.setEnabled(msg.data?.enabled);
          broadcast("auto_execute_state", autoExecutor.getState());
          break;
      }
    } catch {
      // ignore malformed messages
    }
  });
});

server.listen(PORT, () => {
  console.log(`[greywolf] Terminal backend on http://localhost:${PORT}`);
  startServices().catch(console.error);
});
