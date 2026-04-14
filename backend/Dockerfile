# ── Stage 1: build TypeScript ──────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: runtime with Node + Python ────────────────────────
FROM node:22-slim

# Install Python 3 + pip
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Pre-install base Python packages used by every generated API
RUN pip3 install --break-system-packages \
    fastapi uvicorn[standard] httpx pydantic requests

WORKDIR /app

# Copy built JS and production deps
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Data dir for SQLite + generated API files
RUN mkdir -p /app/data/apis

EXPOSE 3001

CMD ["node", "dist/index.js"]
