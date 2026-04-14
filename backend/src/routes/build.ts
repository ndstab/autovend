import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { createApi, updateApiStatus, recordEarning, upsertUser, deductBalance, getUser } from "../db/schema.js";
import { buildApi } from "../services/codegen.js";
import { deployService } from "../services/deploy.js";
import { locus } from "../lib/locus.js";

const BUILD_COST_USD = 1.50; // charged to creator per build

export const buildRouter = Router();

/**
 * POST /api/build
 * Trigger the full build pipeline:
 * description → codegen (via Locus wrapped Anthropic) → deploy → x402 → live
 */
buildRouter.post("/", async (req: Request, res: Response) => {
  const { description, creator_id, price_usd } = req.body;

  if (!description || !creator_id) {
    res.status(400).json({ error: "description and creator_id are required" });
    return;
  }

  const apiId = nanoid(12);
  const price = price_usd || 0.05;

  // Ensure user exists, check balance
  upsertUser(creator_id);
  const user = getUser(creator_id);
  const balance = user?.balance ?? 0;

  if (balance < BUILD_COST_USD) {
    res.status(402).json({
      error: "Insufficient balance",
      balance,
      required: BUILD_COST_USD,
      message: `You need at least $${BUILD_COST_USD} to build. Current balance: $${balance.toFixed(2)}`,
    });
    return;
  }

  // Deduct build cost immediately (hold funds)
  deductBalance(creator_id, BUILD_COST_USD);

  // Insert record immediately so status polling works
  createApi({
    id: apiId,
    creator_id,
    name: "",
    description,
    price_usd: price,
    wallet_id: process.env.LOCUS_WALLET_ID,
    build_cost: BUILD_COST_USD,
  });

  // Return immediately — build runs async
  res.json({ api_id: apiId, status: "building", message: "Build pipeline started" });

  // Run pipeline in background
  runBuildPipeline(apiId, description, creator_id, price);
});

/**
 * GET /api/build/active?creator_id=X
 * Returns the most recent in-progress build for a creator, if any.
 * Used by the Build page to resume polling after navigation.
 */
buildRouter.get("/active", async (req: Request, res: Response) => {
  const creatorId = req.query.creator_id as string | undefined;
  if (!creatorId) {
    res.status(400).json({ error: "creator_id required" });
    return;
  }
  const db = (await import("../db/schema.js")).getDb();
  const api = db
    .prepare(
      "SELECT id, name, description, status, endpoint, build_cost, created_at FROM apis WHERE creator_id = ? AND status = 'building' ORDER BY created_at DESC LIMIT 1"
    )
    .get(creatorId);
  res.json({ active: api ?? null });
});

/**
 * GET /api/build/:id/status
 */
buildRouter.get("/:id/status", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = (await import("../db/schema.js")).getDb();
  const api = db
    .prepare("SELECT id, name, status, endpoint, build_cost FROM apis WHERE id = ?")
    .get(id);

  if (!api) {
    res.status(404).json({ error: "API not found" });
    return;
  }
  res.json(api);
});

/**
 * POST /api/build/register
 * Helper: register a new Locus agent and return the real claw_ API key.
 * Call this once during setup if you only have the ownerPrivateKey.
 */
buildRouter.post("/register", async (_req: Request, res: Response) => {
  const result = await locus.register("AutoVend Platform", "platform@autovend.ai");
  if (result.success) {
    res.json({
      message: "Agent registered. Save your apiKey — it starts with 'claw_'.",
      apiKey: result.data.apiKey,
      walletAddress: result.data.walletAddress,
    });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ─── Background pipeline ────────────────────────────────────

const BUILD_TIMEOUT_MS = 180_000; // 3 minutes hard cap

async function runBuildPipeline(
  apiId: string,
  description: string,
  _creatorId: string,
  priceUsd: number
) {
  let totalCost = 0;
  let finished = false;

  // Watchdog: if build isn't done in 3 min, force-fail it so it doesn't hang.
  const watchdog = setTimeout(() => {
    if (finished) return;
    console.error(`[${apiId}] Build timeout — force failing`);
    try {
      updateApiStatus(apiId, "failed");
    } catch (e) {
      console.error(`[${apiId}] watchdog update failed:`, e);
    }
  }, BUILD_TIMEOUT_MS);

  try {
    // Step 1: Codegen via Locus wrapped Anthropic (falls back to direct API)
    console.log(`[${apiId}] Starting codegen...`);
    const { name, code, dockerfile, requirements, cost } = await buildApi(description);
    totalCost += cost;

    // Update name in DB
    const db = (await import("../db/schema.js")).getDb();
    db.prepare("UPDATE apis SET name = ? WHERE id = ?").run(name, apiId);

    // Step 2: Deploy (Locus Deploy / mock)
    console.log(`[${apiId}] Deploying...`);
    const deployment = await deployService({
      apiId,
      name,
      code,
      dockerfile,
      requirements,
      priceUsd,
    });

    // Step 3: Register x402 — if we have a real slug from Locus, great; otherwise skip
    // x402 endpoints are managed in the Locus dashboard for now
    console.log(`[${apiId}] Endpoint: ${deployment.url}`);

    // Step 4: Mark live
    updateApiStatus(apiId, "live", {
      endpoint: deployment.url,
      build_cost: totalCost,
    });

    // Step 5: Record build cost earning
    if (totalCost > 0) {
      recordEarning({
        id: nanoid(12),
        api_id: apiId,
        amount: -totalCost,
        type: "build_cost",
      });
    }

    console.log(`[${apiId}] Live at ${deployment.url}`);
  } catch (err) {
    console.error(`[${apiId}] Build failed:`, err);
    updateApiStatus(apiId, "failed");
  } finally {
    finished = true;
    clearTimeout(watchdog);
  }
}
