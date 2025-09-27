import { ethers } from "ethers";
import { CFG } from "./config.js";

export const provider = new ethers.JsonRpcProvider(CFG.rpcUrl);
export const relayer = new ethers.Wallet(CFG.relayerPk, provider);

const ESCROW_ABI = [
  "function balance(address) view returns (uint256)",
  "function paused(address) view returns (bool)",
  "function unstakeAt(address) view returns (uint256)",
  "function deposit(uint256) external",
];

const SETTLEMENT_ABI = [
  "function nextNonce(address,address) view returns (uint256)",
  "function epoch(address) view returns (uint64)",
  "function settleBatch((address,address,bytes32,uint256,address,uint256,uint64,uint64)[],bytes[]) external",
];

export const escrow = new ethers.Contract(CFG.escrow, ESCROW_ABI, provider);
export const settlement = new ethers.Contract(CFG.settlement, SETTLEMENT_ABI, provider);

export const EIP712_DOMAIN = async () => {
  const net = await provider.getNetwork();
  return {
    name: "MCPSettlement",
    version: "1",
    chainId: Number(net.chainId),
    verifyingContract: CFG.settlement,
  } as const;
};

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
