import { execSync } from "child_process";
import path from "path";
import { saveApiFiles, startApi, getApiDir } from "./executor.js";

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

// Base URL that callers hit — our proxy endpoint
const AUTOVEND_BASE =
  process.env.AUTOVEND_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

export async function deployService(input: DeployInput): Promise<DeployResult> {
  const { apiId, name, code, dockerfile, requirements } = input;

  // 1. Save generated files to disk
  saveApiFiles(apiId, code, requirements, dockerfile);

  // 2. Install dependencies — try pip3 then pip
  const dir = getApiDir(apiId);
  console.log(`[deploy] Installing dependencies for ${name}...`);
  const pipCmd = (() => {
    for (const cmd of ["pip3", "pip", "python3 -m pip", "python -m pip"]) {
      try {
        execSync(`${cmd} --version`, { stdio: "ignore", timeout: 5_000 });
        return cmd;
      } catch { /* try next */ }
    }
    return null;
  })();

  if (pipCmd) {
    try {
      execSync(`${pipCmd} install -r requirements.txt -q`, { cwd: dir, timeout: 90_000 });
      console.log(`[deploy] Dependencies installed via ${pipCmd}`);
    } catch (err) {
      console.warn(`[deploy] pip install failed (continuing anyway):`, err);
    }
  } else {
    console.warn(`[deploy] No pip executable found — proceeding without install`);
  }

  // 3. Start the FastAPI process (uvicorn on a local port)
  console.log(`[deploy] Starting FastAPI process for ${name} (${apiId})...`);
  const port = await startApi(apiId);

  // 3. The public URL is our proxy endpoint — which handles x402 payment
  const url = `${AUTOVEND_BASE}/api/call/${apiId}`;

  console.log(`[deploy] ${name} live at ${url} (proxied to :${port})`);

  return {
    url,
    deployment_id: apiId,
    port,
  };
}
