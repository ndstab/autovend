import { locus } from "../lib/locus.js";

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
}

export async function deployService(input: DeployInput): Promise<DeployResult> {
  const { apiId, name, code, dockerfile, requirements, priceUsd } = input;

  // Try Locus Apps deploy
  const appsMd = await locus.getAppsMd();
  if (appsMd.success) {
    console.log(`[${apiId}] Locus Apps available — attempting deploy`);
    // Apps deploy is documented per the returned appsMd
    // For now we fall through to mock until we parse the apps docs
  }

  // Mock deployment — generates a realistic URL
  console.log(`[deploy] Using mock deployment for ${name}-${apiId}`);
  console.log(`[deploy] Code length: ${code.length} chars, requirements: ${requirements.trim().split("\n").length} deps`);
  void priceUsd; // will be used when x402 is wired

  return {
    url: `https://autovend.locus.dev/${name}-${apiId}`,
    deployment_id: `mock-${apiId}`,
  };
}
