import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { createDeposit, upsertUser, getUser } from "../db/schema.js";

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
