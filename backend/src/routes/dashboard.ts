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
  if (balanceResult.success) {
    walletBalance = balanceResult.data.balance;
    walletAddress = balanceResult.data.address;
  }

  res.json({ stats, apis, wallet: { balance: walletBalance, address: walletAddress } });
});

/**
 * POST /api/dashboard/withdraw
 * Withdraw USDC to an address via Locus
 */
dashboardRouter.post("/withdraw", async (req: Request, res: Response) => {
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
