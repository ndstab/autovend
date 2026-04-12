# AutoVend — Project Brief for Claude

## What We're Building

**AutoVend** is a platform where anyone can describe an API in plain English, and an AI agent builds it, deploys it, and monetizes it — automatically. The creator earns USDC per call while they sleep.

**One-liner:** Describe an API → AI builds it → Locus deploys it → x402 makes it pay-per-call → you earn USDC passively.

**Hackathon context:** Locus Paygentic Hackathon Week 1 (April 10–15, 2026). Theme: "Hack An Agent That Makes YOU Money." $1,000 prize. Judged on technical execution, real-world applicability, innovation, and agent autonomy.

---

## Why This Wins

1. **Theme fit is perfect** — passive USDC income is the literal product, not a side effect
2. **8 Locus features used naturally** — checkout, sub-wallets, spending controls, pay-per-use APIs, deploy, x402, smart wallets, transfers
3. **Demo is self-explanatory** — type a sentence, watch money arrive
4. **New category** — "natural language → deployed monetized API" doesn't exist as a product
5. **Technically deep** — codegen pipeline, deploy automation, x402 gate, sub-wallet cost accounting, agent identity

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│  React + TypeScript + Vite + TailwindCSS        │
│                                                  │
│  / (landing)     → describe your API            │
│  /build          → building progress + result   │
│  /dashboard      → earnings, costs, net margin  │
│  /marketplace    → browse all deployed APIs     │
└──────────────────────┬──────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────┐
│                   BACKEND                        │
│  Node.js + Express + TypeScript                 │
│                                                  │
│  POST /api/build       → trigger build pipeline │
│  GET  /api/apis        → list deployed APIs     │
│  GET  /api/dashboard   → earnings + cost data   │
│  POST /api/withdraw    → trigger USDC transfer  │
│  POST /webhooks/locus  → payment event handler  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              BUILD PIPELINE (Agent)              │
│                                                  │
│  1. Parse description → extract API spec        │
│  2. Codegen → FastAPI service (Python)          │
│  3. Add x402 middleware to endpoint             │
│  4. Generate Dockerfile                         │
│  5. Deploy → Locus Deploy (git push or API)     │
│  6. Register ERC-8004 agent identity            │
│  7. Return live endpoint URL                    │
└─────────────────────────────────────────────────┘
```

---

## Locus Feature Map (8 features, all load-bearing)

| Feature | Where Used | Why It's There |
|---|---|---|
| **Pay-per-use APIs** | Build pipeline — AI codegen + Exa research | Agent pays per model call while building |
| **Sub-wallets + Spending Controls** | Per-build budget cap ($2 max) | Agent cannot overspend building your API |
| **Locus Deploy** | Hosts every generated service | The live endpoint lives here |
| **x402 Protocol** | Payment gate on every deployed endpoint | Callers pay per call, no account needed |
| **ERC-8004 Agent Identity** | Assigned to each deployed API | First-class entity in the agent economy |
| **Smart Wallets** | Creator earnings + platform earnings | All revenue flows here automatically |
| **Checkout SDK** | Fund creator wallet + marketplace pay-to-try | Human-to-platform funding flow |
| **Transfers** | Creator withdrawal | Pull earned USDC to external wallet |

---

## Money Flow

```
CREATOR:
  Creator funds wallet → Locus Checkout
  Build pipeline runs → sub-wallet charged (e.g. $1.50)
  Platform build cost: ~$0.80 → AutoVend keeps $0.70 markup

CALLER (per API call):
  Caller pays x402 → e.g. $0.05/call
  80% ($0.04) → Creator's smart wallet
  20% ($0.01) → AutoVend platform wallet

CREATOR WITHDRAWAL:
  Creator pulls earnings → Locus Transfer → their wallet
```

---

## Tech Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Build:** Vite
- **Styling:** TailwindCSS
- **Locus SDK:** `@withlocus/checkout-react`

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express + TypeScript
- **Database:** SQLite (via better-sqlite3) — simple, no infra needed for MVP
- **Locus:** Locus REST API (direct HTTP calls with API key)

### Generated Services (what gets deployed)
- **Language:** Python 3.11
- **Framework:** FastAPI
- **x402:** Locus x402 middleware
- **Container:** Docker (auto-generated Dockerfile)

---

## Project Structure

```
/
├── CLAUDE.md                  ← this file
├── frontend/                  ← React app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx    ← describe your API
│   │   │   ├── Build.tsx      ← building progress
│   │   │   ├── Dashboard.tsx  ← earnings dashboard
│   │   │   └── Marketplace.tsx← browse all APIs
│   │   ├── components/
│   │   └── lib/
│   ├── package.json
│   └── vite.config.ts
├── backend/                   ← Express API
│   ├── src/
│   │   ├── index.ts           ← entry point
│   │   ├── routes/
│   │   │   ├── build.ts       ← build pipeline trigger
│   │   │   ├── apis.ts        ← list/manage deployed APIs
│   │   │   ├── dashboard.ts   ← earnings data
│   │   │   └── webhooks.ts    ← Locus payment events
│   │   ├── services/
│   │   │   ├── codegen.ts     ← AI codegen via Locus pay-per-use
│   │   │   ├── deploy.ts      ← Locus Deploy integration
│   │   │   ├── wallet.ts      ← Locus wallet/transfer operations
│   │   │   └── x402.ts        ← x402 payment gate setup
│   │   ├── db/
│   │   │   └── schema.ts      ← SQLite schema + queries
│   │   └── lib/
│   │       └── locus.ts       ← Locus API client wrapper
│   ├── package.json
│   └── tsconfig.json
└── templates/                 ← generated service templates
    ├── fastapi_base.py        ← base FastAPI template
    ├── x402_middleware.py     ← x402 payment gate
    └── Dockerfile.template    ← Docker template
