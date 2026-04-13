import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Nav from "./components/Nav";
import Landing from "./pages/Landing";
import Build from "./pages/Build";
import Dashboard from "./pages/Dashboard";
import Marketplace from "./pages/Marketplace";
import Login from "./pages/Login";

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/build" element={user ? <Build /> : <Login next="/build" />} />
        <Route path="/dashboard" element={user ? <Dashboard /> : <Login next="/dashboard" />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/login" element={<Login />} />
      </Routes>

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
          <span className="text-text-dim text-xs">Paygentic Hackathon 2026</span>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-bg">
          <AppRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
