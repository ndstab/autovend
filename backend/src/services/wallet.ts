import { locus } from "../lib/locus.js";

/**
 * Create a new wallet for a creator
 */
export async function createCreatorWallet(creatorId: string) {
  return locus.createWallet(`creator-${creatorId}`);
}

/**
 * Get wallet balance
 */
export async function getWalletBalance(walletId: string) {
  return locus.getBalance(walletId);
}

/**
 * Withdraw earnings — transfer USDC to an external address
 */
export async function withdraw(walletId: string, toAddress: string, amount: number) {
  return locus.transfer(walletId, toAddress, amount, "AutoVend withdrawal");
}

/**
 * Create a checkout session for funding a creator wallet
 */
export async function createFundingSession(walletId: string, amount: number) {
  return locus.createCheckoutSession({
    amount,
    description: "Fund your AutoVend wallet",
    recipient_wallet_id: walletId,
  });
}
