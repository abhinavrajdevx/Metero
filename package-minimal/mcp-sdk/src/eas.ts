// easPointers.ts
import { ethers } from "ethers";
import { EasParams, Easpointer, Hex } from "./types.js";
import { EAS_ADDRESS, RPC_URL } from "./constants.js";

/**
 * Reads settlement, escrow, and usdc from the EAS registry.
 * @param rpcUrl      JSON-RPC endpoint (e.g. http://127.0.0.1:8545)
 * @param easAddress  Deployed EAS contract address
 */
export async function getEasPointers(): Promise<Easpointer> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Minimal ABI: just the 3 public getters (solidity auto-generated)
  const EAS_ABI = [
    "function settlement() view returns (address)",
    "function escrow() view returns (address)",
    "function usdc() view returns (address)",
  ] as const;

  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, provider);

  const [settlement, escrow, usdc] = await Promise.all([
    eas.settlement() as Promise<Hex>,
    eas.escrow() as Promise<Hex>,
    eas.usdc() as Promise<Hex>,
  ]);

  return { settlement, escrow, usdc };
}