```

---

## Database Schema (SQLite)

```sql
-- Deployed APIs
CREATE TABLE apis (
  id          TEXT PRIMARY KEY,
  creator_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  endpoint    TEXT,               -- live URL after deploy
  price_usd   REAL DEFAULT 0.05, -- per-call price
  wallet_id   TEXT,               -- creator's sub-wallet id
  agent_id    TEXT,               -- ERC-8004 identity
  status      TEXT DEFAULT 'building', -- building | live | failed
  created_at  INTEGER DEFAULT (unixepoch())
);

-- Earnings per API
CREATE TABLE earnings (
  id         TEXT PRIMARY KEY,
  api_id     TEXT NOT NULL,
  amount     REAL NOT NULL,
  type       TEXT NOT NULL, -- 'call_revenue' | 'build_cost'
  caller     TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Platform users (simple, no auth complexity for MVP)
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE,
  wallet_id  TEXT,          -- Locus smart wallet id
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## Environment Variables

```env
# Backend
LOCUS_API_KEY=
LOCUS_WALLET_ID=           # platform wallet
ANTHROPIC_API_KEY=         # fallback if Locus pay-per-use unavailable
DATABASE_PATH=./data/autovend.db
PORT=3001

# Frontend
VITE_API_URL=http://localhost:3001
VITE_LOCUS_PUBLISHABLE_KEY=
```

---

## Build Pipeline (step by step)

```
User submits description
        ↓
1. PARSE  — LLM call: extract { name, inputs, outputs, logic, external_apis_needed }
            → deducted from creator sub-wallet (Locus pay-per-use AI)
            → sub-wallet has $2 spending cap (Locus spending control)
        ↓
2. RESEARCH (if needed) — Exa search for relevant data sources/context
            → pay-per-use Exa API via Locus
        ↓
3. CODEGEN — LLM call: generate FastAPI service from spec
            → inject x402 middleware
            → generate Dockerfile
        ↓
4. DEPLOY  — push to Locus Deploy (container)
            → get live endpoint URL
        ↓
5. IDENTITY — register ERC-8004 agent identity for deployed API
        ↓
6. ACTIVATE — update DB: status=live, endpoint=URL
            → notify creator
```

---

## Hackathon Build Priority (strict scope)

### Must Have (core loop — this is the demo)
- [ ] Landing page with description input
- [ ] Build pipeline: description → codegen → deploy → live endpoint
- [ ] x402 payment gate on deployed endpoint
- [ ] Creator earnings dashboard (calls, revenue, costs, net)
- [ ] Locus Checkout to fund wallet
- [ ] Sub-wallet per build with spending controls

### Should Have (strengthens the demo)
- [ ] Marketplace page listing all live APIs with pay-to-try
- [ ] Real-time build progress UI
- [ ] Withdrawal flow (Locus Transfer)
- [ ] ERC-8004 agent identity registration

### Nice to Have (only if time allows)
- [ ] Multiple pricing tiers per API
- [ ] API documentation auto-generation
- [ ] Creator profiles
- [ ] Usage analytics charts

### Explicitly Out of Scope
- Authentication (use a simple session/email for MVP)
- Custom domains
- API versioning
- Team/org features
- Mobile optimization

---

## Codegen Quality Strategy

The generated APIs must actually work. Scope them to deterministic, low-ambiguity tasks:

**High confidence (generate these well):**
- Data transformation (JSON → structured output)
- Text processing (extract, classify, summarize)
- Calculation/formula APIs
- External API wrappers (weather, currency, etc.)

**Lower confidence (warn user, attempt anyway):**
- APIs requiring proprietary data
- Real-time streaming
- Complex stateful workflows

The LLM prompt for codegen must include:
1. Clear FastAPI boilerplate structure
2. Required imports
3. x402 middleware injection point
4. Input validation with Pydantic
5. Error handling
6. A working test case

---

## Demo Script (for hackathon submission video)

1. Open AutoVend landing page
2. Type: *"An API that takes a job title and location, and returns an estimated salary range with confidence level"*
3. Hit "Build" — show build progress (parse → codegen → deploy)
4. Show the live endpoint URL
5. Make a test call → pay via x402 → get response
6. Open earnings dashboard → show $0.05 just arrived
7. Show the Locus wallet balance → it grew
8. "That's AutoVend. You described it. The agent built it. You're earning."

---

## Key Constraints and Rules

- All payments in USDC on Base
- Never hardcode API keys — always use environment variables
- The build agent must respect spending controls — never exceed $2 per build
- Deployed APIs must have x402 gate — non-negotiable for the revenue model
- Keep UI clean and minimal — judges are technical, they don't need animations
- The core loop must work end-to-end — polish is secondary to function

---

## References

- Locus Docs: https://docs.paywithlocus.com
- Locus Beta: https://beta.paywithlocus.com
- Locus Build/Deploy: https://beta.buildwithlocus.com
- Locus GitHub: https://github.com/locus-technologies
- x402 Protocol: https://github.com/coinbase/x402
- ERC-8004: Agent identity standard
- Checkout SDK: @withlocus/checkout-react
- Hackathon: https://paygentic-week1.devfolio.co
