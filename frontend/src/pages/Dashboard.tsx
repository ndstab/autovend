import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { getDashboard, getBalance, createFundSession, type DashboardStats, type ApiRecord } from "../lib/api";

const CREATOR_ID = "demo_user";
const CREATOR_EMAIL = "creator@autovend.ai";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [apis, setApis] = useState<ApiRecord[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [canBuild, setCanBuild] = useState(false);
  const [buildCost, setBuildCost] = useState(1.50);
  const [locusBalance, setLocusBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fundingAmount, setFundingAmount] = useState(5);
  const [fundingLoading, setFundingLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    try {
      const [dashData, balData] = await Promise.all([
        getDashboard(CREATOR_ID),
        getBalance(CREATOR_ID),
      ]);
      setStats(dashData.stats);
      setApis(dashData.apis);
      setLocusBalance(dashData.wallet.balance);
      setBalance(balData.balance);
      setCanBuild(balData.can_build);
      setBuildCost(balData.build_cost);
    } catch {
      // retry on next tick
    } finally {
      setLoading(false);
    }
  }

  async function handleFundWallet() {
    setFundingLoading(true);
    // Open the window synchronously BEFORE the async call — Safari allows this
    const tab = window.open("about:blank", "_blank");
    try {
      const session = await createFundSession(CREATOR_ID, CREATOR_EMAIL, fundingAmount);
      if (tab) {
        tab.location.href = session.checkout_url;
      } else {
        // Fallback: redirect current tab
        window.location.href = session.checkout_url;
      }
    } catch (err) {
      tab?.close();
      console.error("Fund wallet failed:", err);
    } finally {
      setFundingLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawAddress || !locusBalance) return;
    setWithdrawLoading(true);
    try {
      await fetch("/api/dashboard/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_address: withdrawAddress, amount: locusBalance, memo: "AutoVend withdrawal" }),
      });
      setShowWithdraw(false);
      setWithdrawAddress("");
      setTimeout(loadAll, 2000);
    } catch (err) {
      console.error("Withdraw failed:", err);
    } finally {
      setWithdrawLoading(false);
    }
  }

  const revenue = stats?.total_revenue || 0;
  const costs = stats?.total_costs || 0;
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
          {/* Wallet balance banner */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Card className="border-accent/20">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-text-dim text-xs mb-1">autovend balance</div>
                  <div className="text-accent text-3xl font-bold">${balance.toFixed(2)}</div>
                  <div className="text-text-dim text-xs mt-1">
                    {canBuild
                      ? `can build ${Math.floor(balance / buildCost)} more API${Math.floor(balance / buildCost) !== 1 ? "s" : ""}`
                      : `need $${buildCost} to build`}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={fundingAmount}
                      onChange={(e) => setFundingAmount(Number(e.target.value))}
                      min={1}
                      step={1}
                      className="w-16 bg-bg border border-border text-text text-xs px-2 py-1 text-right"
                    />
                    <button
                      onClick={handleFundWallet}
                      disabled={fundingLoading}
                      className="px-3 py-1.5 bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-50 whitespace-nowrap"
                    >
                      {fundingLoading ? "..." : "FUND $USDC"}
                    </button>
                  </div>
                  {!canBuild && (
                    <span className="text-error text-xs">insufficient balance</span>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-text-dim text-xs mb-1">locus wallet balance</div>
                  <div className="text-text text-3xl font-bold">
                    {locusBalance !== null ? `$${locusBalance.toFixed(2)}` : "—"}
                  </div>
                  <div className="text-text-dim text-xs mt-1">earnings from API calls</div>
                </div>
                <button
                  onClick={() => setShowWithdraw(!showWithdraw)}
                  className="px-3 py-1.5 border border-border text-text-dim text-xs hover:text-text hover:border-border-bright"
                >
                  WITHDRAW
                </button>
              </div>

              {showWithdraw && (
                <div className="mt-4 pt-4 border-t border-border flex gap-2">
                  <input
                    type="text"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    placeholder="0x... destination wallet"
                    className="flex-1 bg-bg border border-border text-text text-xs px-3 py-1.5 placeholder:text-text-dim"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawLoading || !withdrawAddress}
                    className="px-3 py-1.5 bg-accent text-bg text-xs font-bold disabled:opacity-50"
                  >
                    {withdrawLoading ? "..." : "SEND"}
                  </button>
                </div>
              )}
            </Card>
          </div>

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
              <div className="text-text-dim text-xs mt-1">charged per build</div>
            </Card>
            <Card>
              <div className="text-text-dim text-xs mb-2">net margin</div>
              <div className={`text-2xl font-bold ${net >= 0 ? "text-success" : "text-error"}`}>
                {net >= 0 ? "+" : ""}${net.toFixed(2)}
              </div>
              <div className="text-text-dim text-xs mt-1">{net >= 0 ? "profit" : "loss"}</div>
            </Card>
            <Card>
              <div className="text-text-dim text-xs mb-2">total calls</div>
              <div className="text-text text-2xl font-bold">{stats?.total_calls || 0}</div>
              <div className="text-text-dim text-xs mt-1">
                across {stats?.total_apis || 0} API{(stats?.total_apis || 0) !== 1 ? "s" : ""}
              </div>
            </Card>
          </div>

          {/* APIs list */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-text-dim text-xs">// your_apis</span>
            <div className="flex-1 h-px bg-border" />
            <div className="flex items-center gap-3">
              <span className="text-text-dim text-xs">{apis.length} total</span>
              <button
                onClick={() => navigate("/build")}
                className="px-3 py-1 bg-accent text-bg text-xs font-bold hover:bg-accent/90"
              >
                + BUILD NEW
              </button>
            </div>
          </div>

          {apis.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <div className="text-text-dim text-sm mb-3">no APIs yet</div>
                <button
                  onClick={() => navigate("/build")}
                  className="text-accent text-xs hover:underline"
                >
                  build your first API →
                </button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {apis.map((api) => (
                <Card key={api.id} hover>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-text text-sm font-bold">{api.name || api.id}</span>
                        <StatusBadge status={api.status} />
                      </div>
                      <p className="text-text-dim text-xs truncate mb-2">{api.description}</p>
                      {api.endpoint && (
                        <div className="text-accent text-xs truncate font-mono">{api.endpoint}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-accent text-sm font-bold">${api.price_usd}/call</div>
                      <div className="text-text-dim text-xs mt-1">
                        build: ${api.build_cost.toFixed(2)}
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
