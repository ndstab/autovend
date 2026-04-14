import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import {
  createDeposit,
  upsertUser,
  getUser,
  getDepositBySession,
  markDepositPaid,
  creditBalance,
} from "../db/schema.js";
import { locus } from "../lib/locus.js";

export const checkoutRouter = Router();

const LOCUS_API = process.env.LOCUS_API_URL || "https://beta-api.paywithlocus.com";
const BUILD_COST_USD = 1.50; // what we charge creators per build

/**
 * POST /api/checkout/fund
 * Create a Locus checkout session to fund a creator's AutoVend balance.
 * Returns the checkoutUrl to redirect the user to.
 */
checkoutRouter.post("/fund", async (req: Request, res: Response) => {
  const { creator_id, email, amount } = req.body;

  if (!creator_id) {
    res.status(400).json({ error: "creator_id required" });
    return;
  }

  const depositAmount = Number(amount) || 5.00; // default $5 top-up

  // Ensure user exists in DB
  upsertUser(creator_id, email);

  try {
    // Create Locus checkout session — amount must be a string
    const response = await fetch(`${LOCUS_API}/api/checkout/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.LOCUS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: depositAmount.toFixed(2),
        currency: "USDC",
        description: `Fund AutoVend balance — ${creator_id}`,
        metadata: { creator_id },
      }),
    });

    const data = await response.json() as {
      success: boolean;
      data?: { id: string; checkoutUrl: string; amount: string };
      error?: string;
    };

    if (!data.success || !data.data) {
      res.status(500).json({ error: data.error || "Failed to create checkout session" });
      return;
    }

    // Store deposit record (pending until webhook confirms)
    createDeposit({
      id: nanoid(12),
      creator_id,
      session_id: data.data.id,
      checkout_url: data.data.checkoutUrl,
      amount: depositAmount,
    });

    res.json({
      session_id: data.data.id,
      checkout_url: data.data.checkoutUrl,
      amount: depositAmount,
    });
  } catch (err) {
    console.error("[checkout] Failed:", err);
    res.status(500).json({ error: "Checkout session creation failed" });
  }
});

/**
 * GET /api/checkout/balance/:creatorId
 * Return a creator's current AutoVend balance.
 */
/**
 * GET /api/checkout/poll/:sessionId
 * Since Locus webhooks can't reach localhost, the frontend polls this route.
 * We query Locus's recent transactions and look for an incoming USDC credit
 * whose amount matches the deposit and whose timestamp is after the deposit
 * was created. On match, mark the deposit paid + credit AutoVend balance.
 */
checkoutRouter.get("/poll/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const deposit = getDepositBySession(sessionId) as
    | { id: string; creator_id: string; session_id: string; amount: number; status: string; created_at: number }
    | undefined;

  if (!deposit) {
    res.status(404).json({ error: "deposit not found" });
    return;
  }

  const user = getUser(deposit.creator_id);

  if (deposit.status === "paid") {
    res.json({ paid: true, balance: user?.balance ?? 0 });
    return;
  }

  try {
    const txResult = await locus.getTransactions(50, 0);
    const txs = (txResult.data as { transactions?: unknown[] } | null)?.transactions ?? [];

    const match = (txs as Array<Record<string, unknown>>).find((t) => {
      const amount = parseFloat(String(t.amount ?? t.usdc_amount ?? "0"));
      const isIncoming =
        t.direction === "in" ||
        t.type === "credit" ||
        t.type === "deposit" ||
        t.type === "checkout" ||
        String(t.to ?? "").length > 0 && String(t.from ?? "") !== String(t.to ?? "");
      const ts = Number(t.created_at ?? t.timestamp ?? 0);
      const afterDeposit = ts === 0 || ts >= deposit.created_at - 5;
      const amountMatch = Math.abs(amount - deposit.amount) < 0.005;
      const sessionMatch =
        JSON.stringify(t).includes(sessionId) ||
        (t.metadata as Record<string, unknown> | undefined)?.session_id === sessionId;
      return sessionMatch || (amountMatch && afterDeposit && isIncoming);
    });

    if (match) {
      markDepositPaid(sessionId);
      creditBalance(deposit.creator_id, deposit.amount);
      const updated = getUser(deposit.creator_id);
      res.json({ paid: true, balance: updated?.balance ?? 0 });
      return;
    }

    res.json({ paid: false, balance: user?.balance ?? 0 });
  } catch (err) {
    console.error("[checkout.poll] failed:", err);
    res.json({ paid: false, balance: user?.balance ?? 0, error: "poll_failed" });
  }
});

checkoutRouter.get("/balance/:creatorId", (req: Request, res: Response) => {
  const creatorId = req.params.creatorId as string;
  upsertUser(creatorId); // create if not exists
  const user = getUser(creatorId);
  res.json({
    balance: user?.balance ?? 0,
    build_cost: BUILD_COST_USD,
    can_build: (user?.balance ?? 0) >= BUILD_COST_USD,
  });
});
