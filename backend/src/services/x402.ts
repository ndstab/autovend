import { locus } from "../lib/locus.js";

/**
 * Register a deployed API endpoint with x402 payment gate
 * This makes the endpoint pay-per-call — callers must pay USDC to use it
 */
export async function setupPaymentGate(config: {
  endpointUrl: string;
  pricePerCall: number;
  recipientWalletId: string;
  apiDescription: string;
}) {
  return locus.registerX402Endpoint({
    endpoint_url: config.endpointUrl,
    price_per_call: config.pricePerCall,
    recipient_wallet_id: config.recipientWalletId,
    description: config.apiDescription,
  });
}
