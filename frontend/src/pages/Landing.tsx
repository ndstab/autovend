import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { useAuth } from "../lib/auth";

const examples = [
  "An API that takes a job title and location, and returns an estimated salary range with confidence level",
  "An API that extracts structured data from any invoice text — line items, totals, dates, vendor",
  "An API that takes a company name and returns a competitive analysis summary",
  "An API that converts natural language dates ('next Tuesday', 'in 3 weeks') into ISO timestamps",
  "An API that takes a product description and generates SEO metadata — title, description, keywords",
];

const features = [
  {
    tag: "// codegen",
    title: "AI Builds It",
    desc: "Describe what you want in plain English. Our agent writes a production FastAPI service with types, validation, and error handling.",
  },
  {
    tag: "// deploy",
    title: "Auto-Deployed",
    desc: "Your API is containerized and deployed to Locus infrastructure. Live endpoint in under 60 seconds.",
  },
  {
    tag: "// monetize",
    title: "Pay-Per-Call",
    desc: "x402 protocol gates every endpoint. Callers pay USDC per request — no accounts, no subscriptions. You earn passively.",
  },
  {
    tag: "// earn",
    title: "USDC to Your Wallet",
    desc: "Revenue flows directly to your Locus smart wallet. Track earnings, costs, and net margin in real time. Withdraw anytime.",
  },
];

const stats = [
  { value: "x402", label: "payment protocol" },
  { value: "USDC", label: "on Base" },
  { value: "<60s", label: "to deploy" },
  { value: "8", label: "Locus features" },
];

export default function Landing() {
  const [description, setDescription] = useState("");
  const heroTarget = "Earn USDC while you sleep.";
  const [heroLine, setHeroLine] = useState(heroTarget);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&";
    const totalFrames = 32;
    let frame = 0;
    const timer = window.setInterval(() => {
      const settled = Math.floor((frame / totalFrames) * heroTarget.length);
      const next = heroTarget
        .split("")
        .map((char, i) => {
          if (char === " " || i < settled) return char;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");
      setHeroLine(next);
      frame += 1;
      if (frame > totalFrames) {
        window.clearInterval(timer);
        setHeroLine(heroTarget);
      }
    }, 42);

    return () => window.clearInterval(timer);
  }, []);

  function handleBuild() {
    if (!description.trim()) return;
    if (!user) {
      // Stash description in sessionStorage so Login can forward it
      sessionStorage.setItem("autovend_pending_desc", description);
      navigate("/login", { state: { next: "/build" } });
      return;
    }
    navigate("/build", { state: { description } });
  }

  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="ambient-bg" aria-hidden>
        <div className="ambient-orb ambient-orb-a" />
        <div className="ambient-orb ambient-orb-b" />
      </div>
      {/* Hero */}
      <section className="pt-24 pb-16">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-text-dim text-xs">// autovend v0.1</span>
          <span className="px-2 py-0.5 text-xs bg-accent-dim text-accent border border-accent/20">
            hackathon build
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
          Describe an API.
          <br />
          <span className="text-accent">{heroLine}</span>
        </h1>

        <p className="text-text-mid text-sm md:text-base max-w-2xl mb-12 leading-relaxed">
          Type what your API should do in plain English. An AI agent builds it,
          Locus deploys it, x402 makes it pay-per-call. You earn passively from
          every request.
        </p>

        {/* Input */}
        <div className="border border-border bg-bg-card max-w-3xl">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-error" />
            <span className="w-2 h-2 rounded-full bg-warning" />
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-dim text-xs ml-2">describe your API</span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="An API that takes a job title and returns estimated salary ranges..."
            className="w-full bg-transparent text-text text-sm p-4 resize-none outline-none placeholder:text-text-dim/50 min-h-[120px] font-[inherit]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) handleBuild();
            }}
          />
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-text-dim text-xs">
              {description.length > 0 ? `${description.length} chars` : "cmd+enter to build"}
            </span>
            <button
              onClick={handleBuild}
              disabled={!description.trim()}
              className="px-5 py-2 bg-accent text-bg text-xs font-bold tracking-wide hover:bg-accent/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              BUILD &amp; DEPLOY
            </button>
          </div>
        </div>

        {/* Example prompts */}
        <div className="mt-6 flex flex-wrap gap-2 max-w-3xl">
          <span className="text-text-dim text-xs mr-1 self-center">try:</span>
          {examples.slice(0, 3).map((ex, i) => (
            <button
              key={i}
              onClick={() => setDescription(ex)}
              className="text-xs px-3 py-1.5 border border-border text-text-dim hover:text-text hover:border-border-bright transition-colors truncate max-w-xs"
            >
              {ex.slice(0, 60)}...
            </button>
          ))}
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-border py-6 mb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-accent text-2xl font-bold">{s.value}</div>
              <div className="text-text-dim text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="pb-16">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-text-dim text-xs">// how_it_works</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <Card key={i} hover>
              <div className="text-text-dim text-xs mb-3">{f.tag}</div>
              <h3 className="text-text text-base font-bold mb-2">{f.title}</h3>
              <p className="text-text-dim text-xs leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pipeline visualization */}
      <section className="pb-16">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-text-dim text-xs">// pipeline</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="border border-border bg-bg-card p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-0 text-xs">
            {[
              { step: "01", label: "describe", icon: ">" },
              { step: "02", label: "parse + codegen", icon: "{}" },
              { step: "03", label: "deploy", icon: "^" },
              { step: "04", label: "x402 gate", icon: "$" },
              { step: "05", label: "earn USDC", icon: "+" },
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 flex-1 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-accent font-bold">{s.step}</span>
                  <span className="w-7 h-7 flex items-center justify-center border border-border-bright text-accent text-xs build-step-glow">
                    {s.icon}
                  </span>
                  <span className="text-text-mid">{s.label}</span>
                </div>
                {i < 4 && (
                  <span className="hidden md:block text-border-bright mx-2">———</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Money flow */}
      <section className="pb-24">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-text-dim text-xs">// money_flow</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <div className="text-accent text-xs mb-3">creator builds</div>
            <div className="text-text text-sm mb-2">You pay ~$1.50 to build</div>
            <div className="text-text-dim text-xs leading-relaxed">
              AI codegen costs ~$0.80 in API calls. AutoVend charges $1.50 total.
              Sub-wallet caps spending at $2 max.
            </div>
          </Card>
          <Card>
            <div className="text-accent text-xs mb-3">caller pays</div>
            <div className="text-text text-sm mb-2">$0.05 per API call</div>
            <div className="text-text-dim text-xs leading-relaxed">
              80% goes to you ($0.04). 20% to AutoVend ($0.01).
              No accounts needed — just a wallet and x402.
            </div>
          </Card>
          <Card>
            <div className="text-accent text-xs mb-3">you withdraw</div>
            <div className="text-text text-sm mb-2">USDC to your wallet</div>
            <div className="text-text-dim text-xs leading-relaxed">
              Earnings flow to your Locus smart wallet in real time.
              Pull to any external wallet whenever you want.
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
