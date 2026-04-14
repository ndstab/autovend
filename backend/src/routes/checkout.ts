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
function confirmDeposit(deposit: { creator_id: string; session_id: string; amount: number }) {
  markDepositPaid(deposit.session_id);
  creditBalance(deposit.creator_id, deposit.amount);
  console.log(`[checkout.poll] CREDITED $${deposit.amount} → ${deposit.creator_id} (session ${deposit.session_id})`);
}

/** Treat a session object from Locus as "paid" if any common status field says so. */
function sessionIsPaid(session: Record<string, unknown> | null | undefined): boolean {
  if (!session) return false;
  const candidates = [
    session.status, session.state, session.payment_status,
    session.paymentStatus, session.payment_state,
  ].map((v) => String(v ?? "").toLowerCase());
  return candidates.some((s) =>
    ["paid", "complete", "completed", "success", "succeeded", "settled", "fulfilled"].includes(s)
  );
}

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
    res.json({ paid: true, balance: user?.balance ?? 0, via: "already_paid" });
    return;
  }

  const diagnostics: Record<string, unknown> = {};

  // ── Strategy 1: direct session lookup ────────────────────────
  try {
    const sessionRes = await locus.getCheckoutSession(sessionId);
    diagnostics.session_lookup = {
      success: sessionRes.success,
      error: sessionRes.error,
      session: sessionRes.data,
    };
    if (sessionRes.success && sessionIsPaid(sessionRes.data)) {
      confirmDeposit(deposit);
      const updated = getUser(deposit.creator_id);
      res.json({ paid: true, balance: updated?.balance ?? 0, via: "session_status" });
      return;
    }
  } catch (err) {
    diagnostics.session_lookup_error = String(err);
  }

  // ── Strategy 2: scan recent transactions ─────────────────────
  try {
    const txResult = await locus.getTransactions(50, 0);
    const txs = (txResult.data as { transactions?: unknown[] } | null)?.transactions ?? [];
    diagnostics.tx_count = txs.length;
    diagnostics.tx_sample = txs.slice(0, 2); // first 2 so we can inspect shape

    const match = (txs as Array<Record<string, unknown>>).find((t) => {
      const flat = JSON.stringify(t);
      if (flat.includes(sessionId)) return true;
      const amount = parseFloat(String(
        t.amount ?? t.usdc_amount ?? t.value ?? (t.data as Record<string, unknown> | undefined)?.amount ?? "0"
      ));
      if (Math.abs(amount - deposit.amount) > 0.01) return false;
      const tsRaw = t.created_at ?? t.timestamp ?? t.createdAt ?? t.created;
      let ts = Number(tsRaw);
      if (typeof tsRaw === "string" && isNaN(ts)) ts = Math.floor(new Date(tsRaw).getTime() / 1000);
      if (ts > 10_000_000_000) ts = Math.floor(ts / 1000); // ms → s
      const afterDeposit = ts === 0 || isNaN(ts) || ts >= deposit.created_at - 60;
      const typeStr = String(t.type ?? t.direction ?? t.category ?? "").toLowerCase();
      const looksIncoming = ["in", "credit", "deposit", "checkout", "receive", "incoming", "payment_received"].some(
        (k) => typeStr.includes(k)
      );
      return afterDeposit && (looksIncoming || typeStr === "" /* unknown schema — be permissive on amount match */);
    });

    if (match) {
      diagnostics.matched_tx = match;
      confirmDeposit(deposit);
      const updated = getUser(deposit.creator_id);
      res.json({ paid: true, balance: updated?.balance ?? 0, via: "tx_scan" });
      return;
    }

    res.json({ paid: false, balance: user?.balance ?? 0, diagnostics });
  } catch (err) {
    console.error("[checkout.poll] tx scan failed:", err);
    res.json({ paid: false, balance: user?.balance ?? 0, error: "poll_failed", diagnostics });
  }
});

/**
 * POST /api/checkout/force-confirm/:sessionId
 * Demo-safety fallback: if polling fails but the user can prove (via the Locus
 * dashboard) that the payment landed, the frontend can call this to force-credit.
 * We still verify against Locus's session status first — never blindly credit.
 */
checkoutRouter.post("/force-confirm/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const deposit = getDepositBySession(sessionId) as
    | { id: string; creator_id: string; session_id: string; amount: number; status: string; created_at: number }
    | undefined;

  if (!deposit) {
    res.status(404).json({ error: "deposit not found" });
    return;
  }
  if (deposit.status === "paid") {
    const user = getUser(deposit.creator_id);
    res.json({ paid: true, balance: user?.balance ?? 0, via: "already_paid" });
    return;
  }

  // Try session lookup; require some success signal
  const sessionRes = await locus.getCheckoutSession(sessionId);
  if (sessionRes.success && sessionIsPaid(sessionRes.data)) {
    confirmDeposit(deposit);
    const updated = getUser(deposit.creator_id);
    res.json({ paid: true, balance: updated?.balance ?? 0, via: "session_status_forced" });
    return;
  }

  res.status(409).json({
    paid: false,
    error: "Locus does not confirm this session as paid yet",
    session: sessionRes.data,
  });
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
