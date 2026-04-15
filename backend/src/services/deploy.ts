import { execSync } from "child_process";
import { saveApiFiles, startApi, getApiDir, getBaseUrl } from "./executor.js";

interface DeployInput {
  apiId: string;
  name: string;
  code: string;
  dockerfile: string;
  requirements: string;
  priceUsd: number;
}

interface DeployResult {
  url: string;
  deployment_id: string;
  port: number;
}

export async function deployService(input: DeployInput): Promise<DeployResult> {
  const { apiId, name, code, dockerfile, requirements } = input;

  // 1. Save generated files to disk
  saveApiFiles(apiId, code, requirements, dockerfile);

  // 2. Install dependencies.
  //    Railway (and modern Debian-based images) run a PEP 668 managed Python
  //    where pip install to the system is blocked. We handle this with two
  //    strategies, tried in order:
  //      1. pip install --user --break-system-packages  (fast, works on Railway)
  //      2. python -m venv venv + venv/bin/pip install  (fallback, isolates deps)
  //
  //    The Dockerfile/nixpacks pre-installs fastapi / uvicorn / pydantic /
  //    httpx / requests so most APIs will succeed even if the per-API install
  //    fails. The executor prefers venv/bin/python when present.
  const dir = getApiDir(apiId);
  console.log(`[deploy] Installing dependencies for ${name}...`);

  const pipCmd = findPipCmd();
  let installed = false;

  if (pipCmd) {
    // Strategy 1: --user --break-system-packages (fast)
    try {
      execSync(
        `${pipCmd} install --user --break-system-packages --disable-pip-version-check -q -r requirements.txt`,
        { cwd: dir, timeout: 120_000, stdio: ["ignore", "ignore", "pipe"] }
      );
      console.log(`[deploy] Dependencies installed via "${pipCmd} install --user --break-system-packages"`);
      installed = true;
    } catch (err) {
      console.warn(`[deploy] --user --break-system-packages install failed — trying venv fallback`);
      console.warn(`[deploy] Error was: ${truncate(String((err as { stderr?: Buffer })?.stderr ?? err))}`);
    }
  }

  if (!installed) {
    // Strategy 2: create a venv inside the API dir and install there
    try {
      const pythonBin = findPython();
      execSync(`${pythonBin} -m venv venv`, { cwd: dir, timeout: 60_000, stdio: "ignore" });
      execSync(
        `venv/bin/pip install --disable-pip-version-check -q -r requirements.txt`,
        { cwd: dir, timeout: 180_000, stdio: ["ignore", "ignore", "pipe"] }
      );
      console.log(`[deploy] Dependencies installed into venv`);
      installed = true;
    } catch (err) {
      console.warn(
        `[deploy] venv install failed — relying on pre-installed base packages:`,
        truncate(String((err as { stderr?: Buffer })?.stderr ?? err))
      );
    }
  }

  // 3. Start the FastAPI process (uvicorn on a local port)
  console.log(`[deploy] Starting FastAPI process for ${name} (${apiId})...`);
  const port = await startApi(apiId);

  // 4. Construct the caller-facing URL. getBaseUrl() prefers AUTOVEND_BASE_URL,
  //    then infers from Railway / the first request, and only falls back to
  //    localhost if nothing else is available.
  const base = getBaseUrl();
  const url = `${base}/api/call/${apiId}`;

  console.log(`[deploy] ${name} live at ${url} (proxied to :${port})`);

  return {
    url,
    deployment_id: apiId,
    port,
  };
}

function findPipCmd(): string | null {
  for (const cmd of ["pip3", "pip", "python3 -m pip", "python -m pip"]) {
    try {
      execSync(`${cmd} --version`, { stdio: "ignore", timeout: 5_000 });
      return cmd;
    } catch {
      // try next
    }
  }
  return null;
}

function findPython(): string {
  for (const bin of ["python3", "python"]) {
    try {
      execSync(`${bin} --version`, { stdio: "ignore", timeout: 5_000 });
      return bin;
    } catch {
      // try next
    }
  }
  throw new Error("No python binary found");
}

function truncate(s: string, n = 300): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
