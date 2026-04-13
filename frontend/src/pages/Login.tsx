import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Card from "../components/Card";
import { useAuth } from "../lib/auth";

export default function Login({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // next can come from prop (route guard) or location.state (landing redirect)
  const destination = next || (location.state as { next?: string })?.next || "/dashboard";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    login(email.trim());

    // If there's a pending description from the landing page, forward it
    const pendingDesc = sessionStorage.getItem("autovend_pending_desc");
    if (destination === "/build" && pendingDesc) {
      sessionStorage.removeItem("autovend_pending_desc");
      navigate("/build", { state: { description: pendingDesc } });
    } else {
      navigate(destination);
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-24">
      <div className="text-text-dim text-xs mb-6">// sign in</div>

      <Card>
        <form onSubmit={handleSubmit}>
          <div className="text-text text-sm font-bold mb-1">
            Enter your email to get started
          </div>
          <p className="text-text-dim text-xs mb-6">
            No password needed. Your email is your identity on AutoVend.
          </p>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            className="w-full bg-bg border border-border text-text text-sm px-4 py-3 outline-none focus:border-accent/50 placeholder:text-text-dim/50 mb-4"
          />

          <button
            type="submit"
            disabled={!email.trim()}
            className="w-full px-4 py-3 bg-accent text-bg text-xs font-bold tracking-wide hover:bg-accent/90 disabled:opacity-30"
          >
            CONTINUE
          </button>
        </form>
      </Card>
    </div>
  );
}
