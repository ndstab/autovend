const API_BASE = import.meta.env.VITE_API_URL || "";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

// ─── Build ──────────────────────────────────────────────────

export function triggerBuild(description: string, creatorId: string, priceUsd?: number) {
  return request<{ api_id: string; status: string; message: string }>("POST", "/api/build", {
    description,
    creator_id: creatorId,
    price_usd: priceUsd,
  });
}

export function getActiveBuild(creatorId: string) {
  return request<{
    active: {
      id: string;
      name: string;
      description: string;
      status: string;
      endpoint: string | null;
      build_cost: number;
      created_at: number;
    } | null;
  }>("GET", `/api/build/active?creator_id=${encodeURIComponent(creatorId)}`);
}

export function getBuildStatus(apiId: string) {
  return request<{
    id: string;
    name: string;
    status: string;
    endpoint: string | null;
    build_cost: number;
  }>("GET", `/api/build/${apiId}/status`);
}

// ─── APIs ───────────────────────────────────────────────────

export interface ApiRecord {
  id: string;
  creator_id: string;
  name: string;
  description: string;
  endpoint: string | null;
  price_usd: number;
  wallet_id: string | null;
  agent_id: string | null;
  status: string;
  build_cost: number;
  created_at: number;
}

export function listApis() {
  return request<{ apis: ApiRecord[] }>("GET", "/api/apis");
}

export function listCreatorApis(creatorId: string) {
  return request<{ apis: ApiRecord[] }>("GET", `/api/apis/creator/${creatorId}`);
}

// ─── Dashboard ──────────────────────────────────────────────

export interface DashboardStats {
  total_apis: number;
  total_revenue: number;
  total_costs: number;
  total_calls: number;
}

export function getDashboard(creatorId: string) {
  return request<{
    stats: DashboardStats;
    apis: ApiRecord[];
    wallet: { balance: number | null; address: string | null };
  }>("GET", `/api/dashboard/${creatorId}`);
}

// ─── Checkout / Balance ─────────────────────────────────────

export function getBalance(creatorId: string) {
  return request<{ balance: number; build_cost: number; can_build: boolean }>(
    "GET", `/api/checkout/balance/${creatorId}`
  );
}

export function createFundSession(creatorId: string, email: string, amount: number) {
  return request<{ session_id: string; checkout_url: string; amount: number }>(
    "POST", "/api/checkout/fund",
    { creator_id: creatorId, email, amount }
  );
}

export function pollDeposit(sessionId: string) {
  return request<{ paid: boolean; balance: number; via?: string; diagnostics?: unknown }>(
    "GET", `/api/checkout/poll/${sessionId}`
  );
}

export function forceConfirmDeposit(sessionId: string) {
  return request<{ paid: boolean; balance: number; via?: string; error?: string }>(
    "POST", `/api/checkout/force-confirm/${sessionId}`
  );
}
