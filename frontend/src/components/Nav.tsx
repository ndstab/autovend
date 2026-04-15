import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

const links = [
  { to: "/", label: "home" },
  { to: "/build", label: "build" },
  { to: "/dashboard", label: "dashboard" },
  { to: "/marketplace", label: "marketplace" },
];

export default function Nav() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-border sticky top-0 z-50 bg-bg/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <span className="text-accent font-bold text-lg tracking-tighter">
            AutoVend
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-1.5 text-xs no-underline transition-colors ${
                pathname === l.to
                  ? "text-accent bg-accent-dim"
                  : "text-text-dim hover:text-text"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {user ? (
            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-border">
              <span className="text-text-mid text-xs">{user.email}</span>
              <button
                onClick={logout}
                className="text-text-dim text-xs hover:text-error"
              >
                logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="ml-3 pl-3 border-l border-border text-accent text-xs no-underline hover:underline"
            >
              sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
