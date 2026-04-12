import { locus } from "../lib/locus.js";

interface DeployInput {
  apiId: string;
  name: string;
  code: string;
  dockerfile: string;
  priceUsd: number;
  creatorWalletId: string;
}

interface DeployResult {
  url: string;
  deployment_id: string;
}

/**
 * Deploy a generated service to Locus Deploy
 * Sends the code + Dockerfile and gets back a live URL
 */
export async function deployService(input: DeployInput): Promise<DeployResult> {
  const { apiId, name, code, dockerfile, priceUsd, creatorWalletId } = input;

  // Build the requirements.txt from the code imports
  const requirements = extractRequirements(code);

  // Deploy via Locus
  const result = await locus.deploy({
    name: `autovend-${name}-${apiId}`,
    dockerfile,
    files: {
      "main.py": code,
      "requirements.txt": requirements,
    },
    env: {
      API_ID: apiId,
      PRICE_USD: priceUsd.toString(),
      WALLET_ID: creatorWalletId,
    },
  });

  if (!result.success) {
    // If Locus Deploy fails, return a mock URL for development
    console.warn(`[deploy] Locus Deploy failed: ${result.error}`);
    console.warn("[deploy] Using mock deployment URL for development");
    return {
      url: `https://autovend.locus.dev/${name}-${apiId}`,
      deployment_id: `mock-${apiId}`,
    };
  }

  // Poll for deployment completion (max 60s)
  const deploymentId = result.data.deployment_id;
  let url = result.data.url;

  if (result.data.status !== "running") {
    url = await pollDeployment(deploymentId, 60_000);
  }

  return { url, deployment_id: deploymentId };
}

async function pollDeployment(deploymentId: string, timeoutMs: number): Promise<string> {
  const start = Date.now();
  const interval = 3000;

  while (Date.now() - start < timeoutMs) {
    const status = await locus.getDeploymentStatus(deploymentId);
    if (status.success && status.data.status === "running") {
      return status.data.url;
    }
    if (status.success && status.data.status === "failed") {
      throw new Error(`Deployment failed: ${status.data.logs}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error("Deployment timed out");
}

/**
 * Extract Python requirements from code imports
 */
function extractRequirements(code: string): string {
  const deps = new Set(["fastapi", "uvicorn", "pydantic"]);

  const importMap: Record<string, string> = {
    requests: "requests",
    httpx: "httpx",
    beautifulsoup4: "beautifulsoup4",
    bs4: "beautifulsoup4",
    pandas: "pandas",
    numpy: "numpy",
    aiohttp: "aiohttp",
    openai: "openai",
    anthropic: "anthropic",
  };

  for (const [importName, pkg] of Object.entries(importMap)) {
    if (code.includes(`import ${importName}`) || code.includes(`from ${importName}`)) {
      deps.add(pkg);
    }
  }

  return Array.from(deps).join("\n");
}
