import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { createApi, updateApiStatus, recordEarning } from "../db/schema.js";
import { buildApi } from "../services/codegen.js";
import { deployService } from "../services/deploy.js";
import { locus } from "../lib/locus.js";

export const buildRouter = Router();

/**
 * POST /api/build
 * Trigger the full build pipeline:
 * description → parse → codegen → deploy → x402 → live
 */
buildRouter.post("/", async (req: Request, res: Response) => {
  const { description, creator_id, price_usd } = req.body;

  if (!description || !creator_id) {
    res.status(400).json({ error: "description and creator_id are required" });
    return;
  }

  const apiId = nanoid(12);
  const price = price_usd || 0.05;

  // 1. Try to create sub-wallet — gracefully skip if Locus unavailable
  let walletId: string | undefined;
  try {
    const subWallet = await locus.createSubWallet(
      process.env.LOCUS_WALLET_ID || "",
      `build-${apiId}`,
      2.0
    );
    if (subWallet.success) {
      walletId = subWallet.data.id;
    } else {
      console.warn(`[${apiId}] Sub-wallet creation skipped: ${subWallet.error}`);
    }
  } catch (err) {
    console.warn(`[${apiId}] Sub-wallet creation failed, continuing without:`, err);
  }

  // 2. Insert API record as 'building'
  createApi({
    id: apiId,
    creator_id,
    name: "",
    description,
    price_usd: price,
    wallet_id: walletId,
  });

  // Return immediately — build happens async
  res.json({
    api_id: apiId,
    status: "building",
    message: "Build pipeline started",
  });

  // 3. Run build pipeline in background
  runBuildPipeline(apiId, description, walletId || "", creator_id, price);
});

/**
 * GET /api/build/:id/status
 * Check build progress
 */
buildRouter.get("/:id/status", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = (await import("../db/schema.js")).getDb();
  const api = db.prepare("SELECT id, name, status, endpoint, build_cost FROM apis WHERE id = ?").get(id);

  if (!api) {
    res.status(404).json({ error: "API not found" });
    return;
  }
  res.json(api);
});

// ─── Background pipeline ────────────────────────────────────

async function runBuildPipeline(
  apiId: string,
  description: string,
  walletId: string,
  creatorId: string,
  priceUsd: number
) {
  let totalCost = 0;

  try {
    // Step 1: Parse + Codegen (AI generates the service)
    console.log(`[${apiId}] Starting codegen...`);
    const { name, code, dockerfile, cost } = await buildApi(description, walletId);
    totalCost += cost;

    // Update name
    updateApiStatus(apiId, "building", { build_cost: totalCost });

    // Step 2: Deploy to Locus
    console.log(`[${apiId}] Deploying...`);
    const deployment = await deployService({
      apiId,
      name,
      code,
      dockerfile,
      priceUsd,
      creatorWalletId: walletId,
    });

    // Step 3: Register x402 payment gate
    if (deployment.url) {
      await locus.registerX402Endpoint({
        endpoint_url: deployment.url,
        price_per_call: priceUsd,
        recipient_wallet_id: walletId,
        description,
      });
    }

    // Step 4: Register agent identity
    const agent = await locus.registerAgent({
      name,
      description,
      endpoint: deployment.url || "",
      wallet_id: walletId,
    });

    // Step 5: Mark as live
    updateApiStatus(apiId, "live", {
      endpoint: deployment.url,
      agent_id: agent.success ? agent.data.agent_id : undefined,
      build_cost: totalCost,
    });

    // Record build cost as an earning (negative)
    recordEarning({
      id: nanoid(12),
      api_id: apiId,
      amount: -totalCost,
      type: "build_cost",
    });

    console.log(`[${apiId}] Live at ${deployment.url}`);
  } catch (err) {
    console.error(`[${apiId}] Build failed:`, err);
    updateApiStatus(apiId, "failed", { build_cost: totalCost });
  }
}
