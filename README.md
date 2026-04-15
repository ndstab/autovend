# AutoVend

> **Describe an API. Earn USDC while you sleep.**

AutoVend lets anyone ship a monetized API without writing a single line of code. Type what your API should do in plain English — an AI agent writes the FastAPI service, deploys it live, and gates every endpoint with x402 so callers pay USDC per request. You collect 80% of every call, passively.

Built for the [Locus Paygentic Hackathon](https://paygentic-week1.devfolio.co) · Week 1 · April 2026

---

## How It Works

```
You type:  "An API that extracts salary ranges from a job title and location"
                              ↓
          1. Exa research — finds public APIs, relevant libraries
          2. Locus-wrapped Claude — generates FastAPI service + Pydantic models
          3. Uvicorn subprocess — spins up on an isolated port
          4. x402 gate — every POST /run requires USDC payment via Locus
          5. Creator earns 80¢ of every $1 called, forever
```

---

## Architecture

```
┌─────────────────────────────────────┐
│  Frontend (React + Vite + Tailwind) │  deployed on Vercel
│  / landing  /build  /dashboard      │
│  /marketplace                       │
└──────────────┬──────────────────────┘
               │ REST
┌──────────────▼──────────────────────┐
│  Backend (Node + Express + SQLite)  │  deployed on Railway
│                                     │
│  POST /api/build      build pipeline│
│  GET  /api/apis       marketplace   │
│  POST /api/call/:id   x402 proxy    │
│  POST /api/call/:id/test  free test │
│  GET  /api/dashboard/:id  earnings  │
│  POST /api/checkout/fund  top-up    │
│  POST /api/dashboard/withdraw       │
│  POST /webhooks/locus  events       │
└──────────────┬──────────────────────┘
               │ subprocess
┌──────────────▼──────────────────────┐
│  Generated FastAPI services         │
│  (Python 3.11 · uvicorn · pydantic) │
│  One process per deployed API       │
│  Each on an isolated port (4000–4999│
└─────────────────────────────────────┘
```

---

## Locus Features Used

| Feature | Where |
|---|---|
| **Pay-per-use APIs** | Codegen: Claude + Exa calls paid per-token via Locus |
| **Checkout** | Creators top up their AutoVend balance via Locus checkout sessions |
| **x402 Protocol** | Every generated API endpoint is pay-per-call — callers send their Locus key, we pull USDC |
| **Transfers / Send** | Withdraw earnings to any wallet address; payment collection from callers |
| **Smart Wallet / Balance** | Platform wallet tracks Locus USDC balance in real time |
| **ERC-8004 Agent Identity** | Each deployed API registers its own on-chain agent identity via `POST /api/register` |

---

## Money Flow

```
CREATOR
  Fund balance     → Locus Checkout → AutoVend balance
  Trigger build    → $1.50 charged  → Locus pay-per-use AI pays ~$0.80 in API calls

CALLER (per API call)
  POST /api/call/:id  +  X-Locus-Key header
  → We pull $0.05 from caller's Locus wallet to platform wallet
  → 80% ($0.04) credited to creator's AutoVend balance
  → 20% ($0.01) kept by AutoVend

CREATOR WITHDRAWAL
  Dashboard → Withdraw → Locus Transfer → any wallet address
```

---

## Build Pipeline (step by step)

1. **Parse** — user description sent to Exa to surface relevant public APIs, libraries, and data formats
2. **Codegen** — enriched description + Exa context sent to Claude via Locus pay-per-use; returns FastAPI code + Pydantic models + input schema + working example
3. **Install** — `pip install --user --break-system-packages` (PEP 668 safe), venv fallback if needed
4. **Deploy** — `uvicorn` subprocess spawned on a free port (4000–4999); health-polled until ready
5. **x402 gate** — proxy at `/api/call/:id` handles USDC collection before forwarding to the subprocess
6. **Agent identity** — `POST /api/register` on Locus mints an ERC-8004 on-chain identity for the API
7. **Live** — DB updated, endpoint URL returned, creator starts earning

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS v4 |
| Backend | Node 22 · Express · TypeScript · better-sqlite3 |
| Generated services | Python 3.11 · FastAPI · Pydantic · uvicorn |
| Payments | Locus (x402, checkout, transfers, pay-per-use) |
| Hosting | Vercel (frontend) · Railway (backend + subprocesses) |

---

## Database Schema

```sql
-- Users (email-only auth, virtual balance)
users (id, email, balance, created_at)

-- Deployed APIs
apis (id, creator_id, name, description, endpoint, price_usd,
      agent_id, status, build_cost, input_schema, input_example,
      last_error, created_at)

-- Revenue + cost events
earnings (id, api_id, amount, type, caller, created_at)
  -- type: 'call_revenue' | 'build_cost'

-- Checkout deposit sessions
deposits (id, creator_id, session_id, checkout_url, amount, status, created_at)
```

---

## Environment Variables

### Backend (Railway)
```env
LOCUS_API_KEY=claw_...          # Locus agent API key
LOCUS_WALLET_ID=0x...           # Platform wallet address (receives call payments)
ANTHROPIC_API_KEY=sk-ant-...    # Fallback if Locus wrapped Claude unavailable
AUTOVEND_BASE_URL=https://...   # Public Railway URL (auto-inferred if unset)
ADMIN_SECRET=...                # Guards POST /api/dashboard/withdraw
DATABASE_PATH=./data/autovend.db
APIS_DIR=./data/apis
PORT=3001
```

### Frontend (Vercel)
```env
VITE_API_URL=https://your-railway-app.up.railway.app
VITE_ADMIN_SECRET=...           # Same as ADMIN_SECRET above
```

---

## Running Locally

```bash
# Backend
cd backend
cp .env.example .env   # fill in LOCUS_API_KEY, ANTHROPIC_API_KEY
npm install
npm run dev            # tsx watch — hot reload on :3001

# Frontend (separate terminal)
cd frontend
cp .env.example .env   # set VITE_API_URL=http://localhost:3001
npm install
npm run dev            # vite on :5173
```

Python 3.11+ must be available on PATH for generated APIs to run.

---

## API Reference

### Build a new API
```bash
POST /api/build
{ "description": "...", "creator_id": "user@example.com", "price_usd": 0.05 }
→ { "api_id": "abc123", "status": "building" }
```

### Poll build status
```bash
GET /api/build/:id/status
→ { "status": "building"|"live"|"failed", "endpoint": "...", "agent_id": "0x...", "input_schema": {...}, "last_error": "..." }
```

### Call a live API (paid)
```bash
POST /api/call/:id
X-Locus-Key: claw_...          # caller's Locus API key — $0.05 pulled automatically
Content-Type: application/json
{ ...API-specific input fields... }
```

### Free test call (UI / demo)
```bash
POST /api/call/:id/test
{ ...API-specific input fields... }
→ { "result": {...}, "cost": 0.05, "paid": false }
```

### Marketplace
```bash
GET /api/apis
→ { "apis": [ { ...ApiRecord, "call_count": 12 } ] }
```

### Fund balance
```bash
POST /api/checkout/fund
{ "creator_id": "...", "email": "...", "amount": 5 }
→ { "session_id": "...", "checkout_url": "https://checkout.locus.com/..." }
```

### Poll payment confirmation
```bash
GET /api/checkout/poll/:sessionId
→ { "paid": true|false, "balance": 3.50 }
```

### Withdraw
```bash
POST /api/dashboard/withdraw
X-Admin-Secret: ...
{ "to_address": "0x...", "amount": 1.50 }
```

---

## Key Design Decisions

**Why SQLite?** Zero infra, no connection pool, works perfectly for a single-process Railway deployment. WAL mode handles concurrent reads from the dashboard auto-refresh.

**Why subprocess instead of Docker-per-API?** Railway doesn't support Docker-in-Docker. Running uvicorn subprocesses on isolated ports is fast (~2s startup vs ~30s for containers), survives Railway restarts via `restartLiveApis()` on boot, and scales fine for demo-scale usage.

**Why virtual balance instead of Locus sub-wallets?** The Locus beta API doesn't expose a sub-wallet creation endpoint. The virtual balance in SQLite is functionally equivalent for the demo — creators top up via Locus Checkout, the balance is debited per build, and earnings are credited per call.

**PEP 668 / Railway Python** Railway's system Python blocks `pip install` without `--break-system-packages`. We try that flag first (fast, works on Railway), then fall back to creating a per-API `venv/` directory.

**x402 implementation** True x402 would have the FastAPI subprocess handle payment verification itself. For this MVP, payment is collected at the proxy layer (`POST /api/pay/send` using the caller's Locus key) before forwarding to the subprocess — same net result, simpler integration.

---

## Hackathon Context

- **Event:** Locus Paygentic Hackathon Week 1
- **Theme:** "Hack An Agent That Makes YOU Money"
- **Prize:** $1,000
- **Judging criteria:** Technical execution · Real-world applicability · Innovation · Agent autonomy
