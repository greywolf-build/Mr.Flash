import { Router } from "express";
import { getService } from "../services/registry.js";

const router = Router();

// GET /api/gas
router.get("/", (_req, res) => {
  const gasTracker = getService("gasTracker");
  res.json(gasTracker.latest);
});

export default router;
