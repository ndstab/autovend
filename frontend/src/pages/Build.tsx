import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../components/Card";
import StatusBadge from "../components/StatusBadge";
import { triggerBuild, getBuildStatus, getBalance } from "../lib/api";

interface BuildStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

const CREATOR_ID = "demo_user"; // MVP: single user

export default function Build() {
  const location = useLocation();
  const navigate = useNavigate();
  const description = (location.state as { description?: string })?.description || "";

  const [_apiId, setApiId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<string>("idle");
  const [_balance, setBalance] = useState<number | null>(null);
  const [_canBuild, setCanBuild] = useState(true);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [buildCost, setBuildCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('{"city": "London"}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [inputDesc, setInputDesc] = useState(description);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);

  const [steps, setSteps] = useState<BuildStep[]>([
    { id: "parse", label: "Parsing description via Locus AI", status: "pending" },
    { id: "codegen", label: "Generating FastAPI service", status: "pending" },
    { id: "deploy", label: "Deploying Python runtime", status: "pending" },
    { id: "x402", label: "Wiring x402 payment gate", status: "pending" },
    { id: "identity", label: "Registering agent identity", status: "pending" },
    { id: "live", label: "Activating endpoint", status: "pending" },
  ]);

  // Load balance on mount
  useEffect(() => {
    getBalance(CREATOR_ID).then((b) => {
      setBalance(b.balance);
      setCanBuild(b.can_build);
    }).catch(() => {});
  }, []);

  // Auto-start build if description came from landing (fire once only)
  useEffect(() => {
    if (description && !hasStarted.current) {
      hasStarted.current = true;
      startBuild(description);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      stepTimers.current.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startBuild(desc: string) {
    setError(null);
    setApiStatus("building");
    setEndpoint(null);
    setBuildCost(0);
    setSteps((s) => s.map((step) => ({ ...step, status: "pending" })));

    // Simulate step progression
    simulateSteps();

    try {
      const result = await triggerBuild(desc, CREATOR_ID);
      setApiId(result.api_id);
      startPolling(result.api_id);
    } catch (err) {
      // Cancel step animation timers
      stepTimers.current.forEach(clearTimeout);
      setError(err instanceof Error ? err.message : "Build failed");
      setApiStatus("failed");
      // Mark active step as error
      setSteps((s) => s.map((step) => ({
        ...step,
        status: step.status === "active" ? "error" : step.status,
      })));
    }
  }

  function simulateSteps() {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    const delays = [500, 2000, 5000, 8000, 10000, 12000];
    steps.forEach((_, i) => {
      const t = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, j) => ({
            ...s,
            status: j < i ? "done" : j === i ? "active" : s.status,
          }))
        );
      }, delays[i]);
      stepTimers.current.push(t);
    });
  }

  async function runTest() {
    if (!endpoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const LOCUS_KEY = import.meta.env.VITE_LOCUS_API_KEY || "";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(LOCUS_KEY ? { "X-Locus-Key": LOCUS_KEY } : {}),
        },
        body: testInput,
      });
      const json = await res.json();
      setTestResult(JSON.stringify(json, null, 2));
    } catch (err) {
      setTestResult(`Error: ${err}`);
    } finally {
      setTesting(false);
    }
  }

  function startPolling(id: string) {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getBuildStatus(id);
        if (status.status === "live") {
          setApiStatus("live");
          setEndpoint(status.endpoint);
          setBuildCost(status.build_cost);
          setSteps((s) => s.map((step) => ({ ...step, status: "done" })));
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (status.status === "failed") {
          setApiStatus("failed");
          setError("Build pipeline failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <span className="text-text-dim text-xs">// build_pipeline</span>
        <div className="flex-1 h-px bg-border" />
        {apiStatus !== "idle" && <StatusBadge status={apiStatus} />}
      </div>

      {/* Input area (if no description) */}
      {!description && apiStatus === "idle" && (
        <Card className="mb-8">
          <div className="text-text-dim text-xs mb-3">describe your API</div>
          <textarea
            value={inputDesc}
            onChange={(e) => setInputDesc(e.target.value)}
            placeholder="An API that..."
            className="w-full bg-transparent text-text text-sm resize-none outline-none placeholder:text-text-dim/50 min-h-[100px] font-[inherit] mb-4"
          />
          <button
            onClick={() => startBuild(inputDesc)}
            disabled={!inputDesc.trim()}
            className="px-5 py-2 bg-accent text-bg text-xs font-bold hover:bg-accent/90 disabled:opacity-30"
          >
            BUILD &amp; DEPLOY
          </button>
        </Card>
      )}

      {/* Description */}
      {(description || apiStatus !== "idle") && (
        <Card className="mb-6">
          <div className="text-text-dim text-xs mb-2">input</div>
          <p className="text-text text-sm leading-relaxed">{description || inputDesc}</p>
        </Card>
      )}

      {/* Build steps */}
      {apiStatus !== "idle" && (
        <Card className="mb-6">
          <div className="text-text-dim text-xs mb-4">pipeline progress</div>
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="flex items-center gap-3">
                <div className="w-5 h-5 flex items-center justify-center text-xs">
                  {step.status === "done" && <span className="text-success">&#10003;</span>}
                  {step.status === "active" && (
                    <span className="text-accent animate-pulse">&#9679;</span>
                  )}
                  {step.status === "pending" && <span className="text-text-dim">&#9675;</span>}
                  {step.status === "error" && <span className="text-error">&#10007;</span>}
                </div>
                <span
                  className={`text-xs ${
                    step.status === "active"
                      ? "text-accent"
                      : step.status === "done"
                        ? "text-text-mid"
                        : "text-text-dim"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="mb-6 border-error/30">
          <div className="text-error text-xs mb-1">error</div>
          <p className="text-text text-sm">{error}</p>
        </Card>
      )}

      {/* Success */}
      {apiStatus === "live" && (
        <div className="space-y-4">
          <Card className="border-accent/20">
            <div className="text-accent text-xs mb-4">&#10003; deployed &amp; live</div>

            <div className="space-y-4">
              <div>
                <div className="text-text-dim text-xs mb-1">endpoint</div>
                <div className="bg-bg border border-border px-3 py-2 text-accent text-xs break-all font-mono">
                  POST {endpoint || "http://localhost:3001/api/call/..."}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-text-dim text-xs mb-1">build cost</div>
                  <div className="text-text text-lg font-bold">${buildCost.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-text-dim text-xs mb-1">price / call</div>
                  <div className="text-accent text-lg font-bold">$0.05</div>
                </div>
                <div>
                  <div className="text-text-dim text-xs mb-1">payment</div>
                  <div className="text-text-mid text-xs mt-1">X-Locus-Key header</div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => navigate("/dashboard")}
                  className="px-4 py-2 bg-accent text-bg text-xs font-bold hover:bg-accent/90"
                >
                  VIEW EARNINGS
                </button>
                <button
                  onClick={() => {
                    setApiId(null);
                    setApiStatus("idle");
                    setInputDesc("");
                    setTestResult(null);
                    setSteps((s) => s.map((step) => ({ ...step, status: "pending" })));
                  }}
                  className="px-4 py-2 border border-border text-text-dim text-xs hover:text-text hover:border-border-bright"
                >
                  BUILD ANOTHER
                </button>
              </div>
            </div>
          </Card>

          {/* Live test runner */}
          <Card>
            <div className="text-text-dim text-xs mb-3">try it — $0.05 per call</div>
            <div className="mb-3">
              <div className="text-text-dim text-xs mb-1">request body</div>
              <textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                className="w-full bg-bg border border-border px-3 py-2 text-text text-xs font-mono resize-none outline-none focus:border-accent/50 min-h-[60px]"
              />
            </div>
            <button
              onClick={runTest}
              disabled={testing}
              className="px-4 py-2 bg-surface border border-border text-text text-xs hover:border-accent/50 disabled:opacity-50 mb-3"
            >
              {testing ? "calling..." : "CALL API"}
            </button>
            {testResult && (
              <div>
                <div className="text-text-dim text-xs mb-1">response</div>
                <pre className="bg-bg border border-border px-3 py-2 text-success text-xs font-mono overflow-auto max-h-48">
                  {testResult}
                </pre>
              </div>
            )}
          </Card>

          {/* Curl example */}
          <Card>
            <div className="text-text-dim text-xs mb-2">curl example</div>
            <pre className="text-text-mid text-xs font-mono overflow-auto whitespace-pre-wrap">
{`curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "X-Locus-Key: <your-locus-api-key>" \\
  -d '${testInput}'`}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}
