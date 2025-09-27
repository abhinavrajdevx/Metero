import { z } from "zod";
import { ethers } from "ethers";
import { CFG } from "./config.js";
import { EIP712_DOMAIN, EIP712_TYPES, escrow, settlement } from "./eth.js";
import { IOUs, pendingSumByPayer } from "./stores.js";
import { quotePrice6 } from "./pricing.js";
import { Service } from "./types.js";

export const DebitSchema = z.object({
  payer: z.string().length(42),
  provider: z.string().length(42),
  serviceId: z.string().length(66),
  amount: z.union([z.string(), z.number()]).transform(v => BigInt(v)),
  token: z.string().length(42),
  nonce: z.union([z.string(), z.number()]).transform(v => BigInt(v)),
  epoch: z.union([z.string(), z.number()]).transform(v => BigInt(v)),
  deadline: z.union([z.string(), z.number()]).transform(v => BigInt(v)),
});

export async function preflightVerify(
  debitRaw: unknown,
  signature: string,
  input: any,
  service: Service
) {
  const debit = DebitSchema.parse(debitRaw);

  // 1) token allow-list: for MVP just enforce exact USDC
  if (debit.token.toLowerCase() !== CFG.usdc.toLowerCase()) {
    throw new Error("token not allowed");
  }

  // 2) amount == quoted price
  const expected = quotePrice6(service, input);
  if (debit.amount !== expected) {
    throw new Error(`amount mismatch (expected ${expected}, got ${debit.amount})`);
  }

  // 3) deadline fresh
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (debit.deadline < now) throw new Error("signature expired");

  // 4) domain verify & recover EOA (for ERC-1271 you could add a call)
  const domain = await EIP712_DOMAIN();
  const recovered = ethers.verifyTypedData(domain, EIP712_TYPES as any, debit, signature);
  if (recovered.toLowerCase() !== debit.payer.toLowerCase()) throw new Error("bad signature");

  // 5) nonce / epoch must match on-chain view
  const expectedNonce = await settlement.nextNonce(debit.payer, debit.provider);
  if (debit.nonce !== BigInt(expectedNonce)) throw new Error("bad nonce");

  const expectedEpoch = await settlement.epoch(debit.payer);
  if (debit.epoch !== BigInt(expectedEpoch)) throw new Error("epoch mismatch");

  // 6) budget gate: stake - onchainUsed - pendingOffchain >= amount
  // For MVP we approximate onchainUsed as (total provider USDC received is not per user),
  // so just ensure escrow balance >= pending + amount (good enough for local demo).
  const stake = await escrow.balance(debit.payer);
  const pending = pendingSumByPayer(debit.payer);
  if (BigInt(stake) < pending + debit.amount) {
    throw new Error("insufficient escrow vs pending + amount");
  }

  return debit; // typed & validated
}
