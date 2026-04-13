/**
 * Locus API Client — built from the real skill.md
 *
 * Beta base URL: https://beta-api.paywithlocus.com
 * Production base URL: https://api.paywithlocus.com
 *
 * Auth: Bearer token with API key (starts with "claw_")
 * Wallet: one wallet per registered agent — no sub-wallet API
 *
 * Real endpoints used:
 *   GET  /api/pay/balance                     → wallet balance
 *   POST /api/pay/send                        → send USDC
 *   POST /api/pay/send-email                  → send USDC via email escrow
 *   GET  /api/pay/transactions                → tx history
 *   POST /api/wrapped/:provider/:endpoint     → pay-per-use wrapped APIs
 *   GET  /api/x402/endpoints/md              → list x402 endpoints
 *   POST /api/x402/:slug                      → call x402 endpoint
 *   POST /api/x402/call                       → call ad-hoc x402 URL
 *   GET  /api/checkout/agent/preflight/:id   → checkout preflight
 *   POST /api/checkout/agent/pay/:id         → pay checkout session
 *   GET  /api/apps/md                         → apps documentation
 *   POST /api/register                        → agent self-registration (no auth)
 */

const BASE_URL =
  process.env.LOCUS_API_URL || "https://beta-api.paywithlocus.com";

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
    this.baseUrl = baseUrl || BASE_URL;

    if (!this.apiKey) {
      console.warn("[locus] LOCUS_API_KEY not set — Locus calls will fail");
    } else if (!this.apiKey.startsWith("claw_")) {
      console.warn(
        "[locus] LOCUS_API_KEY doesn't start with 'claw_' — you may have the ownerPrivateKey instead of the API key. Run POST /api/register to get your real key."
      );
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    requiresAuth = true
  ): Promise<LocusResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (requiresAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return { success: false, data: null as T, error: String(err) };
    }

    const text = await res.text();

    if (!res.ok) {
      // Try to parse error JSON
      try {
        const parsed = JSON.parse(text);
        return { success: false, data: null as T, error: parsed.error || parsed.message || text };
      } catch {
        return { success: false, data: null as T, error: text };
      }
    }

    if (text.trimStart().startsWith("<")) {
      return {
        success: false,
        data: null as T,
        error: `Got HTML from ${path} — wrong base URL or unauthenticated redirect`,
      };
    }

    try {
      const parsed = JSON.parse(text);
      // Locus wraps everything in { success, data }
      if ("success" in parsed && "data" in parsed) {
        return parsed as LocusResponse<T>;
      }
      return { success: true, data: parsed };
    } catch {
      return { success: false, data: null as T, error: `Invalid JSON: ${text.slice(0, 100)}` };
    }
  }

  // ─── Registration (no auth) ────────────────────────────────

  /**
   * Self-register an agent — returns apiKey (claw_...) and ownerPrivateKey.
   * Call this once to get your real API key.
   */
  async register(name: string, email: string) {
    return this.request<{ apiKey: string; ownerPrivateKey: string; walletAddress: string }>(
      "POST",
      "/api/register",
      { name, email },
      false // no auth needed
    );
  }

  // ─── Wallet / Balance ─────────────────────────────────────

  async getBalance() {
    return this.request<{
      usdc_balance: string;
      wallet_address: string;
      chain: string;
      allowance: number | null;
    }>("GET", "/api/pay/balance");
  }

  async getStatus() {
    return this.request<{ walletStatus: string; walletAddress: string }>(
      "GET",
      "/api/status"
    );
  }

  // ─── Transfers ────────────────────────────────────────────

  async sendUsdc(toAddress: string, amount: number, memo: string) {
    return this.request<{ transaction_id: string; status: string; approval_url?: string }>(
      "POST",
      "/api/pay/send",
      { to_address: toAddress, amount, memo }
    );
  }

  async sendUsdcEmail(email: string, amount: number, memo: string, expiresInDays = 30) {
    return this.request<{ transaction_id: string; escrow_id: string; status: string }>(
      "POST",
      "/api/pay/send-email",
      { email, amount, memo, expires_in_days: expiresInDays }
    );
  }

  async getTransactions(limit = 50, offset = 0) {
    return this.request<{ transactions: unknown[]; pagination: unknown }>(
      "GET",
      `/api/pay/transactions?limit=${limit}&offset=${offset}`
    );
  }

  // ─── Wrapped APIs (pay-per-use) ───────────────────────────

  /**
   * Call any Locus-wrapped provider.
   * provider examples: "anthropic", "exa", "firecrawl", "openai", "gemini", "brave"
   * endpoint examples: "messages", "search", "scrape/crawlUrl", "chat/completions"
   */
  async callWrapped<T = unknown>(provider: string, endpoint: string, body: unknown) {
    return this.request<T>("POST", `/api/wrapped/${provider}/${endpoint}`, body);
  }

  /** Convenience: call Anthropic Claude via Locus */
  async callClaude(
    messages: Array<{ role: string; content: string }>,
    model = "claude-sonnet-4-20250514",
    maxTokens = 4096,
    system?: string
  ) {
    const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
    if (system) body.system = system;
    return this.callWrapped<{ content: Array<{ text: string }>; usage: unknown }>(
      "anthropic",
      "chat",
      body
    );
  }

  /** Convenience: call Exa search via Locus */
  async searchExa(query: string, numResults = 5) {
    return this.callWrapped<{ results: Array<{ title: string; url: string; text: string }>}>(
      "exa",
      "search",
      { query, numResults }
    );
  }

  // ─── x402 endpoints ──────────────────────────────────────

  async getX402EndpointsMd() {
    return this.request<string>("GET", "/api/x402/endpoints/md");
  }

  async callX402Slug(slug: string, body: unknown) {
    return this.request<unknown>("POST", `/api/x402/${slug}`, body);
  }

  async callX402Url(url: string, method: "GET" | "POST" = "POST", body?: unknown) {
    return this.request<unknown>("POST", "/api/x402/call", { url, method, body });
  }

  // ─── Checkout ─────────────────────────────────────────────

  async checkoutPreflight(sessionId: string) {
    return this.request<{ amount: number; currency: string; merchant: string }>(
      "GET",
      `/api/checkout/agent/preflight/${sessionId}`
    );
  }

  async checkoutPay(sessionId: string, payerEmail: string) {
    return this.request<{ transaction_id: string; status: string }>(
      "POST",
      `/api/checkout/agent/pay/${sessionId}`,
      { payerEmail }
    );
  }

  // ─── Apps (Build with Locus / deploy) ────────────────────

  async getAppsMd() {
    return this.request<string>("GET", "/api/apps/md");
  }
}

// Singleton
export const locus = new LocusClient();
export { LocusClient };
