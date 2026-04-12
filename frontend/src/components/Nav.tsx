import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "home" },
  { to: "/build", label: "build" },
  { to: "/dashboard", label: "dashboard" },
  { to: "/marketplace", label: "marketplace" },
];

export default function Nav() {
  const { pathname } = useLocation();

  return (
    <nav className="border-b border-border sticky top-0 z-50 bg-bg/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <span className="text-accent font-bold text-lg tracking-tighter">
            AutoVend
          </span>
          <span className="text-text-dim text-xs">// v0.1</span>
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
        </div>
      </div>
    </nav>
  );
}
