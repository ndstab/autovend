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
      balance    REAL NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS apis (
      id            TEXT PRIMARY KEY,
      creator_id    TEXT NOT NULL,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL,
      endpoint      TEXT,
      price_usd     REAL DEFAULT 0.05,
      wallet_id     TEXT,
      agent_id      TEXT,
      status        TEXT DEFAULT 'building',
      build_cost    REAL DEFAULT 0,
      input_schema  TEXT,
      input_example TEXT,
      created_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id         TEXT PRIMARY KEY,
      api_id     TEXT NOT NULL,
      amount     REAL NOT NULL,
      type       TEXT NOT NULL,
      caller     TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id            TEXT PRIMARY KEY,
      creator_id    TEXT NOT NULL,
      session_id    TEXT UNIQUE NOT NULL,
      checkout_url  TEXT NOT NULL,
      amount        REAL NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    INTEGER DEFAULT (unixepoch())
    );
  `);

  // Migrate existing users table to add balance if missing
  try {
    database.exec(`ALTER TABLE users ADD COLUMN balance REAL NOT NULL DEFAULT 0`);
  } catch {
    // column already exists — fine
  }

  // Migrate apis table: add input_schema / input_example / last_error if missing
  for (const col of ["input_schema TEXT", "input_example TEXT", "last_error TEXT"]) {
    try {
      database.exec(`ALTER TABLE apis ADD COLUMN ${col}`);
    } catch {
      // column already exists — fine
    }
  }

  console.log("Database initialized");
}

// ─── Users ──────────────────────────────────────────────────

export function upsertUser(id: string, email?: string) {
  const database = getDb();
  database.prepare(`
    INSERT INTO users (id, email) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET email = COALESCE(excluded.email, users.email)
  `).run(id, email || null);
  return database.prepare("SELECT * FROM users WHERE id = ?").get(id) as {
    id: string; email: string | null; balance: number; created_at: number;
  };
}

export function getUser(id: string) {
  const database = getDb();
  return database.prepare("SELECT * FROM users WHERE id = ?").get(id) as {
    id: string; email: string | null; balance: number; created_at: number;
  } | undefined;
}

export function creditBalance(creatorId: string, amount: number) {
  const database = getDb();
  database.prepare(`
    UPDATE users SET balance = balance + ? WHERE id = ?
  `).run(amount, creatorId);
}

export function deductBalance(creatorId: string, amount: number): boolean {
  const database = getDb();
  const user = getUser(creatorId);
  if (!user || user.balance < amount) return false;
  database.prepare(`
    UPDATE users SET balance = balance - ? WHERE id = ?
  `).run(amount, creatorId);
  return true;
}

// ─── Deposits ────────────────────────────────────────────────

export function createDeposit(deposit: {
  id: string;
  creator_id: string;
  session_id: string;
  checkout_url: string;
  amount: number;
}) {
  const database = getDb();
  database.prepare(`
    INSERT INTO deposits (id, creator_id, session_id, checkout_url, amount)
    VALUES (?, ?, ?, ?, ?)
  `).run(deposit.id, deposit.creator_id, deposit.session_id, deposit.checkout_url, deposit.amount);
}

export function getDepositBySession(sessionId: string) {
  const database = getDb();
  return database.prepare("SELECT * FROM deposits WHERE session_id = ?").get(sessionId) as {
    id: string; creator_id: string; session_id: string; amount: number; status: string;
  } | undefined;
}

export function markDepositPaid(sessionId: string) {
  const database = getDb();
  database.prepare("UPDATE deposits SET status = 'paid' WHERE session_id = ?").run(sessionId);
}

// ─── APIs ─────────────────────────────────────────────────────

export function createApi(api: {
  id: string;
  creator_id: string;
  name: string;
  description: string;
  price_usd?: number;
  wallet_id?: string;
  build_cost?: number;
}) {
  const database = getDb();
  database.prepare(`
    INSERT INTO apis (id, creator_id, name, description, price_usd, wallet_id, build_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(api.id, api.creator_id, api.name, api.description, api.price_usd || 0.05, api.wallet_id || null, api.build_cost || 0);
}

export function updateApiStatus(id: string, status: string, updates?: {
  endpoint?: string; build_cost?: number;
  input_schema?: string; input_example?: string; last_error?: string | null;
}) {
  const database = getDb();
  const sets = ["status = ?"];
  const values: unknown[] = [status];

  if (updates?.endpoint)                 { sets.push("endpoint = ?");      values.push(updates.endpoint); }
  if (updates?.build_cost !== undefined) { sets.push("build_cost = ?");    values.push(updates.build_cost); }
  if (updates?.input_schema)             { sets.push("input_schema = ?");  values.push(updates.input_schema); }
  if (updates?.input_example)            { sets.push("input_example = ?"); values.push(updates.input_example); }
  if (updates?.last_error !== undefined) { sets.push("last_error = ?");    values.push(updates.last_error); }

  values.push(id);
  database.prepare(`UPDATE apis SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function getApisByCreator(creatorId: string) {
  const database = getDb();
  return database.prepare(`
    SELECT a.*,
      COALESCE((SELECT COUNT(*) FROM earnings e
                WHERE e.api_id = a.id AND e.type = 'call_revenue'), 0) AS call_count
    FROM apis a
    WHERE a.creator_id = ?
    ORDER BY a.created_at DESC
  `).all(creatorId);
}

export function getAllApis() {
  const database = getDb();
  // Sort by popularity (call count) first, then recency — so the marketplace
  // surfaces actually-used APIs at the top.
  return database.prepare(`
    SELECT a.*,
      COALESCE((SELECT COUNT(*) FROM earnings e
                WHERE e.api_id = a.id AND e.type = 'call_revenue'), 0) AS call_count
    FROM apis a
    WHERE a.status = 'live'
    ORDER BY call_count DESC, a.created_at DESC
  `).all();
}

// ─── Earnings ────────────────────────────────────────────────

export function recordEarning(earning: {
  id: string; api_id: string; amount: number; type: string; caller?: string;
}) {
  const database = getDb();
  database.prepare(`
    INSERT INTO earnings (id, api_id, amount, type, caller)
    VALUES (?, ?, ?, ?, ?)
  `).run(earning.id, earning.api_id, earning.amount, earning.type, earning.caller || null);
}

/** Remove all build_cost earnings for an API — used when refunding a failed build. */
export function deleteBuildCostEarnings(apiId: string) {
  const database = getDb();
  database.prepare("DELETE FROM earnings WHERE api_id = ? AND type = 'build_cost'").run(apiId);
}

export function getLiveApiIds(): string[] {
  const database = getDb();
  const rows = database.prepare("SELECT id FROM apis WHERE status = 'live'").all() as { id: string }[];
  return rows.map((r) => r.id);
}

export function getDashboardStats(creatorId: string) {
  const database = getDb();
  return database.prepare(`
    SELECT
      COUNT(DISTINCT a.id)                                              AS total_apis,
      COALESCE(SUM(CASE WHEN e.type = 'call_revenue' THEN e.amount ELSE 0 END), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN e.type = 'build_cost'   THEN ABS(e.amount) ELSE 0 END), 0) AS total_costs,
      COUNT(CASE WHEN e.type = 'call_revenue' THEN 1 END)              AS total_calls
    FROM apis a
    LEFT JOIN earnings e ON e.api_id = a.id
    WHERE a.creator_id = ?
  `).get(creatorId);
}
