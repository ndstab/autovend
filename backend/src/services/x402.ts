import { locus } from "../lib/locus.js";

/**
 * Call any x402-gated endpoint via Locus.
 * Locus handles the USDC payment automatically.
 */
export async function callX402(url: string, body?: unknown) {
  return locus.callX402Url(url, "POST", body);
}

/**
 * Call a registered x402 slug endpoint.
 */
export async function callX402Slug(slug: string, body: unknown) {
  return locus.callX402Slug(slug, body);
}

/**
 * Get the list of available x402 endpoints from Locus.
 */
export async function getX402Catalog() {
  return locus.getX402EndpointsMd();
}
