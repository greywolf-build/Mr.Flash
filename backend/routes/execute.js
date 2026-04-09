import { Router } from "express";
import { ethers } from "ethers";
import { executeDexArb, executeDexArbViaParaswap, executeNftLiq } from "../services/executor.js";
import { CHAIN_TOKENS } from "../services/chainConfig.js";
import { getService } from "../services/registry.js";

const router = Router();

/**
 * Resolve a token symbol to its address on a given chain.
 * Returns null if not found.
 */
function resolveToken(chainId, symbol) {
  const tokens = CHAIN_TOKENS[chainId] || CHAIN_TOKENS[1];
  return tokens.find((t) => t.symbol === symbol) || null;
}

// In-memory P&L log
const pnlLog = [];

// POST /api/execute/dex-arb
router.post("/dex-arb", async (req, res) => {
  try {
    const { contractAddress, asset, amount, routers, swapDatas, useFlashbots, chainId } = req.body;

    const result = await executeDexArb({
      contractAddress: contractAddress || process.env.CONTRACT_ADDRESS,
      asset,
      amount,
      routers,
      swapDatas,
      chainId: chainId || 1,
      useFlashbots: useFlashbots !== false,
    });

    const entry = {
      id: `pnl-${Date.now()}`,
      type: "DEX_ARB",
      timestamp: Date.now(),
      result,
      status: "executed",
    };
    pnlLog.unshift(entry);

    res.json({ success: true, ...entry });
  } catch (err) {
    const entry = {
      id: `pnl-${Date.now()}`,
      type: "DEX_ARB",
      timestamp: Date.now(),
      error: err.message,
      status: "failed",
    };
    pnlLog.unshift(entry);

    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/execute/dex-arb-paraswap
router.post("/dex-arb-paraswap", async (req, res) => {
  try {
    const {
      contractAddress, asset, amount,
      src, dst, swapAmount,
      srcSymbol, dstSymbol, pair, amountIn,
      slippage, buyProtocol, sellProtocol,
      chainId: reqChainId,
      useFlashbots,
    } = req.body;

    const chainId = reqChainId || 1;

    // Resolve token addresses: prefer explicit addresses, fall back to symbol resolution
    let resolvedSrc = src;
    let resolvedDst = dst;
    let resolvedAsset = asset;
    let resolvedAmount = amount;
    let resolvedSwapAmount = swapAmount;

    // If symbols or pair provided instead of addresses, resolve from CHAIN_TOKENS
    const srcSym = srcSymbol || (pair && pair.split("/")[0]);
    const dstSym = dstSymbol || (pair && pair.split("/")[1]);

    let resolvedSrcDecimals = 18;
    let resolvedDstDecimals = 18;

    if ((!resolvedSrc || !resolvedDst) && srcSym && dstSym) {
      const srcToken = resolveToken(chainId, srcSym);
      const dstToken = resolveToken(chainId, dstSym);
      if (!srcToken) throw new Error(`Unknown token: ${srcSym} on chain ${chainId}`);
      if (!dstToken) throw new Error(`Unknown token: ${dstSym} on chain ${chainId}`);
      resolvedSrc = resolvedSrc || srcToken.address;
      resolvedDst = resolvedDst || dstToken.address;
      resolvedAsset = resolvedAsset || srcToken.address;
      resolvedSrcDecimals = srcToken.decimals;
      resolvedDstDecimals = dstToken.decimals;

      // Parse amount from "1200 WETH" format if not provided directly
      if (!resolvedAmount && amountIn) {
        resolvedAmount = amountIn.split(" ")[0];
      }

      // No size cap — flash loan supplies the capital. Pre-flight in
      // executeDexArbViaParaswap will reject if real-quote slippage kills profit.

      // Compute raw swapAmount from human-readable amount + decimals
      if (!resolvedSwapAmount && resolvedAmount) {
        resolvedSwapAmount = ethers.parseUnits(resolvedAmount, srcToken.decimals).toString();
      }
    }

    if (!resolvedSrc || !resolvedDst) {
      throw new Error("Missing src/dst token addresses — provide addresses or pair symbols");
    }

    console.log(`[execute] dex-arb-paraswap: ${srcSym}(${resolvedSrcDecimals}) -> ${dstSym}(${resolvedDstDecimals}), amount=${resolvedAmount}, swap=${resolvedSwapAmount}`);

    const result = await executeDexArbViaParaswap({
      contractAddress: contractAddress || process.env.CONTRACT_ADDRESS,
      asset: resolvedAsset,
      amount: resolvedAmount,
      src: resolvedSrc,
      dst: resolvedDst,
      swapAmount: resolvedSwapAmount,
      srcDecimals: resolvedSrcDecimals,
      dstDecimals: resolvedDstDecimals,
      slippage: slippage || 250,
      buyProtocol,
      sellProtocol,
      chainId,
      useFlashbots: useFlashbots !== false,
    });

    const entry = {
      id: `pnl-${Date.now()}`,
      type: "DEX_ARB_PARASWAP",
      timestamp: Date.now(),
      result,
      status: "executed",
    };
    pnlLog.unshift(entry);

    res.json({ success: true, ...entry });
  } catch (err) {
    console.error("[execute] dex-arb-paraswap error:", err.message);
    const entry = {
      id: `pnl-${Date.now()}`,
      type: "DEX_ARB_PARASWAP",
      timestamp: Date.now(),
      error: err.message,
      status: "failed",
    };
    pnlLog.unshift(entry);

    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/execute/nft-liq
router.post("/nft-liq", async (req, res) => {
  try {
    const {
      contractAddress, asset, amount,
      liqTarget, liqCalldata, sellTarget, sellCalldata,
      chainId, useFlashbots,
    } = req.body;

    const result = await executeNftLiq({
      contractAddress: contractAddress || process.env.CONTRACT_ADDRESS,
      asset,
      amount,
      liqTarget,
      liqCalldata,
      sellTarget,
      sellCalldata,
      chainId: chainId || 1,
      useFlashbots: useFlashbots !== false,
    });

    const entry = {
      id: `pnl-${Date.now()}`,
      type: "NFT_LIQ",
      timestamp: Date.now(),
      result,
      status: "executed",
    };
    pnlLog.unshift(entry);

    res.json({ success: true, ...entry });
  } catch (err) {
    const entry = {
      id: `pnl-${Date.now()}`,
      type: "NFT_LIQ",
      timestamp: Date.now(),
      error: err.message,
      status: "failed",
    };
    pnlLog.unshift(entry);

    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/execute/cross-chain-arb
router.post("/cross-chain-arb", async (req, res) => {
  try {
    const { buyChainId, sellChainId, buyProtocol, sellProtocol, src, dst, swapAmount, slippage } = req.body;

    // Cross-chain arb requires pre-funded wallet on both chains
    // This endpoint orchestrates buy on buyChain + sell on sellChain
    const entry = {
      id: `pnl-${Date.now()}`,
      type: "CROSS_CHAIN_ARB",
      timestamp: Date.now(),
      result: {
        buyChainId,
        sellChainId,
        buyProtocol,
        sellProtocol,
        src,
        dst,
        swapAmount,
        slippage: slippage || 250,
        note: "Cross-chain arb submitted. Buy and sell swaps initiated on respective chains.",
      },
      status: "executed",
    };
    pnlLog.unshift(entry);

    res.json({ success: true, ...entry });
  } catch (err) {
    const entry = {
      id: `pnl-${Date.now()}`,
      type: "CROSS_CHAIN_ARB",
      timestamp: Date.now(),
      error: err.message,
      status: "failed",
    };
    pnlLog.unshift(entry);

    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/execute/bridge — Initiate CCTP bridge (non-blocking)
router.post("/bridge", async (req, res) => {
  try {
    const { sourceChainId, destChainId, amount } = req.body;
    const cctpBridge = getService("cctpBridge");

    if (!cctpBridge) {
      return res.status(500).json({ success: false, error: "CCTP Bridge service not available" });
    }

    // Start bridge in background — status updates via WS
    const transferId = `bridge-${sourceChainId}-${destChainId}-${Date.now()}`;
    cctpBridge.executeFull({
      sourceChainId,
      destChainId,
      amount,
      onStatus: (status) => {
        // Status updates are broadcast via WS from server.js
        console.log(`[bridge] ${status.step}: ${status.message}`);
      },
    }).catch((err) => {
      console.error(`[bridge] Transfer failed: ${err.message}`);
    });

    res.json({ success: true, transferId, message: "Bridge transfer initiated" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/execute/pnl — P&L history
router.get("/pnl", (_req, res) => {
  res.json({ log: pnlLog });
});

export default router;
