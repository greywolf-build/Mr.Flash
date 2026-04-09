import { Router } from "express";
import { getService } from "../services/registry.js";

const router = Router();

// GET /api/opportunities/dex
router.get("/dex", (_req, res) => {
  try {
    const dexScanner = getService("dexScanner");
    res.json({ opportunities: dexScanner.latest });
  } catch {
    res.json({ opportunities: [] });
  }
});

// GET /api/opportunities/nft
router.get("/nft", (_req, res) => {
  const nftMonitor = getService("nftMonitor");
  res.json({ opportunities: nftMonitor.latest });
});

// GET /api/opportunities — all
router.get("/", (_req, res) => {
  let dex = [];
  try {
    dex = getService("dexScanner").latest;
  } catch {
    // DEX scanner not registered (no API key)
  }
  const nft = getService("nftMonitor").latest;
  res.json({ dex, nft });
});

export default router;
