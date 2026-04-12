import { useState, useEffect } from "react";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { listApis, type ApiRecord } from "../lib/api";

export default function Marketplace() {
  const [apis, setApis] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApiRecord | null>(null);

  useEffect(() => {
    listApis()
      .then((data) => setApis(data.apis))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-text-dim text-xs">// marketplace</span>
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-dim text-xs">{apis.length} live APIs</span>
      </div>
      <p className="text-text-mid text-xs mb-8">
        Browse deployed APIs. Every endpoint is pay-per-call via x402 — no
        accounts needed.
      </p>

      {loading ? (
        <div className="text-text-dim text-sm animate-pulse">loading...</div>
      ) : apis.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="text-text-dim text-sm mb-2">no live APIs yet</div>
            <p className="text-text-dim text-xs mb-4">
              Be the first to deploy one.
            </p>
            <a
              href="/build"
              className="text-accent text-xs hover:underline"
            >
              build an API
            </a>
          </div>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {apis.map((api) => (
            <Card
              key={api.id}
              hover
              className={selected?.id === api.id ? "border-accent/30" : ""}
            >
              <div
                onClick={() => setSelected(selected?.id === api.id ? null : api)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-text text-sm font-bold">
                    {api.name || api.id}
                  </span>
                  <StatusBadge status={api.status} />
                </div>
                <p className="text-text-dim text-xs leading-relaxed mb-3">
                  {api.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-accent text-xs font-bold">
                    ${api.price_usd}/call
                  </span>
                  {api.agent_id && (
                    <span className="text-text-dim text-xs">
                      agent: {api.agent_id.slice(0, 8)}...
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {selected?.id === api.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {api.endpoint && (
                    <div>
                      <div className="text-text-dim text-xs mb-1">endpoint</div>
                      <div className="bg-bg border border-border px-3 py-2 text-accent text-xs break-all">
                        {api.endpoint}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-text-dim text-xs mb-1">
                      try it (x402 payment required)
                    </div>
                    <div className="bg-bg border border-border px-3 py-2 text-text-dim text-xs font-mono">
                      curl -X POST {api.endpoint || "..."}/run \<br />
                      &nbsp;&nbsp;-H "X-402-Payment: &lt;token&gt;" \<br />
                      &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                      &nbsp;&nbsp;-d '{"{}"}'
                    </div>
                  </div>

                  <button className="w-full px-4 py-2 bg-accent text-bg text-xs font-bold hover:bg-accent/90">
                    PAY &amp; TRY — ${api.price_usd} USDC
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
