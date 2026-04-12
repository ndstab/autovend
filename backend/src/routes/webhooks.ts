import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { recordEarning } from "../db/schema.js";

export const webhooksRouter = Router();

/**
 * POST /webhooks/locus
 * Handles incoming payment events from Locus (x402 calls, checkout completions)
 */
webhooksRouter.post("/locus", (req: Request, res: Response) => {
  const event = req.body;

  console.log("[webhook] Received Locus event:", event.type);

  switch (event.type) {
    case "x402.payment_received": {
      // Someone called a deployed API and paid via x402
      const { api_id, amount, caller } = event.data;
      recordEarning({
        id: nanoid(12),
        api_id,
        amount,
        type: "call_revenue",
        caller,
      });
      console.log(`[webhook] Recorded $${amount} revenue for API ${api_id}`);
      break;
    }

    case "checkout.completed": {
      // Creator funded their wallet via checkout
      console.log(`[webhook] Checkout completed: ${event.data.session_id}`);
      break;
    }

    default:
      console.log(`[webhook] Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});
