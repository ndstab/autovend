import { locus } from "../lib/locus.js";

export async function getWalletBalance() {
  return locus.getBalance();
}

export async function withdraw(toAddress: string, amount: number, memo?: string) {
  return locus.sendUsdc(toAddress, amount, memo || "AutoVend withdrawal");
}

export async function sendToEmail(email: string, amount: number, memo: string) {
  return locus.sendUsdcEmail(email, amount, memo);
}
