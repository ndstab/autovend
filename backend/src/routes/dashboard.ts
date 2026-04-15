import { Router, Request, Response } from "express";
import { getDashboardStats, getApisByCreator } from "../db/schema.js";
import { locus } from "../lib/locus.js";

export const dashboardRouter = Router();

/**
 * GET /api/dashboard/:creatorId
 * Returns DB stats + live Locus wallet balance
 */
dashboardRouter.get("/:creatorId", async (req: Request, res: Response) => {
  const creatorId = req.params.creatorId as string;

  const stats = getDashboardStats(creatorId);
  const apis = getApisByCreator(creatorId);

  // Fetch live wallet balance from Locus
  let walletBalance: number | null = null;
  let walletAddress: string | null = null;
  const balanceResult = await locus.getBalance();
  if (balanceResult.success && balanceResult.data) {
    walletBalance = parseFloat(balanceResult.data.usdc_balance) || 0;
    walletAddress = balanceResult.data.wallet_address;
  }

  res.json({ stats, apis, wallet: { balance: walletBalance, address: walletAddress } });
});

/**
 * POST /api/dashboard/withdraw
 * Withdraw USDC from the platform wallet to an address.
 *
 * Requires X-Admin-Secret header matching ADMIN_SECRET env var.
 * If ADMIN_SECRET is unset, the endpoint is disabled to prevent accidental drain.
 */
dashboardRouter.post("/withdraw", async (req: Request, res: Response) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "Withdrawals disabled — ADMIN_SECRET not configured" });
    return;
  }
  const provided = req.headers["x-admin-secret"];
  if (provided !== adminSecret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { to_address, amount, memo } = req.body;
  if (!to_address || !amount) {
    res.status(400).json({ error: "to_address and amount required" });
    return;
  }

  const result = await locus.sendUsdc(to_address, amount, memo || "AutoVend withdrawal");
  if (result.success) {
    res.json({ success: true, transaction: result.data });
  } else {
    res.status(500).json({ error: result.error });
  }
});
