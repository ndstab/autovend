/**
 * proxy.ts — x402-style payment gate + execution proxy for deployed APIs.
 *
 * POST /api/call/:apiId
 *   - No payment header → 402 with payment requirements
 *   - X-Locus-Key header → charge $0.05 from caller's Locus wallet, execute, return result
 *
 * GET /api/call/:apiId/spec
 *   - Returns the API's generated code and schema (free)
 */

import { Router, Request, Response } from "express";
import { getPort, startApi } from "../services/executor.js";
import { getDb } from "../db/schema.js";
import { nanoid } from "nanoid";
import { recordEarning, creditBalance } from "../db/schema.js";

export const proxyRouter = Router();

const CALL_PRICE_USD = 0.05;
const CREATOR_SHARE = 0.8; // 80% to creator
const PLATFORM_SHARE = 0.2; // 20% to AutoVend

/** GET /api/call/:apiId/spec — public API spec */
proxyRouter.get("/:apiId/spec", (req: Request, res: Response) => {
  const { apiId } = req.params as { apiId: string };
  const api = getDb()
    .prepare("SELECT * FROM apis WHERE id = ? AND status = 'live'")
    .get(apiId) as {
      id: string; name: string; description: string; price_usd: number;
      endpoint: string; input_schema: string | null; input_example: string | null;
    } | undefined;

  if (!api) {
    res.status(404).json({ error: "API not found or not live" });
    return;
  }

  const inputSchema = safeJson(api.input_schema);
  const inputExample = safeJson(api.input_example);

  res.json({
    id: api.id,
    name: api.name,
    description: api.description,
    price_usd: api.price_usd,
    endpoint: api.endpoint,
    input_schema: inputSchema,
    input_example: inputExample,
    usage: {
      method: "POST",
      url: api.endpoint,
      headers: {
        "Content-Type": "application/json",
        "X-Locus-Key": "<your-locus-api-key>",
      },
      body: inputExample ?? { "...": "API-specific input fields" },
    },
    payment: {
      protocol: "x402",
      price: `$${api.price_usd} USDC per call`,
      network: "Base",
      paymentHeader: "X-Locus-Key",
    },
  });
});

