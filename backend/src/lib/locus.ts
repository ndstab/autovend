/**
 * Locus API Client
 *
 * Wraps all Locus platform interactions:
 * - Wallets (create, balance, sub-wallets)
 * - Transfers (send USDC)
 * - Pay-per-use APIs (AI models, Exa, Firecrawl)
 * - Deploy (push containerized services)
 * - Spending controls (policies on sub-wallets)
 */

const LOCUS_BASE_URL =
  process.env.LOCUS_API_URL || "https://beta.paywithlocus.com/api";

export interface LocusResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

class LocusClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.LOCUS_API_KEY || "";
    this.baseUrl = baseUrl || LOCUS_BASE_URL;

    if (!this.apiKey) {
      console.warn("LOCUS_API_KEY not set — Locus calls will fail");
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<LocusResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();

    if (!res.ok) {
      return { success: false, data: null as T, error: text };
    }

    // Guard against HTML responses (wrong URL, auth redirect, etc.)
    if (text.trimStart().startsWith("<")) {
      return { success: false, data: null as T, error: "Locus API returned HTML — check LOCUS_API_URL and credentials" };
    }

    try {
      const data = JSON.parse(text);
      return { success: true, data };
    } catch {
      return { success: false, data: null as T, error: `Invalid JSON response: ${text.slice(0, 100)}` };
    }
  }

  // ─── Wallets ──────────────────────────────────────────────

  async createWallet(label: string) {
    return this.request<{ id: string; address: string }>(
      "POST",
      "/wallets",
      { label }
    );
  }

  async getBalance(walletId: string) {
    return this.request<{ balance: number; currency: string }>(
      "GET",
      `/wallets/${walletId}/balance`
    );
  }

  async createSubWallet(parentWalletId: string, label: string, spendingCap: number) {
    return this.request<{ id: string; address: string }>(
      "POST",
      `/wallets/${parentWalletId}/sub-wallets`,
      { label, spending_cap: spendingCap }
    );
  }

  // ─── Spending Controls ────────────────────────────────────

  async setSpendingPolicy(walletId: string, maxPerTransaction: number, dailyLimit: number) {
    return this.request<{ policy_id: string }>(
      "POST",
      `/wallets/${walletId}/policies`,
      {
        max_per_transaction: maxPerTransaction,
        daily_limit: dailyLimit,
      }
    );
  }

  // ─── Transfers ────────────────────────────────────────────

  async transfer(fromWalletId: string, toAddress: string, amount: number, memo?: string) {
    return this.request<{ tx_id: string; status: string }>(
      "POST",
      "/transfers",
      {
        from_wallet_id: fromWalletId,
        to: toAddress,
        amount,
        currency: "USDC",
        memo,
      }
    );
  }

  // ─── Pay-Per-Use APIs ─────────────────────────────────────

  async callAI(model: string, messages: Array<{ role: string; content: string }>, walletId: string) {
    return this.request<{ response: string; cost: number }>(
      "POST",
      "/apis/ai/chat",
      {
        model,
        messages,
        wallet_id: walletId,
      }
    );
  }

  async callExa(query: string, walletId: string) {
    return this.request<{ results: Array<{ title: string; url: string; snippet: string }>; cost: number }>(
      "POST",
      "/apis/exa/search",
      {
        query,
        wallet_id: walletId,
      }
    );
  }

  // ─── Deploy ───────────────────────────────────────────────

  async deploy(config: {
    name: string;
    dockerfile: string;
    files: Record<string, string>;
    env?: Record<string, string>;
  }) {
    return this.request<{ deployment_id: string; url: string; status: string }>(
      "POST",
      "/deploy",
      config
    );
  }

  async getDeploymentStatus(deploymentId: string) {
    return this.request<{ status: string; url: string; logs?: string }>(
      "GET",
      `/deploy/${deploymentId}`
    );
  }

  // ─── x402 ────────────────────────────────────────────────

  async registerX402Endpoint(config: {
    endpoint_url: string;
    price_per_call: number;
    recipient_wallet_id: string;
    description: string;
  }) {
    return this.request<{ x402_id: string; payment_url: string }>(
      "POST",
      "/x402/register",
      config
    );
  }

  // ─── Agent Identity (ERC-8004) ────────────────────────────

  async registerAgent(config: {
    name: string;
    description: string;
    endpoint: string;
    wallet_id: string;
  }) {
    return this.request<{ agent_id: string; identity_token: string }>(
      "POST",
      "/agents/register",
      config
    );
  }

  // ─── Checkout ─────────────────────────────────────────────

  async createCheckoutSession(config: {
    amount: number;
    description: string;
    recipient_wallet_id: string;
    metadata?: Record<string, string>;
  }) {
    return this.request<{ session_id: string; checkout_url: string }>(
      "POST",
      "/checkout/sessions",
      config
    );
  }
}

// Singleton instance
export const locus = new LocusClient();
export { LocusClient };
