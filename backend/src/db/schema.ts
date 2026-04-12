import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH || "./data/autovend.db";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

export function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE,
      wallet_id  TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS apis (
      id          TEXT PRIMARY KEY,
      creator_id  TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT NOT NULL,
      endpoint    TEXT,
      price_usd   REAL DEFAULT 0.05,
      wallet_id   TEXT,
      agent_id    TEXT,
      status      TEXT DEFAULT 'building',
      build_cost  REAL DEFAULT 0,
      created_at  INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id         TEXT PRIMARY KEY,
      api_id     TEXT NOT NULL,
      amount     REAL NOT NULL,
      type       TEXT NOT NULL,
      caller     TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  console.log("Database initialized");
}

// ─── Query helpers ──────────────────────────────────────────

export function createApi(api: {
  id: string;
  creator_id: string;
  name: string;
  description: string;
  price_usd?: number;
  wallet_id?: string;
}) {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO apis (id, creator_id, name, description, price_usd, wallet_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(api.id, api.creator_id, api.name, api.description, api.price_usd || 0.05, api.wallet_id || null);
}

export function updateApiStatus(id: string, status: string, updates?: { endpoint?: string; agent_id?: string; build_cost?: number }) {
  const database = getDb();
  const sets = ["status = ?"];
  const values: unknown[] = [status];

  if (updates?.endpoint) { sets.push("endpoint = ?"); values.push(updates.endpoint); }
  if (updates?.agent_id) { sets.push("agent_id = ?"); values.push(updates.agent_id); }
  if (updates?.build_cost !== undefined) { sets.push("build_cost = ?"); values.push(updates.build_cost); }

  values.push(id);
  database.prepare(`UPDATE apis SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function getApisByCreator(creatorId: string) {
  const database = getDb();
  return database.prepare("SELECT * FROM apis WHERE creator_id = ? ORDER BY created_at DESC").all(creatorId);
}

export function getAllApis() {
  const database = getDb();
  return database.prepare("SELECT * FROM apis WHERE status = 'live' ORDER BY created_at DESC").all();
}

export function recordEarning(earning: { id: string; api_id: string; amount: number; type: string; caller?: string }) {
  const database = getDb();
  database.prepare(`
    INSERT INTO earnings (id, api_id, amount, type, caller)
    VALUES (?, ?, ?, ?, ?)
  `).run(earning.id, earning.api_id, earning.amount, earning.type, earning.caller || null);
}

export function getEarningsByApi(apiId: string) {
  const database = getDb();
  return database.prepare("SELECT * FROM earnings WHERE api_id = ? ORDER BY created_at DESC").all(apiId);
}

export function getDashboardStats(creatorId: string) {
  const database = getDb();
  const stats = database.prepare(`
    SELECT
      COUNT(DISTINCT a.id) as total_apis,
      SUM(CASE WHEN e.type = 'call_revenue' THEN e.amount ELSE 0 END) as total_revenue,
      SUM(CASE WHEN e.type = 'build_cost' THEN e.amount ELSE 0 END) as total_costs,
      COUNT(CASE WHEN e.type = 'call_revenue' THEN 1 END) as total_calls
    FROM apis a
    LEFT JOIN earnings e ON e.api_id = a.id
    WHERE a.creator_id = ?
  `).get(creatorId);
  return stats;
}
