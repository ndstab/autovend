import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { recordEarning, getDepositBySession, markDepositPaid, creditBalance } from "../db/schema.js";

export const webhooksRouter = Router();

/**
 * POST /webhooks/locus
 * Handles all Locus payment events.
 */
webhooksRouter.post("/locus", (req: Request, res: Response) => {
  const event = req.body;
  console.log("[webhook] Event:", event.type);

  switch (event.type) {

    // Creator paid a checkout session → credit their AutoVend balance
    case "checkout.session.paid": {
      const sessionId = event.data?.session_id || event.data?.id;
      if (!sessionId) break;

      const deposit = getDepositBySession(sessionId);
      if (!deposit) {
        console.warn(`[webhook] No deposit found for session ${sessionId}`);
        break;
      }
      if (deposit.status === "paid") {
        console.warn(`[webhook] Deposit ${sessionId} already credited`);
        break;
      }

      markDepositPaid(sessionId);
      creditBalance(deposit.creator_id, deposit.amount);
      console.log(`[webhook] Credited $${deposit.amount} to creator ${deposit.creator_id}`);
      break;
    }

    // x402 call on a deployed API → record revenue
    case "x402.payment_received": {
      const { api_id, amount, caller } = event.data || {};
      if (!api_id || !amount) break;

      recordEarning({
        id: nanoid(12),
        api_id,
        amount,
        type: "call_revenue",
        caller,
      });
      console.log(`[webhook] $${amount} revenue for API ${api_id}`);
      break;
    }

    default:
      console.log(`[webhook] Unhandled event: ${event.type}`);
  }

  res.json({ received: true });
});
