import { useState, useEffect } from "react";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { getDashboard, type DashboardStats, type ApiRecord } from "../lib/api";

const CREATOR_ID = "demo-creator";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [apis, setApis] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadDashboard() {
    try {
      const data = await getDashboard(CREATOR_ID);
      setStats(data.stats);
      setApis(data.apis);
    } catch {
      // will retry
    } finally {
      setLoading(false);
    }
  }

  const revenue = stats?.total_revenue || 0;
  const costs = Math.abs(stats?.total_costs || 0);
  const net = revenue - costs;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <span className="text-text-dim text-xs">// dashboard</span>
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-dim text-xs">auto-refresh 10s</span>
      </div>

      {loading ? (
        <div className="text-text-dim text-sm animate-pulse">loading...</div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="text-text-dim text-xs mb-2">total revenue</div>
              <div className="text-accent text-2xl font-bold">${revenue.toFixed(2)}</div>
              <div className="text-text-dim text-xs mt-1">USDC earned</div>
            </Card>
            <Card>
              <div className="text-text-dim text-xs mb-2">build costs</div>
              <div className="text-error text-2xl font-bold">-${costs.toFixed(2)}</div>
              <div className="text-text-dim text-xs mt-1">API + deploy fees</div>
            </Card>
            <Card>
              <div className="text-text-dim text-xs mb-2">net margin</div>
              <div className={`text-2xl font-bold ${net >= 0 ? "text-success" : "text-error"}`}>
                ${net.toFixed(2)}
              </div>
              <div className="text-text-dim text-xs mt-1">
                {net >= 0 ? "profit" : "loss"}
              </div>
            </Card>
            <Card>
              <div className="text-text-dim text-xs mb-2">total calls</div>
              <div className="text-text text-2xl font-bold">{stats?.total_calls || 0}</div>
              <div className="text-text-dim text-xs mt-1">
                across {stats?.total_apis || 0} API{(stats?.total_apis || 0) !== 1 ? "s" : ""}
              </div>
            </Card>
          </div>

          {/* Wallet actions */}
          <div className="flex gap-3 mb-8">
            <button className="px-4 py-2 bg-accent text-bg text-xs font-bold hover:bg-accent/90">
              FUND WALLET
            </button>
            <button className="px-4 py-2 border border-border text-text-dim text-xs hover:text-text hover:border-border-bright">
              WITHDRAW USDC
            </button>
          </div>

          {/* APIs list */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-text-dim text-xs">// your_apis</span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-text-dim text-xs">{apis.length} total</span>
          </div>

          {apis.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <div className="text-text-dim text-sm mb-3">no APIs yet</div>
                <a
                  href="/build"
                  className="text-accent text-xs hover:underline"
                >
                  build your first API
                </a>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {apis.map((api) => (
                <Card key={api.id} hover>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-text text-sm font-bold">
                          {api.name || api.id}
                        </span>
                        <StatusBadge status={api.status} />
                      </div>
                      <p className="text-text-dim text-xs truncate mb-2">
                        {api.description}
                      </p>
                      {api.endpoint && (
                        <div className="text-accent text-xs truncate">
                          {api.endpoint}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-accent text-sm font-bold">
                        ${api.price_usd}/call
                      </div>
                      <div className="text-text-dim text-xs mt-1">
                        cost: ${api.build_cost.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
