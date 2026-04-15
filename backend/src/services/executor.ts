/**
 * executor.ts — manages running FastAPI processes for each deployed API.
 *
 * Each generated API runs as a real uvicorn subprocess on a random local port.
 * AutoVend proxies calls to them after collecting x402 payments.
 */

import { spawn, spawnSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Pick the Python binary to run the generated API with.
 * If the API has its own venv (created in deploy.ts as a PEP 668 fallback),
 * prefer that so isolated deps are used. Otherwise use system python.
 */
function findPython(apiDir?: string): string {
  if (apiDir) {
    const venvPython = path.join(apiDir, "venv", "bin", "python");
    if (fs.existsSync(venvPython)) return venvPython;
  }
  for (const bin of ["python3", "python", "python3.11", "python3.12"]) {
    const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return bin;
  }
  throw new Error("No Python binary found. Install Python 3 to run generated APIs.");
}

const APIS_DIR = process.env.APIS_DIR || "./data/apis";
const PORT_START = 4000;
const PORT_END = 4999;

/**
 * Resolve the public base URL that callers should hit for our proxy.
 * Priority:
 *   1. AUTOVEND_BASE_URL env var (explicit, preferred)
 *   2. RAILWAY_PUBLIC_DOMAIN (set automatically by Railway)
 *   3. An origin captured from an incoming HTTP request (setBaseUrl)
 *   4. http://localhost:$PORT (local dev)
 */
let inferredBaseUrl: string | null = null;

export function setBaseUrl(origin: string) {
  if (!origin) return;
  // Don't let request-host override an explicit env var
  if (process.env.AUTOVEND_BASE_URL) return;
  if (inferredBaseUrl) return;
  inferredBaseUrl = origin.replace(/\/+$/, "");
  console.log(`[executor] AUTOVEND_BASE_URL not set — inferred base URL from request: ${inferredBaseUrl}`);
}

export function getBaseUrl(): string {
  if (process.env.AUTOVEND_BASE_URL) return process.env.AUTOVEND_BASE_URL.replace(/\/+$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) return `https://${railway.replace(/\/+$/, "")}`;
  if (inferredBaseUrl) return inferredBaseUrl;
  return `http://localhost:${process.env.PORT || 3001}`;
}

interface RunningApi {
  port: number;
  process: ChildProcess;
  apiId: string;
  startedAt: number;
}

// In-memory registry of running processes
const running = new Map<string, RunningApi>();
const usedPorts = new Set<number>();

function pickFreePort(): number {
  for (let p = PORT_START; p <= PORT_END; p++) {
    if (!usedPorts.has(p)) return p;
  }
  throw new Error("No available ports in range 4000–4999");
}

export function getApiDir(apiId: string): string {
  return path.resolve(APIS_DIR, apiId);
}

/**
 * Write the generated FastAPI code to disk.
 */
export function saveApiFiles(
  apiId: string,
  code: string,
  requirements: string,
  dockerfile: string
): string {
  const dir = getApiDir(apiId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "main.py"), code);
  fs.writeFileSync(path.join(dir, "requirements.txt"), requirements);
  fs.writeFileSync(path.join(dir, "Dockerfile"), dockerfile);
  console.log(`[executor] Saved files for API ${apiId} → ${dir}`);
  return dir;
}

/**
 * Start a uvicorn process for the given API.
 * Returns the port the process is listening on.
 */
export async function startApi(apiId: string): Promise<number> {
  // Already running?
  const existing = running.get(apiId);
  if (existing) {
    console.log(`[executor] API ${apiId} already running on port ${existing.port}`);
    return existing.port;
  }

  const dir = getApiDir(apiId);
  if (!fs.existsSync(path.join(dir, "main.py"))) {
    throw new Error(`API files not found for ${apiId} — run saveApiFiles first`);
  }

  const port = pickFreePort();
  usedPorts.add(port);

  console.log(`[executor] Starting API ${apiId} on port ${port}...`);

  const pythonBin = findPython(dir);
  // Make sure --user installed packages (from Strategy 1 in deploy.ts) are
  // importable even when running from a different cwd. Python already adds
  // the user site-packages automatically but some PEP 668 images strip it.
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: "1" };
  const proc = spawn(
    pythonBin,
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(port), "--log-level", "warning"],
    {
      cwd: dir,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    }
  );

  proc.stdout?.on("data", (d) => console.log(`[api:${apiId}]`, d.toString().trim()));
  proc.stderr?.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[api:${apiId}]`, msg);
  });

  // CRITICAL: handle spawn errors (e.g. python3 not found) — without this
  // listener the unhandled 'error' event crashes the entire Node process.
  proc.on("error", (err) => {
    console.error(`[executor] Failed to spawn API ${apiId}:`, err.message);
    running.delete(apiId);
    usedPorts.delete(port);
  });

  proc.on("exit", (code) => {
    console.log(`[executor] API ${apiId} exited (code ${code})`);
    running.delete(apiId);
    usedPorts.delete(port);
  });

  running.set(apiId, { port, process: proc, apiId, startedAt: Date.now() });

  // Wait for the server to be ready (poll /health), watching for early exit
  try {
    await waitForReady(port, 15000, proc);
  } catch (err) {
    running.delete(apiId);
    usedPorts.delete(port);
    throw err;
  }

  console.log(`[executor] API ${apiId} ready on port ${port}`);
  return port;
}

/**
 * Stop a running API process.
 */
export function stopApi(apiId: string) {
  const entry = running.get(apiId);
  if (entry) {
    entry.process.kill("SIGTERM");
    running.delete(apiId);
    usedPorts.delete(entry.port);
    console.log(`[executor] Stopped API ${apiId}`);
  }
}

/**
 * Get the port for a running API (or null if not running).
 */
export function getPort(apiId: string): number | null {
  return running.get(apiId)?.port ?? null;
}

/**
 * Poll the /health endpoint until ready or timeout.
 * Also watches for early process exit.
 */
async function waitForReady(
  port: number,
  timeoutMs: number,
  proc?: ChildProcess
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  // Set up early-exit detection
  let exited = false;
  let exitCode: number | null = null;
  if (proc) {
    proc.once("exit", (code) => {
      exited = true;
      exitCode = code;
    });
  }

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`API process exited early (code ${exitCode}) — check requirements.txt or code syntax`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(300);
  }
  throw new Error(`API on port ${port} did not become ready within ${timeoutMs}ms`);
}

/**
 * Restart all live APIs on server boot (reads from data/apis/ + DB).
 */
export async function restartLiveApis(liveApiIds: string[]) {
  console.log(`[executor] Restarting ${liveApiIds.length} live APIs...`);
  for (const apiId of liveApiIds) {
    const dir = getApiDir(apiId);
    if (fs.existsSync(path.join(dir, "main.py"))) {
      try {
        await startApi(apiId);
      } catch (err) {
        console.warn(`[executor] Failed to restart API ${apiId}:`, err);
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