function safeJson(s: string | null | undefined): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * POST /api/call/:apiId — main execution endpoint
 *
 * Payment via X-Locus-Key header (caller's Locus API key).
 * We use it to pull $0.05 from their wallet → our platform wallet.
 * Then proxy to the running FastAPI process and return the result.
 */
proxyRouter.post("/:apiId", async (req: Request, res: Response) => {
  const { apiId } = req.params as { apiId: string };

  // 1. Look up the API
  const api = getDb()
    .prepare("SELECT * FROM apis WHERE id = ? AND status = 'live'")
    .get(apiId) as {
      id: string; name: string; description: string;
      price_usd: number; creator_id: string;
    } | undefined;

  if (!api) {
    res.status(404).json({ error: "API not found or not live" });
    return;
  }

  const priceUsd = api.price_usd || CALL_PRICE_USD;

  // 2. Check for caller's Locus key (payment credential)
  const callerKey = req.headers["x-locus-key"] as string | undefined;

  if (!callerKey) {
    // Standard 402 response per x402 protocol
    res.status(402).json({
      error: "Payment Required",
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: String(Math.round(priceUsd * 1_000_000)), // in USDC units (6 decimals)
          resource: req.originalUrl,
          description: `Pay $${priceUsd} USDC to call ${api.name}`,
          mimeType: "application/json",
          payTo: process.env.LOCUS_WALLET_ID || "",
          maxTimeoutSeconds: 300,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
          extra: {
            name: api.name,
            priceUsd,
            paymentMethod: "Include your Locus API key as X-Locus-Key header",
          },
        },
      ],
    });
    return;
  }

  // 3. Collect payment from caller via their Locus key
  const platformWallet = process.env.LOCUS_WALLET_ID!;
  const locus_base = process.env.LOCUS_API_URL || "https://beta-api.paywithlocus.com";

  let paymentTxId: string | null = null;

  try {
    const payRes = await fetch(`${locus_base}/api/pay/send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${callerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to_address: platformWallet,
        amount: priceUsd,
        memo: `AutoVend API call — ${api.name}`,
      }),
    });

    const payJson = await payRes.json() as {
      success: boolean;
      data?: { transaction_id: string; status: string };
      error?: string;
    };

    if (!payJson.success) {
      res.status(402).json({
        error: "Payment failed",
        details: payJson.error || "Could not charge caller's Locus wallet",
      });
      return;
    }

    paymentTxId = payJson.data?.transaction_id || null;
    console.log(`[proxy] Payment from caller for ${apiId}: tx ${paymentTxId}`);
  } catch (err) {
    console.warn(`[proxy] Payment collection failed for ${apiId}:`, err);
    res.status(402).json({
      error: "Payment processing error",
      details: String(err),
    });
    return;
  }

  // 4. Get (or start) the FastAPI process
  let port = getPort(apiId);
  if (!port) {
    try {
      console.log(`[proxy] Cold-starting API ${apiId}...`);
      port = await startApi(apiId);
    } catch (err) {
      res.status(503).json({ error: "API process failed to start", details: String(err) });
      return;
    }
  }

  // 5. Execute: proxy the request body to the FastAPI /run endpoint
  let result: unknown;
  try {
    const execRes = await fetch(`http://127.0.0.1:${port}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    result = await execRes.json();
    console.log(`[proxy] API ${apiId} executed successfully`);
  } catch (err) {
    console.error(`[proxy] Execution failed for ${apiId}:`, err);
    res.status(500).json({ error: "API execution failed", details: String(err) });
    return;
  }

  // 6. Record earning + credit creator's virtual balance
  const creatorEarning = priceUsd * CREATOR_SHARE;

  try {
    recordEarning({
      id: nanoid(12),
      api_id: apiId,
      amount: priceUsd,
      type: "call_revenue",
      caller: req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || undefined,
    });

    // Credit creator's AutoVend balance
    creditBalance(api.creator_id, creatorEarning);

    console.log(
      `[proxy] Earning recorded: $${priceUsd} → creator gets $${creatorEarning.toFixed(3)}, platform gets $${(priceUsd * PLATFORM_SHARE).toFixed(3)}`
    );
  } catch (err) {
    console.warn(`[proxy] Failed to record earning for ${apiId}:`, err);
  }

  // 7. Return the result with payment confirmation headers
  res.set("X-Payment-TxId", paymentTxId || "");
  res.set("X-Cost", String(priceUsd));
  res.set("X-Creator-Earn", String(creatorEarning));
  res.json(result);
});

/**
 * POST /api/call/:apiId/test
 *
 * Free test endpoint callable from the frontend UI.
 * Skips Locus payment but still records the call + credits the creator,
 * so the dashboard updates in real time during a demo.
 */
proxyRouter.post("/:apiId/test", async (req: Request, res: Response) => {
  const { apiId } = req.params as { apiId: string };

  const api = getDb()
    .prepare("SELECT * FROM apis WHERE id = ? AND status = 'live'")
    .get(apiId) as {
      id: string; name: string; creator_id: string; price_usd: number;
    } | undefined;

  if (!api) {
    res.status(404).json({ error: "API not found or not live" });
    return;
  }

  // Get or cold-start the process
  let port = getPort(apiId);
  if (!port) {
    try {
      port = await startApi(apiId);
    } catch (err) {
      res.status(503).json({ error: "API process failed to start", details: String(err) });
      return;
    }
  }

  // Execute
  try {
    const execRes = await fetch(`http://127.0.0.1:${port}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const result = await execRes.json();

    // Record earning so dashboard updates live
    const priceUsd = api.price_usd || CALL_PRICE_USD;
    recordEarning({
      id: nanoid(12),
      api_id: apiId,
      amount: priceUsd,
      type: "call_revenue",
      caller: "test-ui",
    });
    creditBalance(api.creator_id, priceUsd * CREATOR_SHARE);

    res.json({ result, cost: priceUsd, paid: false, note: "Test call — no USDC charged" });
  } catch (err) {
    res.status(500).json({ error: "API execution failed", details: String(err) });
  }
});
