import { BrowserRouter, Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Landing from "./pages/Landing";
import Build from "./pages/Build";
import Dashboard from "./pages/Dashboard";
import Marketplace from "./pages/Marketplace";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg">
        <Nav />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/build" element={<Build />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
        </Routes>

        {/* Footer */}
        <footer className="border-t border-border py-6 mt-auto">
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
            <span className="text-text-dim text-xs">
              AutoVend — built on{" "}
              <a
                href="https://paywithlocus.com"
                target="_blank"
                rel="noopener"
                className="text-accent hover:underline"
              >
                Locus
              </a>
            </span>
            <span className="text-text-dim text-xs">
              Paygentic Hackathon 2026
            </span>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
