import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { createApi, updateApiStatus, recordEarning, upsertUser, deductBalance, creditBalance, deleteBuildCostEarnings, getUser } from "../db/schema.js";
import { buildApi } from "../services/codegen.js";
import { deployService } from "../services/deploy.js";

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
  const ok = deductBalance(creator_id, BUILD_COST_USD);
  if (!ok) {
    // Concurrent-request race: another build just drained the balance.
    res.status(402).json({ error: "Insufficient balance" });
    return;
  }

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

  // Record the build cost as an earning row (negative amount) so the dashboard
  // shows real numbers. Done up-front so it appears even if the pipeline fails.
  recordEarning({
    id: nanoid(12),
    api_id: apiId,
    amount: -BUILD_COST_USD,
    type: "build_cost",
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
    .prepare("SELECT id, name, status, endpoint, agent_id, build_cost, input_schema, input_example, last_error FROM apis WHERE id = ?")
    .get(id);

  if (!api) {
    res.status(404).json({ error: "API not found" });
    return;
  }
  res.json(api);
});

// ─── Background pipeline ────────────────────────────────────

const BUILD_TIMEOUT_MS = 180_000; // 3 minutes hard cap

async function runBuildPipeline(
  apiId: string,
  description: string,
  creatorId: string,
  priceUsd: number
) {
  let finished = false;
  let watchdogFired = false;

  // Watchdog: if build isn't done in 3 min, force-fail it so it doesn't hang.
  // Sets watchdogFired so the subsequent pipeline finish (success OR error)
  // can skip its own status update/refund and avoid double-crediting.
  const watchdog = setTimeout(() => {
    if (finished) return;
    watchdogFired = true;
    finished = true;
    console.error(`[${apiId}] Build timeout — force failing`);
    try {
      refundFailedBuild(apiId, creatorId, "Build exceeded 3-minute timeout");
    } catch (e) {
      console.error(`[${apiId}] watchdog refund failed:`, e);
    }
  }, BUILD_TIMEOUT_MS);

  try {
    // Step 1: Codegen — kicks off Exa research internally, then Locus wrapped
    // Anthropic (falls back to direct Anthropic API).
    console.log(`[${apiId}] Starting codegen (with Exa research)...`);
    const { name, code, dockerfile, requirements, research, input_schema, input_example } =
      await buildApi(description);

    if (research && research.length) {
      console.log(`[${apiId}] Exa surfaced ${research.length} source(s):`);
      research.forEach((r, i) => console.log(`  [${i + 1}] ${r.title} — ${r.url}`));
    }

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

    console.log(`[${apiId}] Endpoint: ${deployment.url}`);

    if (watchdogFired) {
      // Watchdog already refunded + marked failed while we were still running.
      // Don't overwrite with "live" — the creator already has their money back.
      console.warn(`[${apiId}] Pipeline finished after watchdog fired — discarding success`);
    } else {
      updateApiStatus(apiId, "live", {
        endpoint: deployment.url,
        build_cost: BUILD_COST_USD,
        input_schema: input_schema ? JSON.stringify(input_schema) : undefined,
        input_example: input_example ? JSON.stringify(input_example) : undefined,
      });
      console.log(`[${apiId}] Live at ${deployment.url}`);
    }
  } catch (err) {
    if (watchdogFired) {
      console.error(`[${apiId}] Pipeline errored after watchdog already refunded:`, err);
    } else {
      console.error(`[${apiId}] Build failed:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      refundFailedBuild(apiId, creatorId, msg);
    }
  } finally {
    finished = true;
    clearTimeout(watchdog);
  }
}

/**
 * Mark an API failed, refund the creator's build cost, and wipe the
 * build_cost earning row so the dashboard reflects that nothing was
 * actually spent on a failed build. Stores a human-readable reason so the
 * build UI can show why.
 */
function refundFailedBuild(apiId: string, creatorId: string, reason?: string) {
  updateApiStatus(apiId, "failed", {
    build_cost: 0,
    last_error: (reason || "Unknown error").slice(0, 500),
  });
  creditBalance(creatorId, BUILD_COST_USD);
  deleteBuildCostEarnings(apiId);
}
