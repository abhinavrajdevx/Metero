import { ethers } from "ethers";
import type { Debit, ChainConfig, Hex } from "./types.js";
import { RPC_URL } from "./constants.js";

export const EIP712_TYPES = {
  Debit: [
    { name: "payer", type: "address" },
    { name: "provider", type: "address" },
    { name: "serviceId", type: "bytes32" },
    { name: "amount", type: "uint256" },
    { name: "token", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "epoch", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export async function eip712Domain(settelment: Hex) {
  const prov = new ethers.JsonRpcProvider(RPC_URL);
  const net = await prov.getNetwork();
  return {
    name: "MCPSettlement",
    version: "1",
    chainId: Number(net.chainId),
    verifyingContract: settelment,
  };
}

export async function signDebit(
  signer: ethers.Signer,
  settelment: Hex,
  debit: Debit
): Promise<Hex> {
  const domain = await eip712Domain(settelment);
  const sig = await (signer as any).signTypedData(domain, EIP712_TYPES, debit);
  return sig as Hex;
}

export async function verifyDebitSig(
  settelment: Hex,
  debit: Debit,
  signature: Hex
): Promise<string> {
  const domain = await eip712Domain(settelment);
  const recovered = ethers.verifyTypedData(
    domain,
    EIP712_TYPES as any,
    debit,
    signature
  );
  return recovered;
}
