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

  // 2. Install dependencies
  const dir = getApiDir(apiId);
  console.log(`[deploy] Installing dependencies for ${name}...`);
  try {
    execSync(`pip3 install -r requirements.txt -q`, { cwd: dir, timeout: 60_000 });
    console.log(`[deploy] Dependencies installed`);
  } catch (err) {
    console.warn(`[deploy] pip install failed (continuing anyway):`, err);
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
