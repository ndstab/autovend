import { useState, useEffect } from "react";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { listApis, type ApiRecord } from "../lib/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function Marketplace() {
  const [apis, setApis] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApiRecord | null>(null);
  const [testInput, setTestInput] = useState<string>('{}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    listApis()
      .then((data) => setApis(data.apis))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function selectApi(api: ApiRecord) {
    const isSame = selected?.id === api.id;
    setSelected(isSame ? null : api);
    setTestResult(null);
    setTestError(null);
    if (!isSame) {
      const example = parseJsonOr<Record<string, unknown>>(api.input_example, null);
      setTestInput(example ? JSON.stringify(example, null, 2) : '{}');
    }
  }

  function parseJsonOr<T>(raw: string | null | undefined, fallback: T | null): T | null {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }

  async function runPayAndTry(api: ApiRecord) {
    if (!api.endpoint) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      // Parse/validate JSON before sending
      let body: unknown = {};
      try {
        body = testInput.trim() ? JSON.parse(testInput) : {};
      } catch {
        setTestError("Request body must be valid JSON");
        setTesting(false);
        return;
      }

      const testUrl = `${API_BASE}${new URL(api.endpoint).pathname}/test`;
      const res = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setTestError(json.error || json.details || `HTTP ${res.status}`);
      } else {
        setTestResult(JSON.stringify(json.result ?? json, null, 2));
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

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
              <div onClick={() => selectApi(api)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-text text-sm font-bold">
                    {api.name || api.id}
                  </span>
                  <StatusBadge status={api.status} />
                </div>
                <p className="text-text-dim text-xs leading-relaxed mb-3">
                  {api.description}
                </p>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-accent text-xs font-bold">
                    ${api.price_usd}/call
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-text-dim text-xs">
                      {api.call_count} {api.call_count === 1 ? "call" : "calls"}
                    </span>
                    {api.agent_id && (
                      <span className="text-text-dim text-xs">
                        agent: {api.agent_id.slice(0, 8)}...
                      </span>
                    )}
                  </div>
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

                  {(() => {
                    const schema = parseJsonOr<{ properties?: Record<string, { type?: string; description?: string }>; required?: string[] }>(api.input_schema, null);
                    if (!schema?.properties) return null;
                    const required = new Set(schema.required ?? []);
                    return (
                      <div>
                        <div className="text-text-dim text-xs mb-1">expected fields</div>
                        <div className="bg-bg border border-border px-3 py-2 text-xs font-mono space-y-1">
                          {Object.entries(schema.properties).map(([key, field]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-accent">{key}</span>
                              <span className="text-text-dim">:</span>
                              <span className="text-text-mid">{field?.type || "any"}</span>
                              {required.has(key) && <span className="text-error">*</span>}
                              {field?.description && (
                                <span className="text-text-dim truncate">— {field.description}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <div className="text-text-dim text-xs mb-1">request body (JSON)</div>
                    <textarea
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      className="w-full bg-bg border border-border px-3 py-2 text-text text-xs font-mono resize-none outline-none focus:border-accent/50 min-h-[90px]"
                      placeholder='{"key": "value"}'
                    />
                  </div>

                  <div>
                    <div className="text-text-dim text-xs mb-1">curl (production)</div>
                    <div className="bg-bg border border-border px-3 py-2 text-text-dim text-xs font-mono break-all">
                      curl -X POST {api.endpoint || "..."} \<br />
                      &nbsp;&nbsp;-H "X-Locus-Key: &lt;your-locus-api-key&gt;" \<br />
                      &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                      &nbsp;&nbsp;-d '{testInput}'
                    </div>
                  </div>

                  <button
                    onClick={() => runPayAndTry(api)}
                    disabled={testing}
                    className="w-full px-4 py-2 bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-50"
                  >
                    {testing ? "CALLING..." : `PAY & TRY — $${api.price_usd} USDC`}
                  </button>

                  {testError && (
                    <div className="text-error text-xs">{testError}</div>
                  )}

                  {testResult && (
                    <div>
                      <div className="text-text-dim text-xs mb-1">response</div>
                      <pre className="bg-bg border border-border px-3 py-2 text-success text-xs font-mono overflow-auto max-h-48">
                        {testResult}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
